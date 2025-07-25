import { Tracer } from '@aws-lambda-powertools/tracer';
import { Logger } from '@aws-lambda-powertools/logger';
import { SSMClient, ListDocumentsCommand, ListDocumentsCommandInput } from '@aws-sdk/client-ssm';

import {
  ServiceCatalogClient,
  SearchProductsAsAdminCommand,
  SearchProductsAsAdminCommandInput,
  DescribeProductAsAdminCommand,
  DescribeProductAsAdminCommandInput,
  ServiceCatalogServiceException,
  ListPortfoliosForProductCommand,
  ListPortfoliosForProductCommandInput,
} from '@aws-sdk/client-service-catalog';

import { delay } from '@utils/utils';
import { CONFIG } from '@utils/config';

const tracer = new Tracer({ serviceName: 'discovery' });
const logger = new Logger({ serviceName: 'discovery' });

const ssmClient = tracer.captureAWSv3Client(
  new SSMClient({
    maxAttempts: CONFIG.SDK.MAX_ATTEMPTS,
    retryMode: CONFIG.SDK.RETRY_MODE,
  }),
);

const serviceCatalogClient = tracer.captureAWSv3Client(
  new ServiceCatalogClient({
    maxAttempts: CONFIG.SDK.MAX_ATTEMPTS,
    retryMode: CONFIG.SDK.RETRY_MODE,
  }),
);

export async function discoverSSMDocuments(tagKey: string, tagValue: string): Promise<string[]> {
  const documents: string[] = [];
  let nextToken: string | undefined;
  const batchSize = CONFIG.BATCH_SIZE.SSM;

  do {
    const input: ListDocumentsCommandInput = {
      NextToken: nextToken,
      MaxResults: batchSize,
      Filters: [
        {
          Key: 'DocumentType',
          Values: ['Automation'],
        },
        {
          Key: `tag:${tagKey}`,
          Values: [tagValue],
        },
      ],
    };
    const command = new ListDocumentsCommand(input);

    try {
      const response = await ssmClient.send(command);

      const documentBatch = response.DocumentIdentifiers
        ?.map((doc) => doc.Name) // Extract document names directly
        .filter((name): name is string => name !== undefined) || [];
      documents.push(...documentBatch);

      nextToken = response.NextToken;

      if (nextToken) {
        await delay(CONFIG.DELAY.BETWEEN_API_CALLS);
      }
    } catch (error) {
      logger.error('Error discovering SSM documents', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  } while (nextToken);

  return documents; // Return a plain array of document names
}



export async function discoverServiceCatalogProducts(tagKey: string, tagValue: string): Promise<string[]> {
  const products: string[] = [];
  let nextPageToken: string | undefined;

  do {
    try {
      await delay(CONFIG.DELAY.BETWEEN_API_CALLS);

      const input: SearchProductsAsAdminCommandInput = {
        PageToken: nextPageToken,
        PageSize: CONFIG.BATCH_SIZE.SC,
      };
      const command = new SearchProductsAsAdminCommand(input);
      const response = await serviceCatalogClient.send(command);

      for (const productViewDetail of response.ProductViewDetails || []) {
        if (productViewDetail.ProductViewSummary?.ProductId) {
          const productId = productViewDetail.ProductViewSummary.ProductId;
          await delay(CONFIG.DELAY.BETWEEN_API_CALLS);

          const listPortfoliosInput: ListPortfoliosForProductCommandInput = {
            ProductId: productId,
          };
          const listPortfoliosCommand = new ListPortfoliosForProductCommand(listPortfoliosInput);
          const listPortfoliosResponse = await serviceCatalogClient.send(listPortfoliosCommand);

          const portfolioIds = listPortfoliosResponse.PortfolioDetails?.map((portfolio) => portfolio.Id || '');

          if (portfolioIds && portfolioIds.length > 0) {
            const describeProductInput: DescribeProductAsAdminCommandInput = {
              Id: productId,
            };
            const describeProductCommand = new DescribeProductAsAdminCommand(describeProductInput);
            const describeProductResponse = await serviceCatalogClient.send(describeProductCommand);

            if (describeProductResponse.Tags?.some((tag) => tag.Key === tagKey && tag.Value === tagValue)) {
              products.push(productId);
            }
          }
        }
      }

      nextPageToken = response.NextPageToken;
    } catch (error) {
      if (error instanceof ServiceCatalogServiceException) {
        if (error.$metadata?.httpStatusCode === 429 || (error.$metadata?.attempts && error.$metadata.attempts >= 5)) {
          logger.warn('Rate limit reached or max retries exceeded. Stopping discovery process.', {
            error: error.message,
            httpStatusCode: error.$metadata.httpStatusCode,
            attempts: error.$metadata.attempts,
          });
          break;
        }
      }
      logger.error('Error listing Service Catalog products', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  } while (nextPageToken);

  return products;
}
