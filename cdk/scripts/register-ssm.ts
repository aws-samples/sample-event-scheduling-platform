#!/usr/bin/env ts-node

import { 
  SSMClient, 
  DescribeDocumentCommand
} from '@aws-sdk/client-ssm';
import { 
  IAMClient,
  GetRoleCommand,
  CreateRoleCommand,
  PutRolePolicyCommand
} from '@aws-sdk/client-iam';
import { ApplicationConfigManager } from 'shared-config';

interface SSMDocumentInfo {
  name: string;
  documentType: string;
  status: string;
  hasRequiredTag: boolean;
  hasAssumeRoleParam: boolean;
  assumeRoleArn?: string;
}

class SSMAutoRegistrar {
  private ssmClient: SSMClient;
  private iamClient: IAMClient;
  private tagKey: string;
  private tagValue: string;
  private dryRun: boolean;
  private applicationConfig = ApplicationConfigManager.getConfig();

  constructor(dryRun: boolean = false) {
    this.dryRun = dryRun;
    
    // Get tag key and value from shared config
    this.tagKey = this.applicationConfig.tagKey;
    this.tagValue = this.applicationConfig.tagValue;
    
    this.ssmClient = new SSMClient({});
    this.iamClient = new IAMClient({});
  }

  async autoRegisterAll(): Promise<void> {
    const mode = this.dryRun ? '🔍 TROUBLESHOOTING MODE' : '🔧 REGISTRATION MODE';
    console.log(`${mode} - SSM Documents`);
    console.log(`🏷️  Looking for tag: ${this.tagKey}=${this.tagValue}`);
    if (this.dryRun) {
      console.log('ℹ️  Dry-run mode: No changes will be made');
    }
    console.log('');

    try {
      // Step 1: Discover all SSM documents with the required tag
      const taggedDocuments = await this.discoverTaggedDocuments();
      
      if (taggedDocuments.length === 0) {
        console.log('ℹ️  No SSM documents found with the required tag.');
        console.log('');
        console.log('📋 To register SSM documents:');
        console.log('1. Tag your SSM documents with:');
        console.log(`   Key: ${this.tagKey}`);
        console.log(`   Value: ${this.tagValue}`);
        console.log('2. Run this script again');
        return;
      }

      console.log(`✅ Found ${taggedDocuments.length} tagged SSM document(s)`);
      console.log('');

      // Step 2: Process each document
      let successCount = 0;
      let errorCount = 0;
      let issuesFound = 0;

      for (const doc of taggedDocuments) {
        try {
          console.log(`📄 Processing: ${doc.name}`);
          const documentIssues = await this.processDocument(doc);
          issuesFound += documentIssues;
          successCount++;
          
          if (this.dryRun) {
            if (documentIssues > 0) {
              console.log(`⚠️  ${doc.name} - Audit completed with ${documentIssues} issue(s)`);
            } else {
              console.log(`✅ ${doc.name} - Audit completed - no issues found`);
            }
          } else {
            console.log(`✅ ${doc.name} - Registration completed`);
          }
        } catch (error) {
          const actionWord = this.dryRun ? 'Audit' : 'Registration';
          console.error(`❌ ${doc.name} - ${actionWord} failed: ${error}`);
          errorCount++;
        }
        console.log('');
      }

      // Step 3: Summary
      if (this.dryRun) {
        console.log('📊 Audit Summary:');
        console.log(`   ✅ Documents Validated: ${successCount}`);
        console.log(`   ❌ Validation Errors: ${errorCount}`);
        console.log(`   ⚠️  Issues Found: ${issuesFound}`);
        console.log(`   📄 Total Documents: ${taggedDocuments.length}`);
      } else {
        console.log('📊 Registration Summary:');
        console.log(`   ✅ Successful: ${successCount}`);
        console.log(`   ❌ Failed: ${errorCount}`);
        console.log(`   📄 Total: ${taggedDocuments.length}`);
      }

      if (successCount > 0) {
        console.log('');
        if (this.dryRun) {
          if (issuesFound > 0) {
            console.log('📋 Audit Results:');
            console.log(`✅ ${successCount} documents validated successfully`);
            console.log(`❌ ${issuesFound} issues found requiring registration`);
            console.log('🔧 Next Steps:');
            console.log('   1. Run "task register" to fix the identified issues');
            console.log('   2. Run "task audit" again to verify fixes');
          } else {
            console.log('📋 Audit Results:');
            console.log('✅ All SSM documents are properly configured');
            console.log('ℹ️  No registration actions needed');
          }
        } else {
          console.log('📋 Registration Complete:');
          console.log('✅ All SSM documents have been processed');
          console.log('🔧 Next Steps:');
          console.log('   1. Run "task audit" to verify all configurations');
          console.log('   2. Test documents through the Event Scheduling Platform web interface');
        }
      }

    } catch (error) {
      console.error(`❌ Auto-registration failed: ${error}`);
      process.exit(1);
    }
  }

  private async discoverTaggedDocuments(): Promise<SSMDocumentInfo[]> {
    console.log('🔍 Discovering tagged SSM documents...');
    console.log(`🔍 Looking for: ${this.tagKey}=${this.tagValue}`);

    const taggedDocuments: SSMDocumentInfo[] = [];

    try {
      // Use Resource Groups Tagging API - most reliable and efficient approach
      // Note: ListDocumentsCommand tag filtering has known issues in some SDK versions
      const { ResourceGroupsTaggingAPIClient, GetResourcesCommand } = await import('@aws-sdk/client-resource-groups-tagging-api');
      const resourceGroupsClient = new ResourceGroupsTaggingAPIClient({});
      
      const response = await resourceGroupsClient.send(
        new GetResourcesCommand({
          TagFilters: [
            {
              Key: this.tagKey,
              Values: [this.tagValue]
            }
          ],
          ResourceTypeFilters: ['ssm:document']
        })
      );

      if (!response.ResourceTagMappingList || response.ResourceTagMappingList.length === 0) {
        console.log('🔍 No SSM documents found with the specified tag');
        return taggedDocuments;
      }

      console.log(`✅ Found ${response.ResourceTagMappingList.length} SSM documents with tag ${this.tagKey}=${this.tagValue}`);

      // Process each document
      for (const resource of response.ResourceTagMappingList) {
        if (!resource.ResourceARN) continue;

        try {
          // Extract document name from ARN: arn:aws:ssm:region:account:document/document-name
          const documentName = resource.ResourceARN.split('/').pop();
          if (!documentName) continue;

          console.log(`✅ Processing document: ${documentName}`);
          
          // Get document details
          const docDetails = await this.ssmClient.send(
            new DescribeDocumentCommand({ Name: documentName })
          );

          const hasAssumeRoleParam = docDetails.Document?.Parameters?.some((param) => 
            param.Name === 'AutomationAssumeRole'
          ) || false;

          taggedDocuments.push({
            name: documentName,
            documentType: docDetails.Document?.DocumentType || 'Unknown',
            status: docDetails.Document?.Status || 'Unknown',
            hasRequiredTag: true,
            hasAssumeRoleParam
          });
        } catch (error) {
          console.warn(`⚠️  Could not process document from ARN ${resource.ResourceARN}: ${error}`);
        }
      }
    } catch (error) {
      console.error('❌ Error discovering SSM documents:', error);
    }

    return taggedDocuments;
  }

  private async processDocument(doc: SSMDocumentInfo): Promise<number> {
    console.log(`   Type: ${doc.documentType}`);
    console.log(`   Status: ${doc.status}`);

    let issuesFound = 0;

    // Validate document type
    if (doc.documentType !== 'Automation') {
      console.log(`   ⚠️  Warning: Document type is "${doc.documentType}". Expected "Automation".`);
      console.log('      The Event Scheduling Platform works best with Automation documents.');
      issuesFound++;
    }

    // Check AutomationAssumeRole parameter
    if (!doc.hasAssumeRoleParam) {
      console.log('   ℹ️  Document does not have AutomationAssumeRole parameter.');
      console.log('      Consider adding this parameter for better security isolation.');
    } else {
      console.log('   ✅ Document has AutomationAssumeRole parameter');
      
      // Try to find or create a suitable assume role
      let assumeRole = await this.findSuitableAssumeRole();
      
      if (!assumeRole) {
        issuesFound++;
        if (this.dryRun) {
          console.log('   ❌ ISSUE: No suitable assume role found');
          console.log('   🔧 FIX: Run registration mode to create assume role automatically');
        } else {
          console.log('   🔧 Creating assume role for SSM document...');
          try {
            assumeRole = await this.createAssumeRole(doc.name);
            console.log(`   ✅ Assume role created: ${assumeRole}`);
            issuesFound--; // Issue was resolved
          } catch (error) {
            throw new Error(`Failed to create assume role: ${error}`);
          }
        }
      } else {
        console.log(`   ✅ Found suitable assume role: ${assumeRole}`);
      }
      
      if (assumeRole) {
        console.log('   💡 Use this in your event provisioning parameters:');
        console.log(`      {"AutomationAssumeRole": ["${assumeRole}"]}`);
      }
    }

    // Document is already tagged, so no additional action needed
    console.log('   ✅ Document properly tagged for Event Scheduling Platform');
    
    return issuesFound;
  }

  private async createAssumeRole(documentName: string): Promise<string> {
    const roleName = `${this.applicationConfig.camelCase}-SSM-AssumeRole-${documentName}`;
    
    try {
      // Check if role already exists
      const existingRole = await this.iamClient.send(new GetRoleCommand({ RoleName: roleName }));
      if (existingRole.Role?.Arn) {
        console.log(`   ℹ️  Assume role already exists: ${roleName}`);
        return existingRole.Role.Arn;
      }
    } catch {
      // Role doesn't exist, create it
    }

    // Create the assume role with the same configuration as ProductsStack
    const trustPolicy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { Service: 'ssm.amazonaws.com' },
          Action: 'sts:AssumeRole'
        }
      ]
    };

    const createRoleResponse = await this.iamClient.send(new CreateRoleCommand({
      RoleName: roleName,
      AssumeRolePolicyDocument: JSON.stringify(trustPolicy),
      Description: `${this.applicationConfig.name} - SSM assume role for ${documentName}`,
      Tags: [
        { Key: this.tagKey, Value: this.tagValue },
        { Key: 'ManagedBy', Value: this.applicationConfig.camelCase }
      ]
    }));

    if (!createRoleResponse.Role?.Arn) {
      throw new Error('Failed to create assume role');
    }

    // Add inline policy with minimal permissions (same as ProductsStack)
    const inlinePolicy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: [
            'ssm:GetAutomationExecution',
            'ssm:DescribeAutomationExecutions'
          ],
          Resource: [
            `arn:aws:ssm:*:*:automation-execution/*`
          ],
          Condition: {
            StringEquals: {
              [`aws:ResourceTag/${this.tagKey}`]: this.tagValue
            }
          }
        }
      ]
    };

    await this.iamClient.send(new PutRolePolicyCommand({
      RoleName: roleName,
      PolicyName: 'MinimalSSMPolicy',
      PolicyDocument: JSON.stringify(inlinePolicy)
    }));

    return createRoleResponse.Role.Arn;
  }

  private async findSuitableAssumeRole(): Promise<string | null> {
    try {
      // Look for Event Scheduling Platform SSM assume role using the same naming pattern as CDK
      const stackPrefix = this.applicationConfig.camelCase;
      
      // Search for roles that match the pattern
      // In a real implementation, you might want to search through IAM roles more systematically
      const potentialRoleNames = [
        `${stackPrefix}-ProductsStack-ssmassumerole277B45EE-Wl1BmLf11e0x`
      ];

      for (const roleName of potentialRoleNames) {
        try {
          const role = await this.iamClient.send(new GetRoleCommand({ RoleName: roleName }));
          if (role.Role?.Arn) {
            return role.Role.Arn;
          }
        } catch {
          // Role doesn't exist, continue searching
        }
      }

      return null;
    } catch {
      return null;
    }
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  // Check for help flag
  if (args.includes('--help') || args.includes('-h')) {
    const config = ApplicationConfigManager.getConfig();
    console.log('SSM Document Registration Tool');
    console.log('');
    console.log('This tool automatically discovers and registers SSM documents tagged for');
    console.log('the Event Scheduling Platform.');
    console.log('');
    console.log('Prerequisites:');
    console.log('1. Tag your SSM documents with:');
    console.log(`   Key: ${config.tagKey}`);
    console.log(`   Value: ${config.tagValue}`);
    console.log('');
    console.log('Usage:');
    console.log('  ts-node register-ssm.ts [OPTIONS]');
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

  const registrar = new SSMAutoRegistrar(dryRun);
  await registrar.autoRegisterAll();
}

if (require.main === module) {
  main().catch(console.error);
}
