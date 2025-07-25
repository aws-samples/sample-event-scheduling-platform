#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { UserInterfaceStack } from '@lib/user-interface-stack';
import { OrchestrationStack } from '@lib/orchestration-stack';
import { MiddlewareStack } from '@lib/middleware-stack';
import { MonitoringStack } from '@lib/monitoring-stack';
import { EventBusStack } from '@lib/event-bus-stack';
import { ProductsStack } from '@lib/products-stack';
// import { GlobalStack } from '@lib/global-stack';
import { Aspects } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { NagSuppressions } from 'cdk-nag';
import { ApplicationConfigManager } from 'shared-config';
const applicationConfig = ApplicationConfigManager.getConfig();
const env = {
  account: process.env.CDK_DEPLOY_ACCOUNT || process.env.CDK_DEFAULT_ACCOUNT || process.env.AWS_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEPLOY_REGION || process.env.CDK_DEFAULT_REGION || process.env.AWS_DEFAULT_REGION,
};

// const env_global = {
//   account: process.env.CDK_DEPLOY_ACCOUNT || process.env.CDK_DEFAULT_ACCOUNT || process.env.AWS_DEFAULT_ACCOUNT,
//   region: 'eu-west-3',
// };

const app = new cdk.App();

// Retrieve context values
// const domainName = app.node.tryGetContext('domainName');
// const hostedZoneId = app.node.tryGetContext('hostedZoneId');

// Function to create a prefixed stack name
const prefixedStackName = (name: string) => `${applicationConfig.camelCase}-${name}`;

// Create the stacks
const middlewareStack = new MiddlewareStack(app, prefixedStackName('MiddlewareStack'), {
  env: env,
});

const eventBusStack = new EventBusStack(app, prefixedStackName('EventBusStack'), {
  dynamoDbTable: middlewareStack.table,
  appSyncApi: middlewareStack.api,
  env: env,
});

const userInterfaceStack = new UserInterfaceStack(app, prefixedStackName('UserInterfaceStack'), {
  // domainName: domainName,
  // hostedZoneId: hostedZoneId,
  env: env,
  // crossRegionReferences: true,
});

// const globalStack = new GlobalStack(app, prefixedStackName('GlobalStack'), {
//   distribution: userInterfaceStack.distribution,
//   env: env_global,
// });
const orchestrationStack = new OrchestrationStack(app, prefixedStackName('OrchestrationStack'), {
  eventBus: eventBusStack.eventBus,
  env: env,
  table: middlewareStack.table,
});

const monitoringStack = new MonitoringStack(app, prefixedStackName('MonitoringStack'), {
  applicationName: applicationConfig.camelCase,
  stepFunctions: orchestrationStack.stepFunctions,
  logGroups: eventBusStack.logGroups,
  env: env,
});

const productsStack = new ProductsStack(app, prefixedStackName('ProductsStack'), {
  env: env,
  stepFunctionRole: orchestrationStack.stepFunctionRole,
  lambdaRole: middlewareStack.lambdaFunctions['provisionParametersProduct'].role,
});

orchestrationStack.addDependency(middlewareStack);
orchestrationStack.addDependency(eventBusStack);
orchestrationStack.addDependency(userInterfaceStack);
monitoringStack.addDependency(orchestrationStack);
productsStack.addDependency(orchestrationStack); // ProductsStack depends on OrchestrationStack for the role
productsStack.addDependency(middlewareStack); // ProductsStack depends on MiddlewareStack for the Lambda role
// userInterfaceStack.addDependency(globalStack);

// Apply tags to all constructs in the app
const tags = {
  [applicationConfig.tagKey]: applicationConfig.tagValue,
  ManagedBy: 'CDK',
};

Object.entries(tags).forEach(([key, value]) => {
  cdk.Tags.of(app).add(key, value);
});

// CDK NAG
Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));
NagSuppressions.addResourceSuppressions(
  app,
  [
    { id: 'AwsSolutions-SQS3', reason: 'No need to have a DLQ thanks to EventBridge' },
    { id: 'AwsSolutions-CFR1', reason: 'No need to have CloudFront Geo Restriction' },
    { id: 'AwsSolutions-COG2', reason: 'No need to have MFA with Cognito' },
    { id: 'AwsSolutions-SNS2', reason: 'Full AWS Serverless solution' },
    { id: 'AwsSolutions-SNS3', reason: 'Full AWS Serverless solution' },
    { id: 'AwsSolutions-SQS4', reason: 'Full AWS Serverless solution' },
    { id: 'AwsSolutions-IAM4', reason: 'OK to use AWS IAM Managed policies' },
    { id: 'AwsSolutions-CFR4', reason: 'Wait until the developement ended' },
    { id: 'AwsSolutions-CFR5', reason: 'Wait until the developement ended' },
    { id: 'AwsSolutions-COG3', reason: 'No specific needs for advanced security features' },
    { id: 'AwsSolutions-IAM5', reason: 'Wait until the developement ended' },
    { id: 'AwsSolutions-L1', reason: 'Wait until the developement ended' },
  ],
  true,
);

app.synth();
