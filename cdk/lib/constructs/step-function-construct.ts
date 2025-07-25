/**
 * Defines the StepFunctionConstruct class for creating AWS Step Functions,
 * including support for main State Machines with embedded State Machines.
 *
 * @example
 * To create a main State Machine with an embedded State Machine using this construct,
 * you need to create two Amazon States Language (ASL) JSON files:
 *
 * 1. The embedded State Machine (save as 'embedded-workflow.asl.json'):
 *
 * ```json
 * {
 *   "Comment": "An embedded workflow",
 *   "StartAt": "EmbeddedTask",
 *   "States": {
 *     "EmbeddedTask": {
 *       "Type": "Task",
 *       "Resource": "${EmbeddedLambdaFunction}",
 *       "End": true
 *     }
 *   }
 * }
 * ```
 *
 * 2. The main State Machine (save as 'main-workflow.asl.json'):
 *
 * ```json
 * {
 *   "Comment": "A main workflow with an embedded sub-workflow",
 *   "StartAt": "FirstState",
 *   "States": {
 *     "FirstState": {
 *       "Type": "Task",
 *       "Resource": "${FirstLambdaFunction}",
 *       "Next": "EmbeddedWorkflow"
 *     },
 *     "EmbeddedWorkflow": {
 *       "Type": "StateMachine",
 *       "StateMachine": "${EmbeddedWorkflowArn}",
 *       "Next": "FinalState"
 *     },
 *     "FinalState": {
 *       "Type": "Task",
 *       "Resource": "${FinalLambdaFunction}",
 *       "End": true
 *     }
 *   }
 * }
 * ```
 *
 * Note the use of placeholders like `${FirstLambdaFunction}` and `${EmbeddedWorkflowArn}`.
 * These will be automatically replaced with the actual ARNs when you use this construct.
 *
 * Then, in your CDK stack, create the State Machines in the correct order:
 *
 * ```typescript
 * // First, create the embedded State Machine
 * const embeddedStepFunction = new StepFunctionConstruct(this, 'EmbeddedStepFunction', {
 *   name: 'EmbeddedWorkflow',
 *   definitionFile: 'embedded-workflow.asl.json',
 *   lambdaFunctions: {
 *     EmbeddedLambda: embeddedLambdaFunction
 *   },
 *   role: embeddedStepFunctionRole,
 *   otherStepFunctions: {}
 * });
 *
 * // Then, create the main State Machine, referencing the embedded one
 * const mainStepFunction = new StepFunctionConstruct(this, 'MainStepFunction', {
 *   name: 'MainWorkflow',
 *   definitionFile: 'main-workflow.asl.json',
 *   lambdaFunctions: {
 *     FirstLambda: firstLambdaFunction,
 *     FinalLambda: finalLambdaFunction
 *   },
 *   role: mainStepFunctionRole,
 *   otherStepFunctions: {
 *     EmbeddedWorkflow: embeddedStepFunction.stateMachine
 *   }
 * });
 * ```
 *
 * This construct will load both ASL JSON files, replace the placeholders with actual
 * ARNs (including the embedded State Machine's ARN), and create both Step Functions in AWS.
 */

import * as cdk from 'aws-cdk-lib';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as eventbridge from 'aws-cdk-lib/aws-events';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import * as path from 'path';
import * as fs from 'fs';
import logger from '@utils/logger';
import { STATE_MACHINES_ROOT } from '@root';
import { sfnLogGroupName } from '@utils/cdk';
import { EventBridgeConfigManager } from 'shared-config';
import { RemovalPolicy } from 'aws-cdk-lib';

const eventBridgeConfig = EventBridgeConfigManager.getConfig();
/**
 * Properties for creating a StepFunctionConstruct
 */
export interface StepFunctionConstructProps {
  /** The name of the Step Function */
  name: string;
  /** The filename of the Step Function definition */
  definitionFile: string;
  /** A record of Lambda functions to be used in the Step Function */
  lambdaFunctions: Record<string, lambda.Function>;
  /** The IAM role to be used by the Step Function */
  role: iam.IRole;
  /** A record of other Step Functions that may be referenced */
  otherStepFunctions: IStepFunctions;

  eventBus: eventbridge.IEventBus;
  /** Optional DynamoDB table for state machine operations */
  table?: dynamodb.ITable;
}

/**
 * Interface for the stateMachines property.
 */
export interface IStepFunctions {
  [key: string]: sfn.StateMachine;
}

export class StepFunctionConstruct extends Construct {
  public readonly stateMachine: sfn.StateMachine;

  constructor(scope: Construct, id: string, props: StepFunctionConstructProps) {
    super(scope, id);

    const definition = this.loadAndUpdateDefinition(
      scope,
      props.definitionFile,
      props.lambdaFunctions,
      props.otherStepFunctions,
      props.eventBus,
      props.table,
    );

    const logGroup = new logs.LogGroup(this, 'StateMachineLogGroup', {
      logGroupName: sfnLogGroupName(this, props.name),
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.stateMachine = new sfn.StateMachine(this, 'StateMachine', {
      definitionBody: sfn.DefinitionBody.fromString(JSON.stringify(definition)),
      role: props.role,
      tracingEnabled: true,
      logs: {
        destination: logGroup,
        level: sfn.LogLevel.ALL,
        includeExecutionData: true,
      },
    });

    // Add permission to put events on the EventBus
    this.stateMachine.addToRolePolicy(new iam.PolicyStatement({
      actions: ['events:PutEvents'],
      resources: [props.eventBus.eventBusArn],
    }));
  }

  /**
   * Loads the Step Function definition from a file and updates resource ARNs.
   */
  private loadAndUpdateDefinition(
    scope: Construct,
    filename: string,
    lambdaFunctions: Record<string, lambda.Function>,
    otherStepFunctions: Record<string, sfn.StateMachine>,
    eventBus: eventbridge.IEventBus,
    table?: dynamodb.ITable,
  ): object {
    const definitionPath = path.join(STATE_MACHINES_ROOT, filename);
    const definitionString = fs.readFileSync(definitionPath, 'utf8');
    const definition = JSON.parse(definitionString);
    logger.debug(`loadAndUpdateDefinition : Loaded definition from ${filename}`);
    return this.updateResourceArns(scope, definition, lambdaFunctions, otherStepFunctions, eventBus, table);
  }

  /**
   * Updates resource ARNs in the Step Function definition.
   * @param definition - The Step Function definition as a JSON object.
   * @param lambdaFunctions - A record of Lambda functions to resolve ARNs for.
   * @param otherStepFunctions - A record of other Step Functions to resolve ARNs for.
   * @param scope - The construct scope, used to determine the current stack.
   * @returns The updated Step Function definition as an object.
   */
  private updateResourceArns(
    scope: Construct,
    definition: JSON,
    lambdaFunctions: Record<string, lambda.Function>,
    otherStepFunctions: Record<string, sfn.StateMachine> | undefined,
    eventBus: eventbridge.IEventBus,
    table?: dynamodb.ITable,
  ): object {
    const stack = cdk.Stack.of(scope);
    let stringified = JSON.stringify(definition);

    logger.debug(`updateResourceArns - Initial ASL content: ${stringified}`);

    stringified = stringified.replace('${AWS::Region}', stack.region).replace('${AWS::AccountId}', stack.account);

    logger.debug(`updateResourceArns - region/account : ${stringified}`);
    stringified = stringified.replace(/"\${EventBus}"/g, JSON.stringify(eventBus.eventBusName));

    stringified = stringified.replace('${Source}', eventBridgeConfig.sourceStepFunctions);

    if (table) {
      stringified = stringified.replace(/"\${DynamoDBTable}"/g, JSON.stringify(table.tableName));
      logger.debug(`updateResourceArns - DynamoDB table: ${table.tableName}`);
    }

    logger.debug(`updateResourceArns - eventBus : ${stringified}`);

    Object.entries(lambdaFunctions).forEach(([name, func]) => {
      const placeholder = `\${${name}Function}`;
      logger.debug(`Lambda Placeholder: ${placeholder}`);
      logger.debug(`Lambda ARN: ${func.functionArn}`);
      stringified = stringified.split(placeholder).join(func.functionArn);
    });

    logger.debug(`updateResourceArns - Functions: ${Object.keys(lambdaFunctions)}`);

    if (otherStepFunctions && Object.keys(otherStepFunctions).length > 0) {
      Object.entries(otherStepFunctions).forEach(([name, machine]) => {
        const placeholder = `\${${name}Arn}`;
        logger.debug(`StateMachine Placeholder: ${placeholder}`);
        logger.debug(`StateMachine ARN: ${machine.stateMachineArn}`);
        stringified = stringified.split(placeholder).join(machine.stateMachineArn);
      });
    }
    logger.debug(`updateResourceArns - otherStepFunctions: ${Object.keys(lambdaFunctions)}`);

    return JSON.parse(stringified);
  }
}
