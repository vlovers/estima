export default {
  displayName: 'api',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', {
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        target: 'es2022',
      },
      module: { type: 'commonjs' },
    }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  rootDir: '..',
  testMatch: ['<rootDir>/api/src/**/*.spec.ts'],
};
