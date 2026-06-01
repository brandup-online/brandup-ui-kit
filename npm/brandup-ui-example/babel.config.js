const plugins = [["@babel/plugin-transform-runtime", { helpers: true }]];

module.exports = {
	presets: [
		"@babel/preset-env",
		"@babel/preset-typescript",
	],
	plugins: plugins,
};
