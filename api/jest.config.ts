export default {
  displayName: 'api',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': '<rootDir>/api/jest-transformer.cjs',
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  rootDir: '..',
  testMatch: ['<rootDir>/api/src/**/*.spec.ts'],
};
