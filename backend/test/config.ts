export const TEST_CONFIG = {
  MAX_STATE_MACHINES: 3,
  MAX_SSM_DOCUMENTS: 3,
  MAX_SERVICE_CATALOG_PRODUCTS: 3,
  TEST_TAG: { key: 'integration-test', value: 'true' },
  TIMEOUT: {
    EVENT_BRIDGE: 1 * 1000,
    SETUP: 5 * 60 * 1000,
    TEST: 10 * 60 * 1000,
    TEARDOWN: 5 * 60 * 1000,
    SFN: 10 * 60 * 1000,
    TOTAL: 20 * 60 * 1000,
  },
  DELAY: {
    BETWEEN_TESTS: 2000, // 2 seconds
  },
};
