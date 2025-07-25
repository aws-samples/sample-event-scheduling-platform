/**
 * Defines the OrchestrationStack class for setting up AWS infrastructure.
 */

import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as eventbridge from 'aws-cdk-lib/aws-events';
import * as pipes from 'aws-cdk-lib/aws-pipes';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { StepFunctionConstruct, IStepFunctions } from '@constructs/step-function-construct';
import { LambdaFunctionsConstruct } from '@constructs/lambda-functions-construct';
import * as eventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import { ApplicationConfigManager } from 'shared-config';

interface OrchestrationStackProps extends cdk.StackProps {
  readonly eventBus: eventbridge.IEventBus;
  table: dynamodb.Table;
}

export class OrchestrationStack extends cdk.Stack {
  private readonly lambdaFunctions: Record<string, lambda.Function> = {};
  public readonly stepFunctions: IStepFunctions;
  private readonly queue: sqs.Queue;
  private readonly eventBus: eventbridge.IEventBus;
  private readonly table: dynamodb.Table;
  public stepFunctionRole: iam.Role;

  constructor(scope: Construct, id: string, props: OrchestrationStackProps) {
    super(scope, id, props);
    this.eventBus = props.eventBus;
    this.queue = new sqs.Queue(this, 'queue', {});
    this.table = props.table; 
    

    const lambdaConstruct = new LambdaFunctionsConstruct(this, 'LambdaFunctions', {
      functions: [
        { name: 'prepareEvent', handler: 'orchestration-prepare-event.handler', memorySize: 256 },
        { name: 'ddbtosqs', handler: 'ddb-to-sqs-processor.handler', memorySize: 256 },
        { name: 'getScInfos', handler: 'service-catalog.handler', memorySize: 256 },
        { name: 'getSsmInfos', handler: 'ssm.handler', description: 'SSM Document Details', memorySize: 256 },
        { name: 'getProductPaths', handler: 'service-catalog.handler', memorySize: 256 },
      ],
    });

    this.lambdaFunctions = lambdaConstruct.functions;
    this.lambdaFunctions['prepareEvent'].addEnvironment('TABLE_NAME', props.table.tableName);
    this.lambdaFunctions['prepareEvent'].addEnvironment('SQS_QUEUE_URL', this.queue.queueUrl);
    this.lambdaFunctions['ddbtosqs'].addEnvironment('SQS_QUEUE_URL', this.queue.queueUrl);

    // Grant permissions to the lambda function
    props.table.grantReadData(this.lambdaFunctions['prepareEvent']);
    this.queue.grantSendMessages(this.lambdaFunctions['prepareEvent']);

    this.lambdaFunctions['ddbtosqs'].addEventSource(
      new eventSources.DynamoEventSource(props.table, {
        startingPosition: lambda.StartingPosition.TRIM_HORIZON,
        batchSize: 5,
        retryAttempts: 0,
      })
    );

    // Add CloudWatch Logs permissions
    this.lambdaFunctions['prepareEvent'].addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents'
        ],
        resources: ['arn:aws:logs:*:*:*']
      })
    );

    this.stepFunctions = this.createStateMachines();
    this.createEventBridgePipe();
    this.createEventBridgeRule();
    this.setupPermissions();
    this.addOutputs();
  }

  /**
   * Creates an EventBridge rule for daily event preparation.
   */
  private createEventBridgeRule(): void {
    const rule = new eventbridge.Rule(this, 'DailyPrepareEventRule', {
      schedule: eventbridge.Schedule.cron({ minute: '0', hour: '23' }),
    });

    rule.addTarget(new targets.LambdaFunction(this.lambdaFunctions['prepareEvent']));

    this.lambdaFunctions['prepareEvent'].addPermission('InvokeByEventBridge', {
      principal: new iam.ServicePrincipal('events.amazonaws.com'),
      sourceArn: rule.ruleArn,
    });

    this.queue.grantSendMessages(this.lambdaFunctions['prepareEvent']);
  }

  // EVENTBRIDGE PIPE BETWEEN SQS AND STATE MACHINE
  private createEventBridgePipe(): void {
    const pipeRole = new iam.Role(this, 'PipeRole', {
      assumedBy: new iam.ServicePrincipal('pipes.amazonaws.com'),
    });

    new pipes.CfnPipe(this, 'SQSToStepFunctionsPipe', {
      source: this.queue.queueArn,
      target: this.stepFunctions.MainWorkflow.stateMachineArn,
      roleArn: pipeRole.roleArn,
      sourceParameters: {
        sqsQueueParameters: {
          batchSize: 1,
          maximumBatchingWindowInSeconds: 0,
        },
      },
      targetParameters: {
        stepFunctionStateMachineParameters: {
          invocationType: 'FIRE_AND_FORGET',
        },
      },
    });
  
    // Grant necessary permissions
    this.queue.grantConsumeMessages(pipeRole);
    this.stepFunctions.MainWorkflow.grantStartExecution(pipeRole);
  }

  /**
   * Creates Step Functions state machines based on predefined configurations.
   */
  private createStateMachines(): IStepFunctions {
    const stateMachineConfigs = [
      { name: 'PrerollWorkflow', definitionFile: 'preroll-workflow.asl.json' },
      { name: 'DeploySSMWorkflow', definitionFile: 'deploy-ssm-workflow.asl.json' },
      { name: 'DeploySCWorkflow', definitionFile: 'deploy-sc-workflow.asl.json' },
      { name: 'DestroySSMWorkflow', definitionFile: 'destroy-ssm-workflow.asl.json' },
      { name: 'DestroySCWorkflow', definitionFile: 'destroy-sc-workflow.asl.json' },
      { name: 'PostrollWorkflow', definitionFile: 'postroll-workflow.asl.json' },
      { name: 'MainWorkflow', definitionFile: 'main-workflow.asl.json' },
    ];

    this.stepFunctionRole = new iam.Role(this, 'StepFunctionRole', {
      assumedBy: new iam.ServicePrincipal('states.amazonaws.com'),
      description: 'Role for Step Functions to access AWS services',
    });

    // Service Catalog permissions for provisioning products (tag-based security)
    this.stepFunctionRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'servicecatalog:ProvisionProduct',
        'servicecatalog:DescribeRecord',
      ],
      resources: [
        `arn:aws:catalog:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:product/*`
      ],
      conditions: {
        StringEquals: {
          [`aws:ResourceTag/${ApplicationConfigManager.getConfig().tagKey}`]: ApplicationConfigManager.getConfig().tagValue,
        },
      },
    }));

    // Service Catalog permissions for terminating provisioned products (no tag condition needed)
    // Provisioned products use a different ARN pattern and may not inherit tags
    this.stepFunctionRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'servicecatalog:TerminateProvisionedProduct',
      ],
      resources: [
        `arn:aws:servicecatalog:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:stack/*/*`
      ],
    }));

    this.stepFunctionRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'servicecatalog:DescribeRecord',
      ],
      resources: [
        `arn:aws:servicecatalog:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:record/*`,
        `arn:aws:servicecatalog:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:stack/*/*`
      ],
    }));
    // SSM permissions - separate policies for document and automation-definition resources
    // Document resources with tag-based conditions
    this.stepFunctionRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'ssm:StartAutomationExecution'
      ],
      resources: [
        `arn:aws:ssm:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:document/*`
      ],
      conditions: {
        StringEquals: {
          [`aws:ResourceTag/${ApplicationConfigManager.getConfig().tagKey}`]: ApplicationConfigManager.getConfig().tagValue,
        },
      },
    }));
    // Automation-definition resources without tag condition (as tags may not be properly inherited)
    this.stepFunctionRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'ssm:StartAutomationExecution'
      ],
      resources: [
        `arn:aws:ssm:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:automation-definition/*`
      ],
      // No tag condition for automation-definition resources
    }));
    // SSM GetAutomationExecution permission without tag condition
    // Automation executions don't inherit tags from the document, so we can't use tag-based conditions
    this.stepFunctionRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'ssm:GetAutomationExecution'
      ],
      resources: [
        `arn:aws:ssm:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:automation-execution/*`
      ],
      // No tag condition for automation-execution resources as they don't inherit document tags
    }));
    // Other permissions (no tag-based restrictions needed)
    // events actions are needed by Step Functions and include sub step functions
    this.stepFunctionRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'events:PutEvents',
        'events:CreateRule',
        'events:DeleteRule',
        'events:PutRule',
        'events:PutTargets',
        'events:RemoveTargets',
        'events:DescribeRule',
        'events:ListTargetsByRule',
        'lambda:InvokeFunction',
        'states:StartExecution',

      ],
      resources: ['*']
    }));
    
    // Specific PassRole permission for SSM assume role with tag-based security
    this.stepFunctionRole.addToPolicy(new iam.PolicyStatement({
      actions: ['iam:PassRole'],
      resources: [
        `arn:aws:iam::${cdk.Stack.of(this).account}:role/*`
      ],
      conditions: {
        StringEquals: {
          'iam:PassedToService': 'ssm.amazonaws.com',
          [`aws:ResourceTag/${ApplicationConfigManager.getConfig().tagKey}`]: ApplicationConfigManager.getConfig().tagValue,
        },
      },
    }));
    
    // Additional PassRole permission for SSM assume roles that might not have tags yet
    // This covers roles created by our register scripts or existing roles being integrated
    this.stepFunctionRole.addToPolicy(new iam.PolicyStatement({
      actions: ['iam:PassRole'],
      resources: [
        `arn:aws:iam::${cdk.Stack.of(this).account}:role/*SSM*`,
        `arn:aws:iam::${cdk.Stack.of(this).account}:role/*ssm*`,
        `arn:aws:iam::${cdk.Stack.of(this).account}:role/*Automation*`,
        `arn:aws:iam::${cdk.Stack.of(this).account}:role/*automation*`,
        `arn:aws:iam::${cdk.Stack.of(this).account}:role/${ApplicationConfigManager.getConfig().camelCase}-*`
      ],
      conditions: {
        StringEquals: {
          'iam:PassedToService': 'ssm.amazonaws.com',
        },
      },
    }));

    const sharedRole = new iam.Role(this, 'SharedStateMachineRole', {
      assumedBy: new iam.ServicePrincipal('states.amazonaws.com'),
    });

    sharedRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['states:StartExecution'],
        resources: ['*'],
      }),
    );


    this.stepFunctionRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['events:PutEvents'],
        resources: [this.eventBus.eventBusArn],
      }),
    );

    // PassRole for Step Function self-invocation (explicit ARN - guaranteed to work)
    this.stepFunctionRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['iam:PassRole'],
        resources: [this.stepFunctionRole.roleArn],
        conditions: {
          StringEquals: {
            'iam:PassedToService': 'states.amazonaws.com',
          },
        },
      }),
    );

    // PassRole for user-registered SSM automation roles (tag-based)
    this.stepFunctionRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['iam:PassRole'],
        resources: [`arn:aws:iam::${cdk.Stack.of(this).account}:role/*`],
        conditions: {
          StringEquals: {
            [`aws:ResourceTag/${ApplicationConfigManager.getConfig().tagKey}`]: ApplicationConfigManager.getConfig().tagValue,
            'iam:PassedToService': 'ssm.amazonaws.com',
          },
        },
      }),
    );

    // PassRole for user-registered Service Catalog launch roles (tag-based)
    this.stepFunctionRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['iam:PassRole'],
        resources: [`arn:aws:iam::${cdk.Stack.of(this).account}:role/*`],
        conditions: {
          StringEquals: {
            [`aws:ResourceTag/${ApplicationConfigManager.getConfig().tagKey}`]: ApplicationConfigManager.getConfig().tagValue,
            'iam:PassedToService': 'servicecatalog.amazonaws.com',
          },
        },
      }),
    );

    // PassRole for AWS-managed Service Catalog roles (cannot be tagged)
    this.stepFunctionRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['iam:PassRole'],
        resources: [
          `arn:aws:iam::${cdk.Stack.of(this).account}:role/service-role/AWSServiceCatalog*`,
          `arn:aws:iam::${cdk.Stack.of(this).account}:role/service-role/CloudFormation*`,
        ],
        conditions: {
          StringEquals: {
            'iam:PassedToService': [
              'servicecatalog.amazonaws.com',
              'cloudformation.amazonaws.com',
            ],
          },
        },
      }),
    );

    const createdStepFunctions: IStepFunctions = {};

    stateMachineConfigs.forEach((config) => {
      const stepFunction = new StepFunctionConstruct(this, `${config.name}Construct`, {
        name: config.name,
        definitionFile: config.definitionFile,
        lambdaFunctions: this.lambdaFunctions,
        role: this.stepFunctionRole,
        otherStepFunctions: createdStepFunctions,
        eventBus: this.eventBus,
        table: this.table,
      });
      createdStepFunctions[config.name] = stepFunction.stateMachine;
    });

    return createdStepFunctions;
  }

  private setupPermissions(): void {
    Object.values(this.lambdaFunctions).forEach((func) => {
      this.queue.grantSendMessages(func);
      this.queue.grantConsumeMessages(func);
      // Service Catalog permissions - list operations without conditions
      func.addToRolePolicy(
        new iam.PolicyStatement({
          actions: [
            'servicecatalog:ListPortfolios',
            'servicecatalog:SearchProducts',
          ],
          resources: ['*'], // List operations require wildcard and don't support conditions
        })
      );
      func.addToRolePolicy(
        new iam.PolicyStatement({
          actions: [
            'servicecatalog:DescribeProductAsAdmin',
            'servicecatalog:DescribeProduct',
            'servicecatalog:DescribeProvisioningParameters',
            'servicecatalog:DescribeProvisioningArtifact',
            'servicecatalog:TerminateProvisionedProduct'
          ],
          resources: [
            `arn:aws:catalog:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:product/*`
          ],
          conditions: {
            StringEquals: {
              [`aws:ResourceTag/${ApplicationConfigManager.getConfig().tagKey}`]: ApplicationConfigManager.getConfig().tagValue,
            },
          },
        })
      );
      func.addToRolePolicy(
        new iam.PolicyStatement({
          actions: [
            'servicecatalog:ListLaunchPaths',
          ],
          resources: ['*'], // ListLaunchPaths requires wildcard and doesn't support conditions
        })
      );
      // SSM permissions - list operations without conditions
      func.addToRolePolicy(
        new iam.PolicyStatement({
          actions: [
            'ssm:ListDocuments'
          ],
          resources: ['*'], // ListDocuments requires wildcard and doesn't support conditions
        })
      );
      func.addToRolePolicy(
        new iam.PolicyStatement({
          actions: [
            'ssm:DescribeDocument',
            'ssm:GetDocument',
            'ssm:ListDocumentVersions'
          ],
          resources: [
            `arn:aws:ssm:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:document/*`
          ],
          conditions: {
            StringEquals: {
              [`aws:ResourceTag/${ApplicationConfigManager.getConfig().tagKey}`]: ApplicationConfigManager.getConfig().tagValue,
            },
          },
        })
      );
    });

    const sharedRole = this.getSharedStateMachineRole();
    if (sharedRole) {
      this.table.grantReadData(sharedRole); // Grant read access
      this.table.grantWriteData(sharedRole);
      // Grant invoke permissions to Lambda functions
      Object.values(this.lambdaFunctions).forEach((func) => {
        func.grantInvoke(sharedRole);
      });

      // Grant consume messages permission to the queue
      this.queue.grantConsumeMessages(sharedRole);

      // Add SSM permission for StartAutomationExecution with tag-based conditions
      (sharedRole as iam.Role).addToPrincipalPolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['ssm:StartAutomationExecution'],
          resources: [
            `arn:aws:ssm:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:document/*`
          ],
          conditions: {
            StringEquals: {
              [`aws:ResourceTag/${ApplicationConfigManager.getConfig().tagKey}`]: ApplicationConfigManager.getConfig().tagValue,
            },
          },
        })
      );

      sharedRole.addToPrincipalPolicy(
        new iam.PolicyStatement({
          actions: [
            'servicecatalog:ProvisionProduct',
            'servicecatalog:TerminateProvisionedProduct',
          ],
          resources: [
            `arn:aws:catalog:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:product/*`
          ],
          conditions: {
            StringEquals: {
              [`aws:ResourceTag/${ApplicationConfigManager.getConfig().tagKey}`]: ApplicationConfigManager.getConfig().tagValue,
            },
          },
        })
      );
      sharedRole.addToPrincipalPolicy(
        new iam.PolicyStatement({
          actions: [
            'servicecatalog:DescribeRecord',
          ],
          resources: [
            `arn:aws:servicecatalog:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:record/*`,
            `arn:aws:servicecatalog:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:stack/*/*`
          ],
        })
      );

      // PassRole for Step Function self-invocation (explicit ARN - guaranteed to work)
      sharedRole.addToPrincipalPolicy(
        new iam.PolicyStatement({
          actions: ['iam:PassRole'],
          resources: [this.stepFunctionRole.roleArn],
          conditions: {
            StringEquals: {
              'iam:PassedToService': 'states.amazonaws.com',
            },
          },
        })
      );

      // PassRole for user-registered SSM automation roles (tag-based)
      sharedRole.addToPrincipalPolicy(
        new iam.PolicyStatement({
          actions: ['iam:PassRole'],
          resources: [`arn:aws:iam::${cdk.Stack.of(this).account}:role/*`],
          conditions: {
            StringEquals: {
              [`aws:ResourceTag/${ApplicationConfigManager.getConfig().tagKey}`]: ApplicationConfigManager.getConfig().tagValue,
              'iam:PassedToService': 'ssm.amazonaws.com',
            },
          },
        })
      );

      // PassRole for user-registered Service Catalog launch roles (tag-based)
      sharedRole.addToPrincipalPolicy(
        new iam.PolicyStatement({
          actions: ['iam:PassRole'],
          resources: [`arn:aws:iam::${cdk.Stack.of(this).account}:role/*`],
          conditions: {
            StringEquals: {
              [`aws:ResourceTag/${ApplicationConfigManager.getConfig().tagKey}`]: ApplicationConfigManager.getConfig().tagValue,
              'iam:PassedToService': 'servicecatalog.amazonaws.com',
            },
          },
        })
      );

      // PassRole for AWS-managed Service Catalog roles (cannot be tagged)
      sharedRole.addToPrincipalPolicy(
        new iam.PolicyStatement({
          actions: ['iam:PassRole'],
          resources: [
            `arn:aws:iam::${cdk.Stack.of(this).account}:role/service-role/AWSServiceCatalog*`,
            `arn:aws:iam::${cdk.Stack.of(this).account}:role/service-role/CloudFormation*`,
          ],
          conditions: {
            StringEquals: {
              'iam:PassedToService': [
                'servicecatalog.amazonaws.com',
                'cloudformation.amazonaws.com',
              ],
            },
          },
        })
      );


    } else {
      throw new Error('No state machines found or state machines do not have a role.');
    }
  }

  /**
   * Retrieves the shared IAM role used by all state machines.
   * @returns The shared IAM role, or undefined if not found.
   */
  private getSharedStateMachineRole(): iam.IRole | undefined {
    const stepFunction = Object.values(this.stepFunctions)[0];
    return stepFunction?.role;
  }

  private addOutputs(): void {
    new cdk.CfnOutput(this, 'MainWorkflowArn', {
      value: this.stepFunctions['MainWorkflow'].stateMachineArn,
      description: 'Main Step FunctionArn',
    });
    new cdk.CfnOutput(this, 'StepFunctionRoleArn', {
      value: this.stepFunctionRole.roleArn,
      description: 'Step Function Role Arn',
    });
  }
}
