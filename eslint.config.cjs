const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const react = require('eslint-plugin-react');
const reactHooks = require('eslint-plugin-react-hooks');
const testingLibrary = require('eslint-plugin-testing-library');
const prettier = require('eslint-config-prettier');

/** @type {import('eslint').Linter.FlatConfig[]} */
module.exports = [
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**']
  },
  js.configs.recommended,
  // Keep TypeScript-specific rules away from plain .js/.cjs files like config files.
  ...tseslint.configs.recommended.map((cfg) => ({
    ...cfg,
    files: ['**/*.{ts,tsx}']
  })),

  // Node/CommonJS globals for tooling/config files.
  {
    files: ['**/*.cjs', '**/*.cts', 'vite.config.ts'],
    languageOptions: {
      globals: {
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        __dirname: 'readonly',
        process: 'readonly'
      }
    }
  },

  // Node globals for repo scripts.
  {
    files: ['scripts/**/*.{js,mjs,cjs,ts,cts}'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly'
      }
    }
  },

  // Service worker runs in a worker-like global scope.
  {
    files: ['public/sw.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        self: 'readonly',
        caches: 'readonly',
        fetch: 'readonly',
        Response: 'readonly',
        URL: 'readonly'
      }
    }
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true }
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        File: 'readonly'
      }
    },
    plugins: {
      react,
      'react-hooks': reactHooks
    },
    settings: {
      react: { version: 'detect' }
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off'
    }
  },

  // Jest globals for tests.
  {
    files: ['**/__tests__/**/*.{ts,tsx}', '**/*.{test,spec}.{ts,tsx}'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        jest: 'readonly'
      }
    },
    plugins: {
      // Ensures rule definitions exist so eslint-disable comments like
      // "testing-library/no-node-access" don't error.
      'testing-library': testingLibrary
    },
    rules: {
      // Tests often legitimately need loose typing and CommonJS imports.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off'
    }
  },

  // Boundary code: allow "any" where we intentionally deal with unknown external data.
  {
    files: [
      'jest.setup.ts',
      'src/store/persistence/**/*.{ts,tsx}',
      'src/store/persistence/migrations/**/*.{ts,tsx}',
      'src/import/**/*.{ts,tsx}'
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off'
    }
  },
  prettier
];
