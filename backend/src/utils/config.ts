export const CONFIG = {
  BATCH_SIZE: {
    SFN: 10,
    SC: 20, // Service Catalog
    SSM: 50,
  },
  DELAY: {
    BETWEEN_API_CALLS: 1000, // 1 second
  },
  SDK: {
    RETRY_MODE: 'normal',
    MAX_ATTEMPTS: 40,
  },
};
