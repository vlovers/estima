export default {
  displayName: 'api',
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/api/tsconfig.spec.json',
      },
    ],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  rootDir: '..',
  testMatch: ['<rootDir>/api/src/**/*.spec.ts'],
};
