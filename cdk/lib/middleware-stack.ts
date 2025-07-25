import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as appsync from 'aws-cdk-lib/aws-appsync';
// import { CfnApiCache } from 'aws-cdk-lib/aws-appsync';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as path from 'path';
import { LambdaFunctionsConstruct } from './constructs/lambda-functions-construct';
import { ApplicationConfigManager } from 'shared-config';

export interface MiddlewareStackProps extends cdk.StackProps { }
interface LambdaFunctions {
  [key: string]: cdk.aws_lambda.Function;
}

export class MiddlewareStack extends cdk.Stack {
  public readonly table: dynamodb.Table;
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly api: appsync.GraphqlApi;
  public readonly lambdaFunctions: LambdaFunctions;

  constructor(scope: Construct, id: string, props: MiddlewareStackProps) {
    super(scope, id, props);

    // Get application configuration
    const applicationConfig = ApplicationConfigManager.getConfig();

    // Create the DynamoDB table
    this.table = new dynamodb.Table(this, 'MainTable', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // NOTE: Set to RETAIN in production
      pointInTimeRecovery: true,
      timeToLiveAttribute: 'TTL',
      stream: dynamodb.StreamViewType.NEW_IMAGE
    });

    const lambdaConstruct = new LambdaFunctionsConstruct(this, 'LambdaFunctions', {
      functions: [
        { name: 'discoverSSMDocuments', handler: 'ssm.handlerSsm', description: 'SSM lambda', memorySize: 256 },
        { name: 'discoverSCProducts', handler: 'service-catalog.handlerSc', description: 'Service Catalog Lambda', memorySize: 256 },
        { name: 'provisionParametersProduct', handler: 'sc-provisioning-parameters.handler', description: 'Service Catalog Provisioning Parameters Lambda', memorySize: 256 },
        { name: 'listProvisioningArtifacts', handler: 'sc-provisioning-artifacts.handler', description: 'Service Catalog Provisioning Artifacts Lambda', memorySize: 256 },{ name: 'describeSsmDocumentParameters', handler: 'ssm-parameters.handler', description: 'SSM Document Parameters', memorySize: 256 },
        { name: 'getSSMDocumentVersions', handler: 'ssm-document-versions.handler', description: 'SSM Document Versions', memorySize: 256 },        
      ],
    });
    this.lambdaFunctions = lambdaConstruct.functions;

    this.lambdaFunctions['discoverSSMDocuments'].addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ssm:ListDocuments'],
        resources: ['*'], // List requires wildcard and doesn't support conditions
       }
    )
    );
    this.lambdaFunctions['discoverSCProducts'].addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'servicecatalog:ListPortfolios',
          'servicecatalog:DescribePortfolio',
          'servicecatalog:SearchProductsAsAdmin',
          'servicecatalog:ListPortfoliosForProduct',
          'servicecatalog:DescribeProductAsAdmin'
        ],
        resources: ['*'], // All Service Catalog discovery actions require wildcard and don't support conditions
      })
    );
    this.lambdaFunctions['provisionParametersProduct'].addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'servicecatalog:DescribeProvisioningParameters',
          'servicecatalog:DescribeProduct',
        ],
        resources: [
          `arn:aws:catalog:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:product/*`
        ],
        conditions: {
          StringEquals: {
            [`aws:ResourceTag/${applicationConfig.tagKey}`]: applicationConfig.tagValue,
          },
        },
      })
    );
    this.lambdaFunctions['provisionParametersProduct'].addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'servicecatalog:ListProvisioningArtifacts',
        ],
        resources: ['*'], // ListProvisioningArtifacts requires wildcard and doesn't support conditions
      })
    );
    this.lambdaFunctions['provisionParametersProduct'].addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'servicecatalog:ListLaunchPaths',
        ],
        resources: ['*'], // ListLaunchPaths requires wildcard and doesn't support conditions
      }
    )
    );
    this.lambdaFunctions['provisionParametersProduct'].addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'cloudformation:GetTemplateSummary',
        ],
        resources: [
          `arn:aws:cloudformation:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:stack/SC-*`,
        ],
      })
    );
    this.lambdaFunctions['provisionParametersProduct'].addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          's3:GetObject',
          's3:ListBucket'
        ],
        resources: [
          'arn:aws:s3:::cf-templates-*',
          'arn:aws:s3:::aws-servicecatalog-*',
        ],
      })
    );
    this.lambdaFunctions['listProvisioningArtifacts'].addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'servicecatalog:DescribeProduct'
        ],
        resources: [
          `arn:aws:servicecatalog:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:product/*`
        ],
        conditions: {
          StringEquals: {
            [`aws:ResourceTag/${applicationConfig.tagKey}`]: applicationConfig.tagValue,
          },
        },
      })
    );
    this.lambdaFunctions['listProvisioningArtifacts'].addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'servicecatalog:ListProvisioningArtifacts',
        ],
        resources: ['*'], // ListProvisioningArtifacts requires wildcard and doesn't support conditions
      })
    );

    this.lambdaFunctions['describeSsmDocumentParameters'].addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ssm:DescribeDocument'],
        resources: [
          `arn:aws:ssm:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:document/*`
        ],
        conditions: {
          StringEquals: {
            [`aws:ResourceTag/${applicationConfig.tagKey}`]: applicationConfig.tagValue,
          },
        },
      })
    );
    
    this.lambdaFunctions['getSSMDocumentVersions'].addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ssm:ListDocumentVersions'],
        resources: [
          `arn:aws:ssm:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:document/*`
        ],
        conditions: {
          StringEquals: {
            [`aws:ResourceTag/${applicationConfig.tagKey}`]: applicationConfig.tagValue,
          },
        },
      })
    );

    // Add Global Secondary Index for inverse queries
    this.table.addGlobalSecondaryIndex({
      indexName: 'sk-pk-index',
      partitionKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Cognito User Pool
    this.userPool = new cognito.UserPool(this, 'UserPool', {
      signInAliases: { username: true, email: true },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },    
    });

    // Cognito User Pool Client
    this.userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool: this.userPool,
    })

    // Cognito Identity Pool
    const identityPool = new cognito.CfnIdentityPool(this, 'IdentityPool', {
      allowUnauthenticatedIdentities: false,
      cognitoIdentityProviders: [
        {
          clientId: this.userPoolClient.userPoolClientId,
          providerName: this.userPool.userPoolProviderName,
        },
      ],
    });

    // Cognito Identity Pool Unauthenticated Role
    const unauthenticatedIdentityPoolRole = new iam.Role(this, 'UnauthenticatedRole', {
      assumedBy: new iam.FederatedPrincipal('cognito-identity.amazonaws.com', {
        StringEquals: { 'cognito-identity.amazonaws.com:aud': identityPool.ref },
        'ForAnyValue:StringLike': { 'cognito-identity.amazonaws.com:amr': 'unauthenticated' },
      }, 'sts:AssumeRoleWithWebIdentity'),
    });

    // Cognito Identity Pool Authenticated Role
    const authenticatedIdentityPoolRole = new iam.Role(this, 'AuthenticatedRole', {
      assumedBy: new iam.FederatedPrincipal('cognito-identity.amazonaws.com', {
        StringEquals: { 'cognito-identity.amazonaws.com:aud': identityPool.ref },
        'ForAnyValue:StringLike': { 'cognito-identity.amazonaws.com:amr': 'authenticated' },
      }, 'sts:AssumeRoleWithWebIdentity'),
    });

    // Add Policy Statements to Authenticate Role
    authenticatedIdentityPoolRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["execute-api:Invoke", "execute-api:ManageConnections"],
      resources: ["*"]
    }));

    // Manage the role configuration for an Amazon Cognito identity pool.
    new cognito.CfnIdentityPoolRoleAttachment(this, 'IdentityPoolRoleAttachment', {
      identityPoolId: identityPool.ref,
      roles: {
        unauthenticated: unauthenticatedIdentityPoolRole.roleArn,
        authenticated: authenticatedIdentityPoolRole.roleArn,
      },
    });

    // AppSync API role
    const apiRole = new iam.Role(this, 'ApiRole', {
      assumedBy: new iam.ServicePrincipal('appsync.amazonaws.com'),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSAppSyncPushToCloudWatchLogs')]
    });

    // AppSync GraphQL API
    this.api = new appsync.GraphqlApi(this, 'Api', {
      name: `${applicationConfig.camelCase}GraphApi`,
      definition: appsync.Definition.fromFile(path.join(__dirname, '../graphql/schema.graphql')),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.USER_POOL,
          userPoolConfig: {
            userPool: this.userPool,
            defaultAction: appsync.UserPoolDefaultAction.ALLOW,
          },
        },
        additionalAuthorizationModes: [
          {
            authorizationType: appsync.AuthorizationType.IAM,
          },
        ],
      },
      logConfig: {
        fieldLogLevel: appsync.FieldLogLevel.ALL,
        excludeVerboseContent: false,
        role: apiRole,
      },
      xrayEnabled: true,
    });

    // Add API Cache
    // API Cache (currently unused but configured for future optimization)
    // const apiCache = new CfnApiCache(this, 'ApiCache', {
    //   apiId: this.api.apiId,
    //   apiCachingBehavior: 'PER_RESOLVER_CACHING',
    //   ttl: 300,
    //   type: 'SMALL',
    //   transitEncryptionEnabled: true,
    //   atRestEncryptionEnabled: true,
    // });


    // Lambda Execution Role (Add Permissions)
    // Lambda execution role (currently unused but available for future Lambda functions)
    // const lambdaExecutionRole = new iam.Role(this, 'LambdaExecutionRole', {
    //   assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    // });

    // API ARN (currently unused but available for future IAM policies)
    // const apiArn = this.api.arn;

    const ddbdatasource = this.api.addDynamoDbDataSource('DataSource', this.table);
    const ssmdatasource = this.api.addLambdaDataSource('SSMDataSource', this.lambdaFunctions['discoverSSMDocuments'])
    const scProductsDataSource = this.api.addLambdaDataSource('SCProductsDataSource', this.lambdaFunctions['discoverSCProducts']);
    const scParametersDataSource = this.api.addLambdaDataSource('SCParametersDataSource', this.lambdaFunctions['provisionParametersProduct']);
    const scArtifactsDataSource = this.api.addLambdaDataSource('SCArtifactsDataSource', this.lambdaFunctions['listProvisioningArtifacts']);
    const ssmParametersDataSource = this.api.addLambdaDataSource('SSMParametersDataSource', this.lambdaFunctions['describeSsmDocumentParameters']);
    const ssmVersionsDataSource = this.api.addLambdaDataSource('SSMVersionsDataSource', this.lambdaFunctions['getSSMDocumentVersions']);   

    // DDB Resolvers ------------------------------------------------------------<
    ddbdatasource.createResolver('updateEventStatus', {
      typeName: 'Mutation',
      fieldName: 'updateEventStatus',
      requestMappingTemplate: appsync.MappingTemplate.fromFile(path.join(__dirname, '../graphql/mapping/update-event-status.vtl')),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultItem()
    });
    ddbdatasource.createResolver('listEvents', {
      typeName: 'Query',
      fieldName: 'listEvents',
      requestMappingTemplate: appsync.MappingTemplate.fromFile(path.join(__dirname, '../graphql/mapping/list-events-request.vtl')),
      responseMappingTemplate: appsync.MappingTemplate.fromFile(path.join(__dirname, '../graphql/mapping/list-events-response.vtl')),
    });
    ddbdatasource.createResolver('putEvent', {
      typeName: 'Mutation',
      fieldName: 'putEvent',
      requestMappingTemplate: appsync.MappingTemplate.fromFile(path.join(__dirname, '../graphql/mapping/put-event-request.vtl')),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultItem()
    });
    ddbdatasource.createResolver('deleteEvent', {
      typeName: 'Mutation',
      fieldName: 'deleteEvent',
      requestMappingTemplate: appsync.MappingTemplate.fromFile(path.join(__dirname, '../graphql/mapping/delete-event.vtl')),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultItem(),
    });
    ddbdatasource.createResolver('getEvent', {
      typeName: 'Query',
      fieldName: 'getEvent',
      requestMappingTemplate: appsync.MappingTemplate.fromFile('graphql/mapping/get-event-request.vtl'),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultItem(),
    });
    ssmdatasource.createResolver('listSSMDocuments', {
      typeName: 'Query',
      fieldName: 'listSSMDocuments',
      requestMappingTemplate: appsync.MappingTemplate.fromFile(path.join(__dirname, '../graphql/mapping/list-ssm-document.vtl')),
      responseMappingTemplate: appsync.MappingTemplate.fromString('$util.toJson($ctx.result)'),
      cachingConfig: {
        ttl: cdk.Duration.seconds(300),
      },
    });
    scProductsDataSource.createResolver('ListScProduct', {
      typeName: 'Query',
      fieldName: 'ListScProduct',
      requestMappingTemplate: appsync.MappingTemplate.fromFile(path.join(__dirname, '../graphql/mapping/list-sc-product.vtl')),
      responseMappingTemplate: appsync.MappingTemplate.fromString('$util.toJson($ctx.result)'),
      cachingConfig: {
        ttl: cdk.Duration.seconds(300),
      },
    });    
    scParametersDataSource.createResolver('getProvisioningParameters', {
      typeName: 'Query',
      fieldName: 'getProvisioningParameters',
      requestMappingTemplate: appsync.MappingTemplate.fromFile(path.join(__dirname, '../graphql/mapping/get-provisioning-parameters-request.vtl')),
      responseMappingTemplate: appsync.MappingTemplate.fromString('$util.toJson($context.result)'),
    });
    scArtifactsDataSource.createResolver('listProvisioningArtifacts', {
      typeName: 'Query',
      fieldName: 'listProvisioningArtifacts',
      requestMappingTemplate: appsync.MappingTemplate.fromFile(path.join(__dirname, '../graphql/mapping/list-provisioning-artifacts.vtl')),
      responseMappingTemplate: appsync.MappingTemplate.fromString('$util.toJson($context.result)'),
    });
    ssmParametersDataSource.createResolver('getSSMDocumentParameters', {
      typeName: 'Query',
      fieldName: 'getSSMDocumentParameters',
      requestMappingTemplate: appsync.MappingTemplate.fromFile(path.join(__dirname, '../graphql/mapping/get-ssm-parameters.vtl')),
      responseMappingTemplate: appsync.MappingTemplate.fromString('$util.toJson($context.result)'),
    });
    ssmVersionsDataSource.createResolver('getSSMDocumentVersions', {
      typeName: 'Query',
      fieldName: 'getSSMDocumentVersions',
      requestMappingTemplate: appsync.MappingTemplate.fromFile(path.join(__dirname, '../graphql/mapping/get-ssm-document-version.vtl')),
      responseMappingTemplate: appsync.MappingTemplate.fromString('$util.toJson($context.result)'),
    });
    ddbdatasource.createResolver('updateDeployOutputs', {
      typeName: 'Mutation',
      fieldName: 'updateDeployOutputs',
      requestMappingTemplate: appsync.MappingTemplate.fromFile(path.join(__dirname, '../graphql/mapping/update-deploy-outputs.vtl')),
      responseMappingTemplate: appsync.MappingTemplate.fromString(`
        #if($ctx.error)
          $util.error($ctx.error.message, $ctx.error.type)
        #end
        $util.toJson($ctx.result)
      `)
    });    

    // Output the table name
    new cdk.CfnOutput(this, 'TableName', {
      value: this.table.tableName,
      description: 'DynamoDB table name',
    });

    // Output the table ARN
    new cdk.CfnOutput(this, 'TableArn', {
      value: this.table.tableArn,
      description: 'DynamoDB table ARN',
    });

    new cdk.CfnOutput(this, 'CognitoUserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool Id',
    });

    new cdk.CfnOutput(this, 'CognitoUserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool ClientId',
    });

    new cdk.CfnOutput(this, 'CognitoIdentityPoolId', {
      value: identityPool.ref,
      description: 'Cognito Identity Pool Id',
    });

    new cdk.CfnOutput(this, 'GraphqlApiUrl', {
      value: this.api.graphqlUrl,
      description: 'AppSync Api Url',
    });

    new cdk.CfnOutput(this, 'LambdaProvisionParametersProductName', {
      value: this.lambdaFunctions['provisionParametersProduct'].functionName,
      description: 'Lambda provisionParametersProduct name',
    });
  }
}
