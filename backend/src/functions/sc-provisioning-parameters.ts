/**
 * This Lambda function retrieves provisioning parameters for a given Service Catalog product.
 * It fetches the latest provisioning artifact ID, determines the launch path ID, and then
 * retrieves the provisioning parameters associated with that artifact and path. This information
 * is crucial for properly configuring and provisioning the product.
 */
import { Handler } from 'aws-lambda';
import {
  ServiceCatalogClient,
  DescribeProductCommand,
  DescribeProductCommandInput,
  ListLaunchPathsCommand,
  ListLaunchPathsCommandInput,
  DescribeProvisioningParametersCommand,
  DescribeProvisioningParametersCommandInput
} from '@aws-sdk/client-service-catalog';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { CONFIG } from '@utils/config';

const tracer = new Tracer({ serviceName: 'discovery' });

const serviceCatalogClient = tracer.captureAWSv3Client(
  new ServiceCatalogClient({
    maxAttempts: CONFIG.SDK.MAX_ATTEMPTS,
    retryMode: CONFIG.SDK.RETRY_MODE,
  })
);

interface ProvisioningParameterDetails {
  ParameterKey: string;
  ParameterType: string;
  DefaultValue?: string;
  Description?: string;
  IsNoEcho?: boolean;
}

async function getLatestProvisioningArtifactId(productId: string): Promise<string> {
  const input: DescribeProductCommandInput = {
    Id: productId,
  };

  try {
    const command = new DescribeProductCommand(input);
    const response = await serviceCatalogClient.send(command);

    if (response.ProvisioningArtifacts && response.ProvisioningArtifacts.length > 0) {
      // Sort provisioning artifacts by creation time (descending) and get the latest one
      const latestArtifact = response.ProvisioningArtifacts.sort((a, b) =>
        (b.CreatedTime?.getTime() || 0) - (a.CreatedTime?.getTime() || 0)
      )[0];

      return latestArtifact.Id || '';
    } else {
      throw new Error('No provisioning artifacts found for the product');
    }
  } catch (error) {
    console.error('Error getting latest provisioning artifact:', error);
    throw error;
  }
}

async function getPathId(productId: string): Promise<string> {
  const input: ListLaunchPathsCommandInput = {
    ProductId: productId,
  };

  try {
    const command = new ListLaunchPathsCommand(input);
    const response = await serviceCatalogClient.send(command);

    if (response.LaunchPathSummaries && response.LaunchPathSummaries.length > 0) {
      return response.LaunchPathSummaries[0].Id || '';
    } else {
      throw new Error('No launch paths found for the product');
    }
  } catch (error) {
    console.error('Error getting launch path ID:', error);
    throw error;
  }
}

async function describeProvisioningParameters(
  productId: string,
  provisioningArtifactId: string,
  pathId: string
): Promise<ProvisioningParameterDetails[]> {
  const input: DescribeProvisioningParametersCommandInput = {
    ProductId: productId,
    ProvisioningArtifactId: provisioningArtifactId,
    PathId: pathId, // Path ID is required if there are multiple paths
  };

  try {
    const command = new DescribeProvisioningParametersCommand(input);
    const response = await serviceCatalogClient.send(command);

    if (response.ProvisioningArtifactParameters) {
      return response.ProvisioningArtifactParameters.map(param => ({
        ParameterKey: param.ParameterKey || '',
        ParameterType: param.ParameterType || '',
        DefaultValue: param.DefaultValue,
        Description: param.Description,
        IsNoEcho: param.IsNoEcho,
      }));
    } else {
      return [];
    }
  } catch (error) {
    console.error('Error describing provisioning parameters:', error);
    throw error;
  }
}

export const handler: Handler = async (event) => {
  try {
    const { productId, provisioningArtifactId } = event;

    if (!productId) {
      throw new Error('Product ID is required');
    }

    let artifactId = provisioningArtifactId;
    if (!artifactId) {
      artifactId = await getLatestProvisioningArtifactId(productId);
    }

    const pathId = await getPathId(productId); // Fetch the Path ID

    const parameters = await describeProvisioningParameters(productId, artifactId, pathId);

    return parameters;
  } catch (error) {
    console.error('Error in Lambda handler:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: (error as Error).message }),
    };
  }
};
