#!/usr/bin/env ts-node

import { 
  ServiceCatalogClient,
  ListPrincipalsForPortfolioCommand,
  DisassociatePrincipalFromPortfolioCommand
} from '@aws-sdk/client-service-catalog';
import { 
  CloudFormationClient,
  DescribeStacksCommand
} from '@aws-sdk/client-cloudformation';
import { ApplicationConfigManager } from 'shared-config';

class ServiceCatalogCleanup {
  private serviceCatalogClient: ServiceCatalogClient;
  private cloudFormationClient: CloudFormationClient;
  private applicationConfig = ApplicationConfigManager.getConfig();

  constructor() {
    this.serviceCatalogClient = new ServiceCatalogClient({});
    this.cloudFormationClient = new CloudFormationClient({});
  }

  async cleanupAll(): Promise<void> {
    console.log('🧹 Cleaning up Service Catalog principal associations...');
    console.log(`📋 Getting portfolio from ${this.applicationConfig.camelCase}-ProductsStack outputs`);
    console.log('');

    try {
      // Get the ProductsStack outputs
      const stackName = `${this.applicationConfig.camelCase}-ProductsStack`;
      const stackResponse = await this.cloudFormationClient.send(
        new DescribeStacksCommand({ StackName: stackName })
      );

      if (!stackResponse.Stacks || stackResponse.Stacks.length === 0) {
        console.log(`ℹ️  Stack ${stackName} not found or no outputs available`);
        return;
      }

      const stack = stackResponse.Stacks[0];
      if (!stack.Outputs || stack.Outputs.length === 0) {
        console.log(`ℹ️  No outputs found in stack ${stackName}`);
        return;
      }

      // Find the portfolio ID in the outputs
      const portfolioOutput = stack.Outputs.find(output => 
        output.OutputKey === 'SamplePortfolioId'
      );

      if (!portfolioOutput?.OutputValue) {
        console.log('ℹ️  SamplePortfolioId not found in stack outputs');
        console.log('Available outputs:');
        stack.Outputs.forEach(output => {
          console.log(`   - ${output.OutputKey}: ${output.OutputValue}`);
        });
        return;
      }

      const portfolioId = portfolioOutput.OutputValue;
      console.log(`📋 Found portfolio: ${portfolioId}`);

      // Get all principals associated with this portfolio
      const principals = await this.serviceCatalogClient.send(
        new ListPrincipalsForPortfolioCommand({
          PortfolioId: portfolioId
        })
      );

      if (!principals.Principals || principals.Principals.length === 0) {
        console.log('   ✅ No principals associated with this portfolio');
        return;
      }

      console.log(`   🔧 Found ${principals.Principals.length} principal(s) to remove`);

      // Remove each principal association
      let removedCount = 0;
      for (const principal of principals.Principals) {
        if (!principal.PrincipalARN) continue;

        console.log(`   🔧 Removing principal: ${principal.PrincipalARN}`);
        
        try {
          await this.serviceCatalogClient.send(
            new DisassociatePrincipalFromPortfolioCommand({
              PortfolioId: portfolioId,
              PrincipalARN: principal.PrincipalARN
            })
          );
          console.log('   ✅ Principal removed successfully');
          removedCount++;
        } catch (error) {
          console.log(`   ⚠️  Failed to remove principal: ${error}`);
        }
      }

      console.log('');
      console.log(`📊 Cleanup Summary:`);
      console.log(`   ✅ Principals removed: ${removedCount}`);
      console.log(`   📋 Portfolio: ${portfolioId}`);
      console.log('');
      console.log('📋 Next Steps:');
      console.log('1. CDK destroy should now proceed without Service Catalog errors');

    } catch (error) {
      if (error instanceof Error && error.message.includes('does not exist')) {
        console.log(`ℹ️  Stack ${this.applicationConfig.camelCase}-ProductsStack not found - nothing to clean up`);
        return;
      }
      console.error('❌ Cleanup failed:', error);
      throw error;
    }
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  // Check for help flag
  if (args.includes('--help') || args.includes('-h')) {
    const config = ApplicationConfigManager.getConfig();
    console.log('Service Catalog Cleanup Tool');
    console.log('');
    console.log('This tool removes principal associations from the Service Catalog portfolio');
    console.log(`created by the ${config.camelCase}-ProductsStack to allow proper cleanup`);
    console.log('during CDK destroy operations.');
    console.log('');
    console.log('Usage:');
    console.log('  ts-node cleanup-sc-associations.ts');
    console.log('');
    console.log('Options:');
    console.log('  --help, -h         Show this help message');
    console.log('');
    console.log('Region:');
    console.log('  Uses AWS SDK default region configuration');
    return;
  }

  const cleanup = new ServiceCatalogCleanup();
  await cleanup.cleanupAll();
}

main().catch((error) => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});
