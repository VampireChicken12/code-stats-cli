module.exports = {
	env: {
		node: true,
		es2021: true
	},
	root: true,
	extends: [
		"eslint:recommended",
		"plugin:@typescript-eslint/recommended-type-checked",
		"plugin:prettier/recommended",
		"plugin:import/recommended",
		"plugin:import/typescript",
		"plugin:prettier/recommended",
		"plugin:promise/recommended",
		"plugin:perfectionist/recommended-natural"
	],
	parser: "@typescript-eslint/parser",
	parserOptions: {
		ecmaFeatures: {
			jsx: true
		},
		ecmaVersion: "latest",
		sourceType: "module",
		project: "./tsconfig.json",
		tsconfigRootDir: __dirname
	},
	plugins: ["@typescript-eslint", "prettier"],
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
		"prefer-const": [
			"error",
			{
				destructuring: "any",
				ignoreReadBeforeAssign: false
			}
		],
		"prefer-destructuring": [
			"error",
			{
				array: true,
				object: true
			},
			{
				enforceForRenamedProperties: true
			}
		],
		"no-useless-escape": "off",
		"no-empty": ["error", { allowEmptyCatch: true }],
		"no-mixed-spaces-and-tabs": ["error", "smart-tabs"],
		"import/first": ["error"]
	}
};
