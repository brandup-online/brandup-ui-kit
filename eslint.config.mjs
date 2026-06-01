import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default [
	{
		ignores: [
			"**/node_modules/**",
			"**/out/**",
			"**/dist/**",
			"**/server/**",
			"**/wwwroot/**",
			"**/*.less.d.ts",
			"**/svg.d.ts",
			"**/html.d.ts",
		],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		// TS-сорцы: браузерная среда
		files: ["**/*.ts"],
		languageOptions: {
			globals: { ...globals.browser },
		},
		rules: {
			// `{}` как пустой event-map — стандартный паттерн в наследниках UIElement<TEvents>
			"@typescript-eslint/no-empty-object-type": "off",
			// Явные `any` уже есть в коде, не борем
			"@typescript-eslint/no-explicit-any": "off",
			// Неиспользуемые параметры — только варнинг и с допуском "_" префикса
			"@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
			// `!` иногда нужен для нашего паттерна `tb.element!.querySelector(...)` в тестах
			"@typescript-eslint/no-non-null-assertion": "off",
			"no-empty": ["warn", { allowEmptyCatch: true }],
		},
	},
	{
		// Тесты: добавляем Jest globals поверх браузерных
		files: ["**/test/**/*.ts", "**/*.test.ts"],
		languageOptions: {
			globals: { ...globals.jest },
		},
	},
	{
		// Backend TS (example) — Node.js/CJS среда, require() допустим
		files: ["**/src/backend/**/*.ts"],
		languageOptions: {
			globals: { ...globals.node },
		},
		rules: {
			"@typescript-eslint/no-require-imports": "off",
		},
	},
	{
		// CJS-конфиги и скрипты — node-среда
		files: ["**/*.cjs", "**/*.js", "**/scripts/**"],
		languageOptions: {
			globals: { ...globals.node },
			sourceType: "commonjs",
		},
		rules: {
			"@typescript-eslint/no-require-imports": "off",
			"@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
			"no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
		},
	},
	{
		// ESM-конфиги — node-среда
		files: ["**/*.mjs"],
		languageOptions: {
			globals: { ...globals.node },
			sourceType: "module",
		},
	},
	prettier,
];
