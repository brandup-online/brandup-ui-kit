const config = {
	verbose: true,
	testMatch: ["**/test/**/*.test.ts"],
	testEnvironment: "./FixJSDOMEnvironment.ts",
	transform: {
		"^.+\\.[jt]sx?$": "babel-jest",
		".+\\.(css|styl|less|sass|scss|png|jpg|ttf|woff|woff2)$": "jest-transform-stub",
	},
	moduleNameMapper: {
		"\\.svg$": "<rootDir>/test/__mocks__/svg.ts",
	},
	setupFiles: ["<rootDir>/test/setup.ts"],
	moduleFileExtensions: ["js", "ts"],
};

module.exports = config;
