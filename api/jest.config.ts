import { createRequire } from 'node:module';

const resolve = createRequire(import.meta.url).resolve;

export default {
  displayName: 'api',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': [
      resolve('ts-jest'),
      {
        tsconfig: '<rootDir>/api/tsconfig.spec.json',
      },
    ],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  rootDir: '..',
  testMatch: ['<rootDir>/api/src/**/*.spec.ts'],
};
