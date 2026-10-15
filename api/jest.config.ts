import { fileURLToPath } from 'node:url';

const transformerPath = fileURLToPath(new URL('./jest-transformer.cjs', import.meta.url));

export default {
  displayName: 'api',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': transformerPath,
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  rootDir: '..',
  testMatch: ['<rootDir>/api/src/**/*.spec.ts'],
};
