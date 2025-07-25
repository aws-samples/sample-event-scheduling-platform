// test/integration/discoverySSM.integration.test.ts
import { discoverSSMDocuments } from '@utils/discovery';
import {
  createSSMDocument,
  tagSSMDocuments,
  untagSSMDocuments,
  deleteSSMDocuments,
  SSMDocument,
} from '@test/utils/systemManager';
import { TEST_CONFIG } from '@test/config';

describe('discoverSSMDocuments Integration Test', () => {
  const createdDocuments: SSMDocument[] = [];
  let taggedForTest: string[] = [];

  beforeAll(async () => {
    jest.setTimeout(TEST_CONFIG.TIMEOUT.TOTAL);

    try {
      // Create test SSM documents
      for (let i = 0; i < TEST_CONFIG.MAX_SSM_DOCUMENTS; i++) {
        const docName = `TestDoc${Date.now()}${i}`;
        await createSSMDocument(docName);
        createdDocuments.push({ name: docName, tags: {} });
      }

      taggedForTest = await tagSSMDocuments(createdDocuments, TEST_CONFIG.TEST_TAG);

      console.log(`Created and tagged ${taggedForTest.length} SSM documents for testing`);
    } catch (error) {
      console.error('Error in test setup:', error);
      throw error;
    }
  }, TEST_CONFIG.TIMEOUT.SETUP);

  afterAll(async () => {
    try {
      await untagSSMDocuments(taggedForTest, TEST_CONFIG.TEST_TAG.key);
      await deleteSSMDocuments(createdDocuments.map((doc) => doc.name));
      console.log(`Cleaned up ${createdDocuments.length} test SSM documents`);
    } catch (error) {
      console.error('Error in test teardown:', error);
    }
  }, TEST_CONFIG.TIMEOUT.SETUP);

  it(
    'should discover the tagged SSM documents',
    async () => {
      const discoveredDocs = await discoverSSMDocuments(TEST_CONFIG.TEST_TAG.key, TEST_CONFIG.TEST_TAG.value);
      console.log(`Discovered ${discoveredDocs.length} SSM documents`);
      expect(discoveredDocs).toEqual(expect.arrayContaining(taggedForTest));
      expect(discoveredDocs.length).toBeGreaterThanOrEqual(1);
      expect(discoveredDocs.length).toBeLessThanOrEqual(TEST_CONFIG.MAX_SSM_DOCUMENTS);
    },
    TEST_CONFIG.TIMEOUT.TEST,
  );

  it(
    'should not discover SSM documents with non-matching tags',
    async () => {
      const discoveredDocs = await discoverSSMDocuments('NonExistentTag', 'NonExistentValue');

      expect(discoveredDocs).toHaveLength(0);
    },
    TEST_CONFIG.TIMEOUT.TEST,
  );
});
