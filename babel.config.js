const plugins = [
	[
		'@babel/plugin-transform-runtime', {
			absoluteRuntime: false,
			corejs: false,
			helpers: true,
			useESModules: true
		}
	]
];

module.exports = {
  presets: [
    [
		"@babel/preset-env", {
			modules: "commonjs",
    	}
	],
	"@babel/preset-typescript"
  ],
  plugins: plugins
};