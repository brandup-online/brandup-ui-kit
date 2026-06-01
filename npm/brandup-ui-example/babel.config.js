const plugins = [
	[
		'@babel/plugin-transform-runtime', {
			absoluteRuntime: false,
			corejs: false,
			helpers: true,
			useESModules: true
		}
	]
]; // '@babel/plugin-transform-runtime'

const isModern = process.env.BROWSERS_ENV === 'modern';

module.exports = {
  presets: [
    [
		"@babel/preset-env", {
			targets: isModern ? { esmodules: true } : undefined,
    	}
	],
    "@babel/preset-typescript"
  ],
  plugins: plugins
};