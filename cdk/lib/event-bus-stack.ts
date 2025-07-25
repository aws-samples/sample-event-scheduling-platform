import * as cdk from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as pipes from 'aws-cdk-lib/aws-pipes';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { logGroupName } from '@utils/cdk';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as appsync from 'aws-cdk-lib/aws-appsync';

interface CloudwatchLogGroups {
  [key: string]: logs.LogGroup;
}

export interface EventBusStackProps extends cdk.StackProps {
  dynamoDbTable: dynamodb.Table;
  appSyncApi: appsync.GraphqlApi;
}

export class EventBusStack extends cdk.Stack {
  public readonly eventBus: events.EventBus;
  public readonly topic: sns.ITopic;
  public readonly logGroups: CloudwatchLogGroups = {};
  public readonly lambdaFunctions: Record<string, lambda.Function>;
  private readonly props: EventBusStackProps;

  constructor(scope: Construct, id: string, props: EventBusStackProps) {
    super(scope, id, props);
    this.props = props;

    // Create SQS dead letter queue to Cloudwatch Logs for SNS and EventBridge
    const dlq = new sqs.Queue(this, 'dlq', {});

    const dlqLog = this.createLogGroup('dlq', logs.RetentionDays.ONE_WEEK);

    this.createDLQPipe(dlq, dlqLog);

    // Create SNS topic for chatbot notifications
    this.topic = new sns.Topic(this, 'bot');

    // Create the event bus
    this.eventBus = new events.EventBus(this, 'EventBus', {});

    // Create a rule to send all events to logs
    const allLog = this.createLogGroup('all', logs.RetentionDays.ONE_WEEK);

    this.createLogRule(allLog, dlq);

    // Create a rule to send status events to SNS and AWS Chatbot
    this.createChatbotRule(dlq);

    this.addOutputs();

    this.createStatusChangeRule();
    this.createDeployOutputsRule();
  }

  private createLogGroup(name: string, retention: logs.RetentionDays): logs.LogGroup {
    const logGroup = new logs.LogGroup(this, `${name}Log`, {
      logGroupName: logGroupName(this, name),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      retention,
    });
    this.logGroups[name] = logGroup;
    return logGroup;
  }

  private createDLQPipe(dlq: sqs.Queue, dlqLog: logs.LogGroup): void {
    const pipeRole = new iam.Role(this, 'pipeRole', {
      assumedBy: new iam.ServicePrincipal('pipes.amazonaws.com'),
    });
    dlq.grantConsumeMessages(pipeRole);
    dlqLog.grantWrite(pipeRole);

    new pipes.CfnPipe(this, 'dlqPipe', {
      roleArn: pipeRole.roleArn,
      source: dlq.queueArn,
      target: dlqLog.logGroupArn,
      targetParameters: {
        cloudWatchLogsParameters: {
          logStreamName: 'DLQMessages',
        },
      },
    });
  }

  private createLogRule(logGroup: logs.LogGroup, dlq: sqs.Queue): void {
    const ruleLog = new events.Rule(this, 'Logs', {
      eventBus: this.eventBus,
      eventPattern: {
        account: [cdk.Stack.of(this).account],
      },
    });

    ruleLog.addTarget(
      new targets.CloudWatchLogGroup(logGroup, {
        deadLetterQueue: dlq,
      }),
    );
  }

  private createChatbotRule(dlq: sqs.Queue): void {
    const ruleBot = new events.Rule(this, 'Chatbot', {
      eventBus: this.eventBus,
      eventPattern: {
        account: [cdk.Stack.of(this).account],
      },
    });

    ruleBot.addTarget(
      new targets.SnsTopic(this.topic, {
        deadLetterQueue: dlq,
        message: events.RuleTargetInput.fromObject({
          version: '1.0',
          source: 'custom',
          content: {
            title: events.EventField.fromPath('$.detail.title'),
            description: events.EventField.fromPath('$.detail.description'),
          },
        }),
      }),
    );
  }

  private createStatusChangeRule(): void {
    const ruleStatusChange = new events.Rule(this, 'StatusChangeRule', {
      eventBus: this.eventBus,
      eventPattern: {
        source: ['custom.stepfunctions'],
        detailType: ['Status Notification'],
        detail: {
          status: [{ exists: true }]
        }
      },
    });

    // Create an IAM role for EventBridge to invoke AppSync
    const eventBridgeRole = new iam.Role(this, 'EventBridgeAppSyncRole', {
      assumedBy: new iam.ServicePrincipal('events.amazonaws.com'),
    });

    // Grant the role permission to invoke the AppSync API
    eventBridgeRole.addToPolicy(new iam.PolicyStatement({
      actions: ['appsync:GraphQL'],
      resources: [this.props.appSyncApi.arn + '/types/Mutation/fields/*'],
    }));

    // Add the AppSync API as a target for the rule
    ruleStatusChange.addTarget(new targets.AppSync(
      this.props.appSyncApi,
      {
        graphQLOperation: `mutation UpdateEventStatus($pk: String!, $sk: String!, $event_status: String!) {
          updateEventStatus(pk: $pk, sk: $sk, event_status: $event_status) {
            id
            name
            additional_notes
            event_starts_ts
            event_ends_ts
            orchestration_type
            document_name
            event_status
            created
            updated
          }
        }`,
        variables: events.RuleTargetInput.fromObject({
          pk: events.EventField.fromPath('$.detail.pk'),
          sk: events.EventField.fromPath('$.detail.sk'),
          event_status: events.EventField.fromPath('$.detail.status'),
        })
      }
    ));
  }

  private createDeployOutputsRule(): void {
    
    const ruleDeployOutputs = new events.Rule(this, 'DeployOutputsRule', {
      eventBus: this.eventBus,
      eventPattern: {
        source: ['custom.stepfunctions'],
        detailType: ['Status Notification'],
        detail: {
          outputs: [{ exists: true }]
        }
      },      
    });

    const deployOutputsRole = new iam.Role(this, 'DeployOutputsAppSyncRole', {
      assumedBy: new iam.ServicePrincipal('events.amazonaws.com'),
    });

    deployOutputsRole.addToPolicy(new iam.PolicyStatement({
      actions: ['appsync:GraphQL'],
      resources: [this.props.appSyncApi.arn + '/types/Mutation/fields/*'],
    }));    

    ruleDeployOutputs.addTarget(new targets.AppSync(
      this.props.appSyncApi,
      {
        graphQLOperation: `mutation UpdateDeployOutputs($pk: String!, $sk: String!, $outputs: AWSJSON!) {
          updateDeployOutputs(pk: $pk, sk: $sk, outputs: $outputs) {
            id
            name
            additional_notes
            event_starts_ts
            event_ends_ts
            orchestration_type
            document_name
            event_status
            outputs
            created
            updated
          }
        }`,
        variables: events.RuleTargetInput.fromObject({
          pk: events.EventField.fromPath('$.detail.pk'),
          sk: events.EventField.fromPath('$.detail.sk'),
          outputs: events.EventField.fromPath('$.detail.outputs'),
        })
      }
    ));

    ruleDeployOutputs.addTarget(new targets.CloudWatchLogGroup(this.createLogGroup('deployOutputsErrors', logs.RetentionDays.ONE_WEEK)));

  }

  private addOutputs(): void {
    new cdk.CfnOutput(this, 'BotSNStopicArn', {
      value: this.topic.topicArn,
      description: 'SNS Topic ARN to subscribe for AWS Chatbot',
    });
    new cdk.CfnOutput(this, 'EventBusName', {
      value: this.eventBus.eventBusName,
      description: 'Event Bus Name',
    });
  }
}
