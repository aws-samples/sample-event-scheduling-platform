import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as servicecatalog from 'aws-cdk-lib/aws-servicecatalog';
import { Construct } from 'constructs';
import { ApplicationConfigManager } from 'shared-config';
import { suffix } from '@utils/cdk';
import * as fs from 'fs';
import * as path from 'path';

const applicationConfig = ApplicationConfigManager.getConfig();

interface ProductsStackProps extends cdk.StackProps {
  readonly stepFunctionRole?: iam.IRole;
  readonly lambdaRole?: iam.IRole;
}

export class ProductsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ProductsStackProps) {
    super(scope, id, props);
    this.createSsmDocumentSample();
    this.createServiceCatalogProductSample(props.stepFunctionRole, props.lambdaRole);
  }
  private createServiceCatalogProductSample(stepFunctionRole?: iam.IRole, lambdaRole?: iam.IRole) {
    // Create a Service Catalog Product
    const portfolio = new servicecatalog.Portfolio(this, 'SamplePortfolio', {
      displayName: applicationConfig.name + ' - Portfolio Sample',
      providerName: applicationConfig.name,
      description: applicationConfig.name + ' - Description',
    });
    cdk.Tags.of(portfolio).add(applicationConfig.tagKey, applicationConfig.tagValue);

    // Associate Step Functions role with the portfolio if provided
    if (stepFunctionRole) {
      const principalAssociation = new servicecatalog.CfnPortfolioPrincipalAssociation(this, 'StepFunctionPortfolioAccess', {
        portfolioId: portfolio.portfolioId,
        principalArn: stepFunctionRole.roleArn,
        principalType: 'IAM',
      });
      // Ensure the portfolio is created before the association
      principalAssociation.addDependency(portfolio.node.defaultChild as cdk.CfnResource);
      
      // Add metadata to force update
      principalAssociation.addMetadata('Description', 'Associates Step Functions role with Service Catalog portfolio for event orchestration');
    }

    // Associate Lambda role with the portfolio if provided
    if (lambdaRole) {
      const lambdaAssociation = new servicecatalog.CfnPortfolioPrincipalAssociation(this, 'LambdaPortfolioAccess', {
        portfolioId: portfolio.portfolioId,
        principalArn: lambdaRole.roleArn,
        principalType: 'IAM',
      });
      lambdaAssociation.addDependency(portfolio.node.defaultChild as cdk.CfnResource);
      lambdaAssociation.addMetadata('Description', 'Associates Lambda role with Service Catalog portfolio for provisioning parameters');
    }

    // Create a launch role for Service Catalog products
    const launchRole = new iam.Role(this, 'ServiceCatalogLaunchRole', {
      description: applicationConfig.name + ' - Service Catalog Launch Role',
      assumedBy: new iam.ServicePrincipal('servicecatalog.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AWSCloudFormationFullAccess'),
      ],
      inlinePolicies: {
        'ServiceCatalogLaunchPolicy': new iam.PolicyDocument({
          statements: [
            // Basic permissions needed for CloudFormation operations
            new iam.PolicyStatement({
              actions: [
                'iam:CreateRole',
                'iam:DeleteRole',
                'iam:AttachRolePolicy',
                'iam:DetachRolePolicy',
                'iam:PutRolePolicy',
                'iam:DeleteRolePolicy',
                'iam:GetRole',
                'iam:PassRole',
                'iam:CreateInstanceProfile',
                'iam:DeleteInstanceProfile',
                'iam:AddRoleToInstanceProfile',
                'iam:RemoveRoleFromInstanceProfile',
              ],
              resources: ['*'],
            }),
            // S3 permissions needed for CloudFormation templates and artifacts
            new iam.PolicyStatement({
              actions: [
                's3:GetObject',
                's3:GetObjectVersion',
                's3:PutObject',
                's3:DeleteObject',
                's3:ListBucket',
                's3:GetBucketLocation',
                's3:GetBucketVersioning',
              ],
              resources: [
                'arn:aws:s3:::cf-templates-*',
                'arn:aws:s3:::cf-templates-*/*',
                'arn:aws:s3:::aws-cloudformation-*',
                'arn:aws:s3:::aws-cloudformation-*/*',
                'arn:aws:s3:::sc-*',
                'arn:aws:s3:::sc-*/*',
              ],
            }),
          ],
        }),
      },
    });
    cdk.Tags.of(launchRole).add(applicationConfig.tagKey, applicationConfig.tagValue);

    class EmptyProductStack extends servicecatalog.ProductStack {
      constructor(scope: Construct, id: string) {
        super(scope, id);
        
        // Add a simple parameter so DescribeProvisioningParameters works
        new cdk.CfnParameter(this, 'SampleParameter', {
          type: 'String',
          description: 'Sample parameter for testing provisioning parameters API',
          default: 'sample-value',
        });
        
        // You can add resources here in the future
      }
    }

    const product = new servicecatalog.CloudFormationProduct(this, 'SampleProduct', {
      productName: applicationConfig.name + ' - Product Sample',
      owner: applicationConfig.name,
      productVersions: [
        {
          productVersionName: 'v1',
          cloudFormationTemplate: servicecatalog.CloudFormationTemplate.fromProductStack(
            new EmptyProductStack(this, 'EmptyProduct'),
          ),
        },
      ],
    });
    cdk.Tags.of(product).add(applicationConfig.tagKey, applicationConfig.tagValue);

    portfolio.addProduct(product);

    // Create launch constraint with the launch role
    new servicecatalog.CfnLaunchRoleConstraint(this, 'SampleProductLaunchConstraint', {
      portfolioId: portfolio.portfolioId,
      productId: product.productId,
      roleArn: launchRole.roleArn,
      description: 'Launch constraint for sample product',
    });
    new cdk.CfnOutput(this, 'SamplePortfolioId', {
      value: portfolio.portfolioId,
      description: 'Sample Portfolio ID for cleanup operations',
    });
  }
  private createSsmDocumentSample() {
    // Create a SSM Document Sample
    const ssmAssumeRole = new iam.Role(this, 'ssm-assume-role', {
      description: applicationConfig.name + ' - SSM Sample assume role',
      assumedBy: new iam.CompositePrincipal(new iam.ServicePrincipal('ssm.amazonaws.com')),
      // Custom inline policy with ONLY the permissions needed for this specific document
      inlinePolicies: {
        'MinimalSSMPolicy': new iam.PolicyDocument({
          statements: [
            // Our sample.yaml document only uses 'aws:sleep' action (1 second sleep)
            // This is a built-in SSM action that requires NO additional AWS permissions!
            //
            // However, SSM documents still need basic automation execution permissions:
            new iam.PolicyStatement({
              actions: [
                'ssm:GetAutomationExecution',
                'ssm:DescribeAutomationExecutions',
              ],
              resources: [
                `arn:aws:ssm:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:automation-execution/*`
              ],
              conditions: {
                StringEquals: {
                  [`aws:ResourceTag/${applicationConfig.tagKey}`]: applicationConfig.tagValue,
                },
              },
            }),
          ],
        }),
      },
    });
    let ssmDocumentYaml = fs.readFileSync(path.join(__dirname, 'ssm-documents', 'sample.yaml'), 'utf8');

    ssmDocumentYaml = ssmDocumentYaml.replace(/%ROLE_ARN%/g, ssmAssumeRole.roleArn);

    new ssm.CfnDocument(this, 'SsmDocumentSample', {
      content: ssmDocumentYaml,
      documentType: 'Automation',
      documentFormat: 'YAML',
      name: applicationConfig.kebakCase + '-sample-' + suffix(this),
      updateMethod: 'NewVersion',
      tags: [{ key: applicationConfig.tagKey, value: applicationConfig.tagValue }],
    });
  }
}
