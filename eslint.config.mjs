import eslint from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import { configs as perfectionist } from "eslint-plugin-perfectionist";
import prettierRecommended from "eslint-plugin-prettier/recommended";
import promisePlugin from "eslint-plugin-promise";
import globals from "globals";
import { dirname } from "path";
import tseslint from "typescript-eslint";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default [
	{
		ignores: ["dist/**/*", "releases/**/*"]
	},
	eslint.configs.recommended,
	...tseslint.configs.recommendedTypeChecked.map((config) => ({
		...config,
		files: ["**/*.ts"]
	})),
	importPlugin.flatConfigs.recommended,
	importPlugin.flatConfigs.typescript,
	promisePlugin.configs["flat/recommended"],
	prettierRecommended,
	perfectionist["recommended-natural"],
	{
		files: ["**/*.ts"],
		languageOptions: {
			parser: tseslint.parser,
			ecmaVersion: "latest",
			sourceType: "module",
			globals: {
				...globals.node
			},
			parserOptions: {
				project: "./tsconfig.json",
				tsconfigRootDir: __dirname
			}
		},
		plugins: {
			"@typescript-eslint": tseslint.plugin,
			import: importPlugin,
			promise: promisePlugin
		},
		rules: {
			"@typescript-eslint/no-unused-vars": ["error"],
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/explicit-module-boundary-types": "off",
			"@typescript-eslint/no-floating-promises": "error",
			quotes: ["error", "double", { avoidEscape: true, allowTemplateLiterals: true }],
			semi: ["error", "always"],
			"prettier/prettier": [
				"error",
				{
					arrowParens: "always",
					endOfLine: "crlf",
					printWidth: 150,
					semi: true,
					singleQuote: false,
					tabWidth: 2,
					trailingComma: "none",
					useTabs: true
				}
			],
			"prefer-const": ["error", { destructuring: "any", ignoreReadBeforeAssign: false }],
			"prefer-destructuring": [
				"error",
				{ array: true, object: true },
				{ enforceForRenamedProperties: true }
			],
			"no-useless-escape": "off",
			"no-empty": ["error", { allowEmptyCatch: true }],
			"no-mixed-spaces-and-tabs": ["error", "smart-tabs"],
			"import/first": ["error"]
		}
	},
	{
		files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
		languageOptions: {
			ecmaVersion: "latest",
			sourceType: "module",
			globals: {
				...globals.node
			}
		}
	}
];