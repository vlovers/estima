export default {
  displayName: 'api-integration',
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/api/tsconfig.integration.json',
      },
    ],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  transformIgnorePatterns: ['/node_modules/(?!mutation-boundary/)'],
  rootDir: '..',
  testMatch: ['<rootDir>/api/src/**/*.int-spec.ts'],
  testTimeout: 60000,
};
