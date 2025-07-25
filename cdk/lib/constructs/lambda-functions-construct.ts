import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as fs from 'fs';
import * as path from 'path';
import { FUNCTIONS_ROOT } from '@root';

/**
 * Configuration for a single Lambda function.
 */
export interface LambdaFunctionConfig {
  /**
   * The logical name of the Lambda function (used for referencing, not the actual function name).
   */
  name: string;

  /**
   * The name of the exported handler function, in the format "file.key".
   * @example "process-event.handler"
   */
  handler: string;

  /**
   * Optional. The amount of time that Lambda allows a function to run before stopping it.
   * @defaultValue Duration.seconds(30)
   */
  timeout?: cdk.Duration;

  /**
   * Optional. The amount of memory available to the function during execution.
   * @defaultValue 128
   */
  memorySize?: number;
  description?: string;
}

/**
 * Properties for the LambdaFunctionsConstruct.
 */
export interface LambdaFunctionsConstructProps {
  /**
   * An array of Lambda function configurations.
   */
  functions: LambdaFunctionConfig[];

  /**
   * Optional. The path to the directory containing the Lambda function code.
   * @defaultValue FUNCTIONS_ROOT fromm ../root.ts
   */
  codePath?: string;
}

/**
 * A construct that creates multiple Lambda functions with consistent configuration.
 *
 * @example
 * ```typescript
 * const lambdaFunctions = new LambdaFunctionsConstruct(this, 'MyLambdaFunctions', {
 *   functions: [
 *     { name: 'processEvent', handler: 'process-event.handler' },
 *     { name: 'sendNotification', handler: 'send-notification.handler', timeout: cdk.Duration.seconds(60) },
 *     { name: 'heavyComputation', handler: 'heavy-computation.handler', memorySize: 256 },
 *   ],
 *   // codePath is optional and defaults to FUNCTIONS_ROOT
 * });
 *
 * // Access individual functions
 * const processEventFunction = lambdaFunctions.functions['processEvent'];
 * const sendNotificationFunction = lambdaFunctions.functions['sendNotification'];
 *
 * // Use the functions in other constructs
 * new events.Rule(this, 'ProcessEventRule', {
 *   schedule: events.Schedule.rate(cdk.Duration.minutes(5)),
 *   targets: [new targets.LambdaFunction(processEventFunction)],
 * });
 * ```
 */
export class LambdaFunctionsConstruct extends Construct {
  /**
   * A record of created Lambda functions, keyed by their logical names.
   */
  public readonly functions: Record<string, lambda.Function> = {};

  constructor(scope: Construct, id: string, props: LambdaFunctionsConstructProps) {
    super(scope, id);

    const codePath = props.codePath || FUNCTIONS_ROOT;

    props.functions.forEach((funcConfig) => {
      const handlerParts = funcConfig.handler.split('.');
      const handlerFile = `${handlerParts[0]}.ts`; // Assuming the handler file has a .ts extension
      const handlerFilePath = path.resolve(codePath, handlerFile);
      const handlerName = handlerParts[1];

      if (!fs.existsSync(handlerFilePath)) {
        throw new Error(`Handler file ${handlerFilePath} does not exist.`);
      }
      const lambdaFunction = new NodejsFunction(this, funcConfig.name, {
        runtime: lambda.Runtime.NODEJS_LATEST,
        handler: handlerName,
        //code: lambda.Code.fromAsset(path.resolve(codePath)),
        entry: handlerFilePath,
        timeout: funcConfig.timeout || cdk.Duration.seconds(30),
        memorySize: funcConfig.memorySize || 256,
        tracing: lambda.Tracing.ACTIVE,
        description: funcConfig.description
      });
      // @TODO add Lambda Insights : https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Lambda-Insights-Getting-Started-clouddevelopmentkit.html
      this.functions[funcConfig.name] = lambdaFunction;
    });
  }
}
