
/**
 * This module contains two Lambda functions related to Service Catalog:
 *
 * 1. The 'handler' function retrieves detailed information about a SPECIFIC Service Catalog product,
 *    including its name, description, support details, and other metadata.
 *
 * 2. The 'handlerSc' function discovers ALL Service Catalog products tagged with a specific key-value
 *    pair and fetches detailed information for each of those products.
 *
 * Both functions interact with the AWS Service Catalog API to retrieve and process product data.
 */
import { Handler } from 'aws-lambda';
import { ServiceCatalogClient, DescribeProductAsAdminCommand } from '@aws-sdk/client-service-catalog';
import { CONFIG } from '@utils/config';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { discoverServiceCatalogProducts } from '@utils/discovery';
import { ApplicationConfigManager } from 'shared-config';

const tracer = new Tracer({ serviceName: 'discovery' });

const serviceCatalogClient = tracer.captureAWSv3Client(
  new ServiceCatalogClient({
    maxAttempts: CONFIG.SDK.MAX_ATTEMPTS,
    retryMode: CONFIG.SDK.RETRY_MODE,
  }),
);

interface ServiceCatalogProductDetails {
  Distributor: string;
  Name: string;
  ShortDescription: string;
  SupportDescription: string;
  SupportEmail: string;
  SupportUrl: string;
}

async function getServiceCatalogProductDetails(productId: string): Promise<ServiceCatalogProductDetails> {
  try {
    const command = new DescribeProductAsAdminCommand({ Id: productId });
    const response = await serviceCatalogClient.send(command);

    const productViewDetail = response.ProductViewDetail;
    const productInfo = productViewDetail?.ProductViewSummary;

    if (!productInfo) {
      throw new Error('Product information not found');
    }

    return {
      Distributor: productInfo.Distributor || '',
      Name: productInfo.Name || '',
      ShortDescription: productInfo.ShortDescription || '',
      SupportDescription: productInfo.SupportDescription || '',
      SupportEmail: productInfo.SupportEmail || '',
      SupportUrl: productInfo.SupportUrl || '',
    };
  } catch (error) {
    console.error('Error retrieving product details:', error);
    throw error;
  }
}

export const handler: Handler = async (event) => {
  try {
    const productId = event.productId; // Assuming the productId is passed in the event

    if (!productId) {
      throw new Error('Product ID is required');
    }

    const productDetails = await getServiceCatalogProductDetails(productId);

    return {
      statusCode: 200,
      body: JSON.stringify(productDetails),
    };
  } catch (error) {
    console.error('Error getting Service Catalog product details:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: (error as Error).message }),
    };
  }
};

export const handlerSc: Handler = async () => {
  try {
    const applicationConfig = ApplicationConfigManager.getConfig();
    const tagKey = applicationConfig.tagKey;
    const tagValue = applicationConfig.tagValue;

    // Discover Service Catalog products with the specified tag key and value
    const productIds = await discoverServiceCatalogProducts(tagKey, tagValue) || [];

    // Fetch detailed information for each product
    const products = await Promise.all(productIds.map(async (productId) => {
      const details = await getServiceCatalogProductDetails(productId);
      return {
        id: productId,
        ...details
      };
    }));

    return products;
  } catch (error) {
    console.error('Error discovering Service Catalog products:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: (error as Error).message }),
    };
  }
};
