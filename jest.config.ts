import type { Config } from "jest";

const config: Config = {
	verbose: true,
	testMatch: ["**/test/**/*.test.ts"],
	testEnvironment: "./FixJSDOMEnvironment.ts",
	transform: {
		"^.+\\.[jt]sx?$": "babel-jest",
		".+\\.(css|styl|less|sass|scss|png|jpg|ttf|woff|woff2)$": "jest-transform-stub",
	},
	modulePaths: ["<rootDir>/npm/brandup-ui-dropdown/node_modules"],
	moduleNameMapper: {
		"\\.svg$": "<rootDir>/test/__mocks__/svg.ts",
		// Пакеты кита разрешаются через симлинки в node_modules соседнего пакета (см. modulePaths).
		// У richeditor такого симлинка нет, поэтому его потребители (messageeditor, textbox)
		// не собирались вовсе — резолвим на исходники явно.
		"^@brandup/ui-richeditor$": "<rootDir>/npm/brandup-ui-richeditor/source/index.ts",
	},
	setupFiles: ["<rootDir>/test/setup.ts"],
	moduleFileExtensions: ["js", "ts"],
};

export default config;
