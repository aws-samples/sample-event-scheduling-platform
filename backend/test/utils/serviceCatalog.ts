import {
  ServiceCatalogClient,
  CreateProductCommand,
  CreateProductCommandInput,
  UpdateProductCommand,
  UpdateProductCommandInput,
  DeleteProductCommand,
  DeleteProductCommandInput,
  ServiceCatalogServiceException,
} from '@aws-sdk/client-service-catalog';
import { CONFIG } from '@utils/config';
import { delay } from '@utils/utils';

const serviceCatalogClient = new ServiceCatalogClient({
  maxAttempts: CONFIG.SDK.MAX_ATTEMPTS,
  retryMode: CONFIG.SDK.RETRY_MODE,
});

export interface ServiceCatalogProduct {
  id: string;
  name: string;
  tags: Record<string, string>;
}

export async function createServiceCatalogProduct(name: string): Promise<string> {
  const input: CreateProductCommandInput = {
    Name: name,
    Owner: 'Integration Test',
    ProductType: 'CLOUD_FORMATION_TEMPLATE',
    ProvisioningArtifactParameters: {
      Name: 'Initial Version',
      Type: 'CLOUD_FORMATION_TEMPLATE',
      Info: {
        LoadTemplateFromURL:
          'https://s3.amazonaws.com/cloudformation-templates-us-east-1/S3_Website_Bucket_With_Retain_On_Delete.template',
      },
    },
  };

  try {
    const command = new CreateProductCommand(input);
    const response = await serviceCatalogClient.send(command);
    return response.ProductViewDetail?.ProductViewSummary?.ProductId || '';
  } catch (error) {
    console.error('Error creating Service Catalog product:', error);
    throw error;
  }
}

export async function tagServiceCatalogProducts(
  products: ServiceCatalogProduct[],
  tag: { key: string; value: string },
): Promise<string[]> {
  const taggedProductIds: string[] = [];

  for (const product of products) {
    const input: UpdateProductCommandInput = {
      Id: product.id,
      AddTags: [{ Key: tag.key, Value: tag.value }],
    };

    try {
      await delay(CONFIG.DELAY.BETWEEN_API_CALLS);
      const command = new UpdateProductCommand(input);
      await serviceCatalogClient.send(command);
      taggedProductIds.push(product.id);
    } catch (error) {
      console.error(`Error tagging Service Catalog product ${product.id}:`, error);
      // Continue with the next product
    }
  }

  return taggedProductIds;
}

export async function untagServiceCatalogProducts(productIds: string[], tagKey: string): Promise<void> {
  for (const productId of productIds) {
    const input: UpdateProductCommandInput = {
      Id: productId,
      RemoveTags: [tagKey],
    };

    try {
      await delay(CONFIG.DELAY.BETWEEN_API_CALLS);
      const command = new UpdateProductCommand(input);
      await serviceCatalogClient.send(command);
    } catch (error) {
      console.error(`Error untagging Service Catalog product ${productId}:`, error);
      // Continue with the next product
    }
  }
}

export async function deleteServiceCatalogProducts(productIds: string[]): Promise<void> {
  for (const productId of productIds) {
    const input: DeleteProductCommandInput = {
      Id: productId,
    };

    try {
      await delay(CONFIG.DELAY.BETWEEN_API_CALLS);
      const command = new DeleteProductCommand(input);
      await serviceCatalogClient.send(command);
    } catch (error) {
      if (error instanceof ServiceCatalogServiceException && error.name === 'ResourceNotFoundException') {
        console.warn(`Product ${productId} not found, skipping deletion.`);
      } else {
        console.error(`Error deleting Service Catalog product ${productId}:`, error);
      }
      // Continue with the next product
    }
  }
}
