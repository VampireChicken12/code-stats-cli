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
		ignores: ["**/node_modules/**/*", "**/dist/**/*", "**/releases/**/*"]
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
			ecmaVersion: "latest",
			globals: {
				...globals.node
			},
			parser: tseslint.parser,
			parserOptions: {
				project: "./tsconfig.json",
				tsconfigRootDir: __dirname
			},
			sourceType: "module"
		},
		plugins: {
			"@typescript-eslint": tseslint.plugin,
			promise: promisePlugin
		},
		rules: {
			"@typescript-eslint/explicit-module-boundary-types": "off",
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-floating-promises": "error",
			"@typescript-eslint/no-unused-vars": ["error"],
			"import/first": ["error"],
			"no-empty": ["error", { allowEmptyCatch: true }],
			"no-mixed-spaces-and-tabs": ["error", "smart-tabs"],
			"no-useless-escape": "off",
			"prefer-const": ["error", { destructuring: "any", ignoreReadBeforeAssign: false }],
			"prefer-destructuring": ["error", { array: true, object: true }, { enforceForRenamedProperties: true }],
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
			quotes: ["error", "double", { allowTemplateLiterals: true, avoidEscape: true }],
			semi: ["error", "always"]
		}
	},
	{
		files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
		languageOptions: {
			ecmaVersion: "latest",
			globals: {
				...globals.node
			},
			sourceType: "module"
		}
	}
];
