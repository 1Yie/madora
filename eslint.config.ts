import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

import prettier from 'eslint-config-prettier';

import { defineConfig } from 'eslint/config';

export default defineConfig([
	{
		ignores: [
			'src-tauri/**',
			'dist/**',
			'build/**',
			'node_modules/**',
			'src/components/ui/**/*.{ts,tsx}',
			'eslint.config.ts',
			'commitlint.config.js',
		],
	},

	js.configs.recommended,

	...tseslint.configs.recommended,

	{
		...react.configs.flat.recommended,
		files: ['src/**/*.{ts,tsx,js,jsx}'],
	},

	reactHooks.configs.flat['recommended-latest'],

	{
		files: ['**/*.{ts,tsx,js,jsx}'],

		languageOptions: {
			globals: globals.browser,

			parserOptions: {
				ecmaFeatures: {
					jsx: true,
				},
			},
		},

		plugins: {
			'react-refresh': reactRefresh,
		},

		rules: {
			'react/react-in-jsx-scope': 'off',

			'react-refresh/only-export-components': [
				'warn',
				{
					allowConstantExport: true,
				},
			],
		},

		settings: {
			react: {
				version: '19',
			},
		},
	},

	prettier,
]);
