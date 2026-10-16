const js = require('@eslint/js');
const parser = require('@typescript-eslint/parser');
const typescript = require('@typescript-eslint/eslint-plugin');

// Scope this security check to authentication and credential persistence.
// Broader API lint adoption is independent of the authentication hotfix.
module.exports = [
  {
    files: ['**/*.ts'],
    languageOptions: { parser, parserOptions: { sourceType: 'module' } },
    plugins: { '@typescript-eslint': typescript },
    rules: {
      ...js.configs.recommended.rules,
      ...typescript.configs.recommended.rules,
      'no-undef': 'off', // TypeScript checks names, including Node/Jest globals.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off', // Existing Nest and repository mocks.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
];
