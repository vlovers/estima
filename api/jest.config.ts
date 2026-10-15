export default {
  displayName: 'api',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': [
      require.resolve('ts-jest'),
      {
        tsconfig: '<rootDir>/api/tsconfig.spec.json',
      },
    ],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  rootDir: '..',
  testMatch: ['<rootDir>/api/src/**/*.spec.ts'],
};
