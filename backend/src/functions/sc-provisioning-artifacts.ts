/**
 * This Lambda function retrieves a list of provisioning artifacts for a given Service Catalog product.
 * Provisioning artifacts contain the deployment details and configuration data required to provision
 * the product. This information can be used during the provisioning process.
 */
import { Handler } from 'aws-lambda';
import {
  ServiceCatalogClient,
  ListProvisioningArtifactsCommand,
  ListProvisioningArtifactsCommandInput,
  ProvisioningArtifactDetail
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

async function listProvisioningArtifacts(productId: string): Promise<ProvisioningArtifactDetail[]> {
  const input: ListProvisioningArtifactsCommandInput = {
    ProductId: productId,
  };

  try {
    const command = new ListProvisioningArtifactsCommand(input);
    const response = await serviceCatalogClient.send(command);

    if (response.ProvisioningArtifactDetails) {
      return response.ProvisioningArtifactDetails;
    } else {
      return [];
    }
  } catch (error) {
    console.error('Error listing provisioning artifacts:', error);
    throw error;
  }
}

export const handler: Handler = async (event) => {
  try {
    const { productId } = event;

    if (!productId) {
      throw new Error('Product ID is required');
    }

    const artifacts = await listProvisioningArtifacts(productId);

    return artifacts.map(artifact => ({
      Id: artifact.Id,
      Name: artifact.Name,
      Description: artifact.Description,
      CreatedTime: artifact.CreatedTime,
      Active: artifact.Active
    }));
  } catch (error) {
    console.error('Error in Lambda handler:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: (error as Error).message }),
    };
  }
};
