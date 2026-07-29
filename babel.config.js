// Babel 8: helpers injection is the plugin's only job, the `helpers` option is gone.
const plugins = ["@babel/plugin-transform-runtime"];

module.exports = {
	presets: [
		[
			"@babel/preset-env",
			{
				modules: "commonjs",
			},
		],
		"@babel/preset-typescript",
	],
	plugins: plugins,
};
