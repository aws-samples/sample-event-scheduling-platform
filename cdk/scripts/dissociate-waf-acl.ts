// dissociate-waf-acl.ts

import { CloudFrontClient, GetDistributionConfigCommand, UpdateDistributionCommand } from '@aws-sdk/client-cloudfront';

import {
  ResourceGroupsTaggingAPIClient,
  GetResourcesCommand,
  ResourceTagMapping,
} from '@aws-sdk/client-resource-groups-tagging-api';
import { ApplicationConfigManager } from 'shared-config';

const applicationConfig = ApplicationConfigManager.getConfig();

const getConfigOptions = () => {
  const options: { region?: string } = {};
  options.region = 'us-east-1';
  return options;
};

const cloudfrontClient = new CloudFrontClient(getConfigOptions());
const taggingClient = new ResourceGroupsTaggingAPIClient(getConfigOptions());

async function listTaggedCloudFrontDistributions(tagKey: string, tagValue: string): Promise<string[]> {
  const command = new GetResourcesCommand({
    TagFilters: [
      {
        Key: tagKey,
        Values: [tagValue],
      },
    ],
    ResourceTypeFilters: ['cloudfront:distribution'],
  });

  try {
    const response = await taggingClient.send(command);
    return (response.ResourceTagMappingList || [])
      .map((resource: ResourceTagMapping) => resource.ResourceARN)
      .filter((arn: string | undefined): arn is string => arn !== undefined);
  } catch (error) {
    console.error('Error listing tagged CloudFront distributions:', error);
    throw error;
  }
}

async function disassociateWebACLFromDistribution(distributionId: string): Promise<void> {
  // First, get the current distribution configuration
  const getConfigCommand = new GetDistributionConfigCommand({ Id: distributionId });

  try {
    const { DistributionConfig, ETag } = await cloudfrontClient.send(getConfigCommand);

    if (!DistributionConfig || !ETag) {
      throw new Error(`Unable to retrieve configuration for distribution ${distributionId}`);
    }

    // Remove the WebACLId from the configuration
    DistributionConfig.WebACLId = '';

    // Update the distribution with the new configuration
    const updateCommand = new UpdateDistributionCommand({
      Id: distributionId,
      DistributionConfig,
      IfMatch: ETag,
    });

    await cloudfrontClient.send(updateCommand);
    console.log(`Successfully disassociated Web ACL from distribution: ${distributionId}`);
  } catch (error) {
    console.error(`Error disassociating Web ACL from distribution ${distributionId}:`, error);
    throw error;
  }
}

async function main() {
  try {
    console.log('Fetching tagged CloudFront distributions...');
    const distributions = await listTaggedCloudFrontDistributions(applicationConfig.tagKey, applicationConfig.tagValue);

    if (distributions.length === 0) {
      console.log(
        `No CloudFront distributions found with tag "${applicationConfig.tagKey}=${applicationConfig.tagValue}".`,
      );
      return;
    }
    console.log(`Found ${distributions.length} CloudFront distribution(s) with the specified tag.`);

    for (const distributionArn of distributions) {
      const distributionId = distributionArn.split('/').pop();
      if (!distributionId) {
        console.error(`Unable to extract distribution ID from ARN: ${distributionArn}`);
        continue;
      }

      console.log(`Disassociating Web ACL from distribution: ${distributionId}`);
      await disassociateWebACLFromDistribution(distributionId);
    }

    console.log('Disassociation process completed.');
  } catch (error) {
    console.error('An error occurred:', error);
    process.exit(1);
  }
}

main();
