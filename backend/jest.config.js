// jest.config.js
const { pathsToModuleNameMapper } = require('ts-jest');
const { compilerOptions } = require('./tsconfig.json');

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  modulePaths: [compilerOptions.baseUrl],
  moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, { prefix: '<rootDir>/' }),
  testMatch: [
    "**/__tests__/**/*.+(ts|tsx|js)",
    "**/?(*.)+(spec|test).+(ts|tsx|js)",
    "**/test/**/*.integration.test.ts"
  ],
  moduleDirectories: ['node_modules', 'src'],
  
  // Added for parallelization
  maxWorkers: '50%', // Use up to 50% of available CPUs
  maxConcurrency: 5, // Run up to 5 tests concurrently
  
  // For CI environment
  reporters: ['default', 'jest-junit'],
  
  // Timeout for integration tests (adjust as needed)
  testTimeout: 300000, // 5 minutes
};
