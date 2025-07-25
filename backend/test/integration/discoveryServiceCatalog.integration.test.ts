// test/integration/discoveryServiceCatalog.integration.test.ts
import { discoverServiceCatalogProducts } from '@utils/discovery';
import {
  createServiceCatalogProduct,
  tagServiceCatalogProducts,
  untagServiceCatalogProducts,
  deleteServiceCatalogProducts,
  ServiceCatalogProduct,
} from '@test/utils/serviceCatalog';
import { 
  CreatePortfolioCommand,
  AssociateProductWithPortfolioCommand,
  DeletePortfolioCommand,
  ServiceCatalogClient,
  DisassociateProductFromPortfolioCommand
} from '@aws-sdk/client-service-catalog';
import { TEST_CONFIG } from '@test/config';

const serviceCatalogClient = new ServiceCatalogClient({ region: "eu-west-3" });

describe('discoverServiceCatalogProducts Integration Test', () => {
  const createdProducts: ServiceCatalogProduct[] = [];
  let taggedForTest: string[] = [];
  let portfolioId: string;

  beforeAll(async () => {
    jest.setTimeout(TEST_CONFIG.TIMEOUT.TOTAL);

    try {

      const createPortfolioCommand = new CreatePortfolioCommand({
        DisplayName: `TestPortfolio${Date.now()}`,
        ProviderName: 'TestProvider',
      });
      const portfolioResponse = await serviceCatalogClient.send(createPortfolioCommand);
      portfolioId = portfolioResponse.PortfolioDetail!.Id!;

      // Create test Service Catalog products
      for (let i = 0; i < TEST_CONFIG.MAX_SERVICE_CATALOG_PRODUCTS; i++) {
        const productName = `TestProduct${Date.now()}${i}`;
        const productId = await createServiceCatalogProduct(productName);
        createdProducts.push({ id: productId, name: productName, tags: {} });

        // Associate product with portfolio
        const associateCommand = new AssociateProductWithPortfolioCommand({
          ProductId: productId,
          PortfolioId: portfolioId,
        });
        await serviceCatalogClient.send(associateCommand);
      }
      

      taggedForTest = await tagServiceCatalogProducts(createdProducts, TEST_CONFIG.TEST_TAG);

      console.log(`Created and tagged ${taggedForTest.length} Service Catalog products for testing`);
    } catch (error) {
      console.error('Error in test setup:', error);
      throw error;
    }
  }, TEST_CONFIG.TIMEOUT.SETUP);

  afterAll(async () => {
    try {
      for (const product of createdProducts) {
        try {
          const disassociateCommand = new DisassociateProductFromPortfolioCommand({
            ProductId: product.id,
            PortfolioId: portfolioId,
          });
          await serviceCatalogClient.send(disassociateCommand);
        } catch (error) {
          console.error(`Error disassociating product ${product.id}:`, error);
        }
      }  
      await untagServiceCatalogProducts(taggedForTest, TEST_CONFIG.TEST_TAG.key);
      await deleteServiceCatalogProducts(createdProducts.map((product) => product.id));
      if (portfolioId) {
        const deletePortfolioCommand = new DeletePortfolioCommand({ Id: portfolioId });
        await serviceCatalogClient.send(deletePortfolioCommand);
      }
      console.log(`Cleaned up ${createdProducts.length} test Service Catalog products`);
    } catch (error) {
      console.error('Error in test teardown:', error);
    }
  }, TEST_CONFIG.TIMEOUT.TEARDOWN);

  it(
    'should discover the tagged Service Catalog products',
    async () => {
      const discoveredProducts = await discoverServiceCatalogProducts(
        TEST_CONFIG.TEST_TAG.key,
        TEST_CONFIG.TEST_TAG.value,
      );
      console.log(`Discovered ${discoveredProducts.length} Service Catalog products`);
      expect(discoveredProducts).toEqual(expect.arrayContaining(taggedForTest));
      expect(discoveredProducts.length).toBeGreaterThanOrEqual(1);
      expect(discoveredProducts.length).toBeLessThanOrEqual(TEST_CONFIG.MAX_SERVICE_CATALOG_PRODUCTS);
    },
    TEST_CONFIG.TIMEOUT.TEST,
  );

  it(
    'should not discover Service Catalog products with non-matching tags',
    async () => {
      const discoveredProducts = await discoverServiceCatalogProducts('NonExistentTag', 'NonExistentValue');

      expect(discoveredProducts).toHaveLength(0);
    },
    TEST_CONFIG.TIMEOUT.TEST,
  );
});
