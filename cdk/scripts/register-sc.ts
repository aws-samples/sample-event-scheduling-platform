#!/usr/bin/env ts-node

import { 
  ServiceCatalogClient,
  SearchProductsAsAdminCommand,
  ListPortfoliosCommand,
  ListConstraintsForPortfolioCommand,
  CreateConstraintCommand,
  AssociatePrincipalWithPortfolioCommand,
  ListPrincipalsForPortfolioCommand,
  DescribePortfolioCommand,
  DescribeProductAsAdminCommand
} from '@aws-sdk/client-service-catalog';
import { 
  CloudFormationClient,
  DescribeStacksCommand
} from '@aws-sdk/client-cloudformation';
import { 
  ResourceGroupsTaggingAPIClient
} from '@aws-sdk/client-resource-groups-tagging-api';
import { 
  IAMClient,
  CreateRoleCommand,
  AttachRolePolicyCommand,
  PutRolePolicyCommand,
  GetRoleCommand
} from '@aws-sdk/client-iam';
import { ApplicationConfigManager } from 'shared-config';

interface ServiceCatalogProductInfo {
  productId: string;
  productName: string;
  portfolioId: string;
  portfolioName: string;
  hasRequiredTag: boolean;
  hasLaunchConstraint: boolean;
  launchRoleArn?: string;
}

interface ServiceCatalogPortfolioInfo {
  portfolioId: string;
  portfolioName: string;
  hasRequiredTag: boolean;
  hasStepFunctionAccess: boolean;
}

class ServiceCatalogAutoRegistrar {
  private serviceCatalogClient: ServiceCatalogClient;
  private cloudFormationClient: CloudFormationClient;
  private resourceGroupsClient: ResourceGroupsTaggingAPIClient;
  private iamClient: IAMClient;
  private tagKey: string;
  private tagValue: string;
  private stackPrefix: string;
  private dryRun: boolean;
  private applicationConfig = ApplicationConfigManager.getConfig();

  constructor(dryRun: boolean = false) {
    this.dryRun = dryRun;
    
    // Get configuration from shared config
    this.tagKey = this.applicationConfig.tagKey;
    this.tagValue = this.applicationConfig.tagValue;
    this.stackPrefix = this.applicationConfig.camelCase;
    
    this.serviceCatalogClient = new ServiceCatalogClient({});
    this.cloudFormationClient = new CloudFormationClient({});
    this.resourceGroupsClient = new ResourceGroupsTaggingAPIClient({});
    this.iamClient = new IAMClient({});
  }

  async autoRegisterAll(): Promise<void> {
    const mode = this.dryRun ? '🔍 TROUBLESHOOTING MODE' : '🔧 REGISTRATION MODE';
    console.log(`${mode} - Service Catalog Resources`);
    console.log(`🏷️  Looking for tag: ${this.tagKey}=${this.tagValue}`);
    if (this.dryRun) {
      console.log('ℹ️  Dry-run mode: No changes will be made');
    }
    console.log('');

    try {
      // Step 1: Get Step Functions role ARN
      const stepFunctionRoleArn = await this.getStepFunctionRoleArn();
      if (!stepFunctionRoleArn) {
        console.error('❌ Could not find Event Scheduling Platform Step Functions role');
        console.error('   Make sure the platform is deployed first');
        process.exit(1);
      }

      console.log(`🔧 Step Functions Role: ${stepFunctionRoleArn}`);
      console.log('');

      // Step 2: Discover tagged portfolios and products
      const { portfolios, products } = await this.discoverTaggedResources();

      if (portfolios.length === 0 && products.length === 0) {
        console.log('ℹ️  No Service Catalog resources found with the required tag.');
        console.log('');
        console.log('📋 To register Service Catalog resources:');
        console.log('1. Tag your Service Catalog portfolios and products with:');
        console.log(`   Key: ${this.tagKey}`);
        console.log(`   Value: ${this.tagValue}`);
        console.log('2. Run this script again');
        return;
      }

      console.log(`✅ Found ${portfolios.length} tagged portfolio(s) and ${products.length} tagged product(s)`);
      console.log('');

      // Step 3: Process portfolios
      let portfolioSuccessCount = 0;
      let portfolioErrorCount = 0;
      let portfolioIssuesFound = 0;

      for (const portfolio of portfolios) {
        try {
          console.log(`📋 Processing Portfolio: ${portfolio.portfolioName} (${portfolio.portfolioId})`);
          const issues = await this.processPortfolio(portfolio, stepFunctionRoleArn);
          portfolioIssuesFound += issues;
          portfolioSuccessCount++;
          
          if (this.dryRun) {
            if (issues > 0) {
              console.log(`⚠️  ${portfolio.portfolioName} - Audit completed with ${issues} issue(s)`);
            } else {
              console.log(`✅ ${portfolio.portfolioName} - Audit completed - no issues found`);
            }
          } else {
            console.log(`✅ ${portfolio.portfolioName} - Registration completed`);
          }
        } catch (error) {
          const actionWord = this.dryRun ? 'Audit' : 'Registration';
          console.error(`❌ ${portfolio.portfolioName} - ${actionWord} failed: ${error}`);
          portfolioErrorCount++;
        }
        console.log('');
      }

      // Step 4: Process products
      let productSuccessCount = 0;
      let productErrorCount = 0;
      let productIssuesFound = 0;

      for (const product of products) {
        try {
          console.log(`📦 Processing Product: ${product.productName} (${product.productId})`);
          const issues = await this.processProduct(product);
          productIssuesFound += issues;
          productSuccessCount++;
          
          if (this.dryRun) {
            if (issues > 0) {
              console.log(`⚠️  ${product.productName} - Audit completed with ${issues} issue(s)`);
            } else {
              console.log(`✅ ${product.productName} - Audit completed - no issues found`);
            }
          } else {
            console.log(`✅ ${product.productName} - Registration completed`);
          }
        } catch (error) {
          const actionWord = this.dryRun ? 'Audit' : 'Registration';
          console.error(`❌ ${product.productName} - ${actionWord} failed: ${error}`);
          productErrorCount++;
        }
        console.log('');
      }

      const totalIssuesFound = portfolioIssuesFound + productIssuesFound;

      // Step 5: Summary
      if (this.dryRun) {
        console.log('📊 Audit Summary:');
        console.log(`   📋 Portfolios - ✅ Validated: ${portfolioSuccessCount}, ❌ Errors: ${portfolioErrorCount}`);
        console.log(`   📦 Products - ✅ Validated: ${productSuccessCount}, ❌ Errors: ${productErrorCount}`);
        console.log(`   ⚠️  Total Issues Found: ${totalIssuesFound}`);
      } else {
        console.log('📊 Registration Summary:');
        console.log(`   📋 Portfolios - ✅ Successful: ${portfolioSuccessCount}, ❌ Failed: ${portfolioErrorCount}`);
        console.log(`   📦 Products - ✅ Successful: ${productSuccessCount}, ❌ Failed: ${productErrorCount}`);
      }

      if (portfolioSuccessCount > 0 || productSuccessCount > 0) {
        console.log('');
        if (this.dryRun) {
          if (totalIssuesFound > 0) {
            console.log('📋 Audit Results:');
            console.log(`✅ ${portfolioSuccessCount} portfolios and ${productSuccessCount} products validated`);
            console.log(`❌ ${totalIssuesFound} issues found requiring registration`);
            console.log('🔧 Next Steps:');
            console.log('   1. Run "task register" to fix the identified issues');
            console.log('   2. Run "task audit" again to verify fixes');
          } else {
            console.log('📋 Audit Results:');
            console.log('✅ All Service Catalog resources are properly configured');
            console.log('ℹ️  No registration actions needed');
          }
        } else {
          console.log('📋 Registration Complete:');
          console.log('✅ All Service Catalog resources have been processed');
          console.log('🔧 Next Steps:');
          console.log('   1. Run "task audit" to verify all configurations');
          console.log('   2. Test products through the Event Scheduling Platform web interface');
        }
      }

    } catch (error) {
      console.error(`❌ Auto-registration failed: ${error}`);
      process.exit(1);
    }
  }

  private async getStepFunctionRoleArn(): Promise<string | null> {
    try {
      const stackName = `${this.stackPrefix}-OrchestrationStack`;
      const response = await this.cloudFormationClient.send(
        new DescribeStacksCommand({ StackName: stackName })
      );

      const stack = response.Stacks?.[0];
      if (!stack?.Outputs) {
        return null;
      }

      const roleOutput = stack.Outputs.find(output => 
        output.OutputKey === 'StepFunctionRoleArn'
      );

      return roleOutput?.OutputValue || null;
    } catch {
      return null;
    }
  }

  private async discoverTaggedResources(): Promise<{
    portfolios: ServiceCatalogPortfolioInfo[];
    products: ServiceCatalogProductInfo[];
  }> {
    console.log('🔍 Discovering tagged Service Catalog resources...');

    const portfolios: ServiceCatalogPortfolioInfo[] = [];
    const products: ServiceCatalogProductInfo[] = [];

    try {
      // Discover portfolios using Service Catalog API directly
      const portfoliosResponse = await this.serviceCatalogClient.send(new ListPortfoliosCommand({}));
      
      if (portfoliosResponse.PortfolioDetails) {
        for (const portfolio of portfoliosResponse.PortfolioDetails) {
          if (portfolio.Id) {
            const portfolioInfo = await this.getPortfolioInfo(portfolio.Id);
            if (portfolioInfo && portfolioInfo.hasRequiredTag) {
              portfolios.push(portfolioInfo);
            }
          }
        }
      }

      // Discover products using Service Catalog API directly
      const productsResponse = await this.serviceCatalogClient.send(new SearchProductsAsAdminCommand({}));
      
      if (productsResponse.ProductViewDetails) {
        for (const productDetail of productsResponse.ProductViewDetails) {
          if (productDetail.ProductViewSummary?.ProductId) {
            const productInfo = await this.getProductInfo(productDetail.ProductViewSummary.ProductId);
            if (productInfo && productInfo.hasRequiredTag) {
              products.push(productInfo);
            }
          }
        }
      }

    } catch (error) {
      console.error('❌ Error discovering Service Catalog resources:', error);
    }

    return { portfolios, products };
  }

  private async getPortfolioInfo(portfolioId: string): Promise<ServiceCatalogPortfolioInfo | null> {
    try {
      // Get detailed portfolio information including tags
      const portfolioDetail = await this.serviceCatalogClient.send(
        new DescribePortfolioCommand({ Id: portfolioId })
      );
      
      if (!portfolioDetail.PortfolioDetail) {
        return null;
      }

      // Check if portfolio has the required tag
      const hasRequiredTag = portfolioDetail.Tags?.some(tag => 
        tag.Key === this.tagKey && tag.Value === this.tagValue
      ) || false;

      if (!hasRequiredTag) {
        return null; // Skip portfolios without the required tag
      }

      // Check if Step Functions role has access
      const principals = await this.serviceCatalogClient.send(
        new ListPrincipalsForPortfolioCommand({ PortfolioId: portfolioId })
      );

      const stepFunctionRoleArn = await this.getStepFunctionRoleArn();
      const hasStepFunctionAccess = principals.Principals?.some(p => 
        p.PrincipalARN === stepFunctionRoleArn
      ) || false;

      return {
        portfolioId,
        portfolioName: portfolioDetail.PortfolioDetail.DisplayName || portfolioId,
        hasRequiredTag: true,
        hasStepFunctionAccess
      };
    } catch {
      return null;
    }
  }

  private async getProductInfo(productId: string): Promise<ServiceCatalogProductInfo | null> {
    try {
      // Get detailed product information including tags
      const productDetail = await this.serviceCatalogClient.send(
        new DescribeProductAsAdminCommand({ Id: productId })
      );

      if (!productDetail.ProductViewDetail?.ProductViewSummary) {
        return null;
      }

      // Check if product has the required tag
      const hasRequiredTag = productDetail.Tags?.some(tag => 
        tag.Key === this.tagKey && tag.Value === this.tagValue
      ) || false;

      if (!hasRequiredTag) {
        return null; // Skip products without the required tag
      }

      const product = productDetail.ProductViewDetail.ProductViewSummary;

      // Find the portfolio this product belongs to by searching through all portfolios
      let portfolioId = 'unknown';
      let portfolioName = 'Unknown';
      
      try {
        const portfolios = await this.serviceCatalogClient.send(new ListPortfoliosCommand({}));
        
        for (const portfolio of portfolios.PortfolioDetails || []) {
          if (!portfolio.Id) continue;
          
          try {
            // Check if this product is associated with this portfolio
            const portfolioProducts = await this.serviceCatalogClient.send(
              new SearchProductsAsAdminCommand({
                PortfolioId: portfolio.Id
              })
            );
            
            const foundInPortfolio = portfolioProducts.ProductViewDetails?.some(p => 
              p.ProductViewSummary?.ProductId === productId
            );
            
            if (foundInPortfolio) {
              portfolioId = portfolio.Id;
              portfolioName = portfolio.DisplayName || portfolio.Id;
              break;
            }
          } catch {
            // Continue searching other portfolios
          }
        }
      } catch (error) {
        console.warn(`⚠️  Could not determine portfolio for product ${productId}: ${error}`);
      }
      
      // Check for launch constraints
      let hasLaunchConstraint = false;
      let launchRoleArn: string | undefined;
      
      if (portfolioId !== 'unknown') {
        try {
          const constraints = await this.serviceCatalogClient.send(
            new ListConstraintsForPortfolioCommand({
              PortfolioId: portfolioId,
              ProductId: productId
            })
          );

          const launchConstraint = constraints.ConstraintDetails?.find(c => c.Type === 'LAUNCH');
          hasLaunchConstraint = !!launchConstraint;
          
          if (launchConstraint?.Description) {
            try {
              // Try to extract role ARN from description or other fields
              const description = launchConstraint.Description;
              if (description.includes('arn:aws:iam::')) {
                const arnMatch = description.match(/arn:aws:iam::[^:]+:role\/[^\s"]+/);
                if (arnMatch) {
                  launchRoleArn = arnMatch[0];
                }
              }
            } catch {
              // Could not parse constraint information
            }
          }
        } catch (error) {
          console.warn(`⚠️  Could not check constraints for product ${productId}: ${error}`);
        }
      }

      return {
        productId,
        productName: product.Name || 'Unknown',
        portfolioId,
        portfolioName,
        hasRequiredTag: true,
        hasLaunchConstraint,
        launchRoleArn
      };
    } catch {
      return null;
    }
  }

  private async processPortfolio(portfolio: ServiceCatalogPortfolioInfo, stepFunctionRoleArn: string): Promise<number> {
    console.log(`   ID: ${portfolio.portfolioId}`);
    console.log(`   Tagged: ✅`);

    let issuesFound = 0;

    if (!portfolio.hasStepFunctionAccess) {
      issuesFound++;
      if (this.dryRun) {
        console.log('   ❌ ISSUE: Step Functions role access missing');
        console.log('   🔧 FIX: Run registration mode to grant access automatically');
      } else {
        console.log('   🔧 Adding Step Functions role access...');
        
        try {
          await this.serviceCatalogClient.send(
            new AssociatePrincipalWithPortfolioCommand({
              PortfolioId: portfolio.portfolioId,
              PrincipalARN: stepFunctionRoleArn,
              PrincipalType: 'IAM'
            })
          );
          console.log('   ✅ Step Functions role access granted');
          issuesFound--; // Issue was resolved
        } catch (error) {
          if (error instanceof Error && error.message.includes('already exists')) {
            console.log('   ✅ Step Functions role access already exists');
            issuesFound--; // Issue was resolved
          } else {
            throw error;
          }
        }
      }
    } else {
      console.log('   ✅ Step Functions role access already configured');
    }

    return issuesFound;
  }

  private async processProduct(product: ServiceCatalogProductInfo): Promise<number> {
    console.log(`   ID: ${product.productId}`);
    console.log(`   Portfolio: ${product.portfolioName} (${product.portfolioId})`);
    console.log(`   Tagged: ✅`);

    let issuesFound = 0;

    if (!product.hasLaunchConstraint) {
      issuesFound++;
      if (this.dryRun) {
        console.log('   ❌ ISSUE: No launch constraint found');
        console.log('   🔧 FIX: Run registration mode to create launch role and constraint automatically');
      } else {
        console.log('   🔧 Creating launch role and constraint...');
        
        try {
          // Create launch role
          const launchRoleArn = await this.createLaunchRole(product.productId);
          console.log(`   ✅ Launch role created: ${launchRoleArn}`);
          
          // Create launch constraint
          await this.createLaunchConstraint(product.portfolioId, product.productId, launchRoleArn);
          console.log('   ✅ Launch constraint created');
          issuesFound--; // Issue was resolved
          
        } catch (error) {
          throw new Error(`Failed to create launch role/constraint: ${error}`);
        }
      }
    } else {
      console.log('   ✅ Launch constraint already configured');
      if (product.launchRoleArn) {
        console.log(`   🔧 Launch Role: ${product.launchRoleArn}`);
      }
    }

    return issuesFound;
  }

  private async createLaunchRole(productId: string): Promise<string> {
    const roleName = `${this.stackPrefix}-ServiceCatalog-LaunchRole-${productId}`;
    
    try {
      // Check if role already exists
      const existingRole = await this.iamClient.send(new GetRoleCommand({ RoleName: roleName }));
      if (existingRole.Role?.Arn) {
        console.log(`   ℹ️  Launch role already exists: ${roleName}`);
        return existingRole.Role.Arn;
      }
    } catch {
      // Role doesn't exist, create it
    }

    // Create the launch role with the same configuration as ProductsStack
    const trustPolicy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { Service: 'servicecatalog.amazonaws.com' },
          Action: 'sts:AssumeRole'
        }
      ]
    };

    const createRoleResponse = await this.iamClient.send(new CreateRoleCommand({
      RoleName: roleName,
      AssumeRolePolicyDocument: JSON.stringify(JSON.parse(JSON.stringify(trustPolicy))), // Sanitize input
      Description: `${this.applicationConfig.name} - Service Catalog Launch Role for ${productId}`,
      Tags: [
        { Key: this.tagKey, Value: this.tagValue },
        { Key: 'ManagedBy', Value: this.applicationConfig.camelCase }
      ]
    }));

    if (!createRoleResponse.Role?.Arn) {
      throw new Error('Failed to create launch role');
    }

    // Attach AWS managed policy
    await this.iamClient.send(new AttachRolePolicyCommand({
      RoleName: roleName,
      PolicyArn: 'arn:aws:iam::aws:policy/AWSCloudFormationFullAccess'
    }));

    // Add inline policy with the same permissions as ProductsStack
    const inlinePolicy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: [
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
            'iam:RemoveRoleFromInstanceProfile'
          ],
          Resource: '*'
        },
        {
          Effect: 'Allow',
          Action: [
            's3:GetObject',
            's3:GetObjectVersion',
            's3:PutObject',
            's3:DeleteObject',
            's3:ListBucket',
            's3:GetBucketLocation',
            's3:GetBucketVersioning'
          ],
          Resource: [
            'arn:aws:s3:::cf-templates-*',
            'arn:aws:s3:::cf-templates-*/*',
            'arn:aws:s3:::aws-cloudformation-*',
            'arn:aws:s3:::aws-cloudformation-*/*',
            'arn:aws:s3:::sc-*',
            'arn:aws:s3:::sc-*/*'
          ]
        }
      ]
    };

    // Use JSON.parse to validate the JSON structure before stringifying
    const validatedInlinePolicy = JSON.parse(JSON.stringify(inlinePolicy));

    await this.iamClient.send(new PutRolePolicyCommand({
      RoleName: roleName,
      PolicyName: 'ServiceCatalogLaunchPolicy',
      PolicyDocument: JSON.stringify(validatedInlinePolicy)
    }));

    return createRoleResponse.Role.Arn;
  }

  private async createLaunchConstraint(portfolioId: string, productId: string, launchRoleArn: string): Promise<void> {
    await this.serviceCatalogClient.send(new CreateConstraintCommand({
      PortfolioId: portfolioId,
      ProductId: productId,
      Type: 'LAUNCH',
      Parameters: JSON.stringify({ RoleArn: launchRoleArn }),
      Description: `Launch constraint for product ${productId} created by Event Scheduling Platform`
    }));
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  // Check for help flag
  if (args.includes('--help') || args.includes('-h')) {
    const config = ApplicationConfigManager.getConfig();
    console.log('Service Catalog Registration Tool');
    console.log('');
    console.log('This tool automatically discovers and registers Service Catalog portfolios');
    console.log('and products tagged for the Event Scheduling Platform.');
    console.log('');
    console.log('Prerequisites:');
    console.log('1. Deploy the Event Scheduling Platform first');
    console.log('2. Tag your Service Catalog portfolios and products with:');
    console.log(`   Key: ${config.tagKey}`);
    console.log(`   Value: ${config.tagValue}`);
    console.log('');
    console.log('Usage:');
    console.log('  ts-node register-sc.ts [OPTIONS]');
    console.log('');
    console.log('Options:');
    console.log('  --dry-run          Troubleshooting mode - validate without making changes');
    console.log('  --help, -h         Show this help message');
    console.log('');
    console.log('Region:');
    console.log('  Uses AWS SDK default region configuration');
    return;
  }

  // Parse arguments
  const dryRun = args.includes('--dry-run');

  const registrar = new ServiceCatalogAutoRegistrar(dryRun);
  await registrar.autoRegisterAll();
}

if (require.main === module) {
  main().catch(console.error);
}
