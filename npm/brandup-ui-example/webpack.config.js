"use strict";

const path = require("path");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const CleanCSSPlugin = require("less-plugin-clean-css");
const TerserPlugin = require("terser-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const parseLessVars = require("@brandup/ui-kit/build/parse-less-vars.cjs");

const bundleOutputDir = "./wwwroot/dist";
const frontDir = path.resolve(__dirname, "src", "frontend");

const lessLoaderOptions = {
	webpackImporter: true,
	implementation: require.resolve("less"),
	lessOptions: {
		math: "always",
		plugins: [new CleanCSSPlugin({ advanced: false })],
		modifyVars: parseLessVars(),
	},
};

const splitChunks = {
	cacheGroups: {
		vendors: {
			test: /[\\/]node_modules[\\/]/,
			reuseExistingChunk: true,
			enforce: true,
		},
		styles: {
			// предотвращает дублирование одинаковых less-импортов на выходе
			test: /\.(css|scss|less)$/,
			reuseExistingChunk: true,
			enforce: true,
		},
		images: {
			test: /\.(svg|jpg|png)$/,
			reuseExistingChunk: true,
			enforce: true,
		},
	},
};

module.exports = (_env) => {
	const isDevBuild = process.env.NODE_ENV !== "production";

	console.log(`NODE_ENV: "${process.env.NODE_ENV}"`);
	console.log(`isDevBuild: ${isDevBuild}`);

	return [
		{
			mode: isDevBuild ? "development" : "production",
			entry: {
				app: path.resolve(__dirname, "src", "frontend", "index.ts"),
			},
			resolve: {
				extensions: [".js", ".jsx", ".ts", ".tsx", ".less"],
			},
			output: {
				path: path.join(__dirname, bundleOutputDir),
				filename: "[name].js",
				chunkFilename: isDevBuild ? "[name].js" : "[name].[contenthash].js",
				iife: true,
				clean: true,
				publicPath: "./",
			},
			module: {
				rules: [
					{
						test: /\.(?:ts|js|mjs|cjs)$/,
						exclude: {
							and: [/node_modules/],
							not: [/@brandup/],
						},
						use: {
							loader: "babel-loader",
						},
					},
					{
						test: /\.(le|c)ss$/,
						use: [
							{ loader: MiniCssExtractPlugin.loader },
							{ loader: "css-loader", options: { importLoaders: 1 } },
							{ loader: "less-loader", options: lessLoaderOptions },
						],
					},
					{
						test: /\.html$/,
						include: /pages/,
						type: "asset/source",
					},
					{
						test: /\.svg$/,
						type: "asset/source",
						use: [
							{
								loader: "svgo-loader",
								options: {
									configFile: path.join(__dirname, "svgo.config.mjs"),
									floatPrecision: 2,
								},
							},
						],
					},
					{
						test: /\.(png|jpg|jpeg|gif)$/,
						type: "asset",
						parser: {
							dataUrlCondition: {
								maxSize: 25000,
							},
						},
					},
				],
			},
			optimization: {
				splitChunks: splitChunks,
				concatenateModules: false,
				minimize: !isDevBuild,
				minimizer: [
					new TerserPlugin({
						terserOptions: {
							compress: true,
							keep_classnames: false,
							keep_fnames: false,
							format: {
								comments: false,
							},
						},
						extractComments: false,
					}),
				],
				removeAvailableModules: false,
				removeEmptyChunks: true,
				usedExports: true,
			},
			plugins: [
				new MiniCssExtractPlugin({
					filename: "[name].css",
					chunkFilename: isDevBuild ? "[id].css" : "[id].[contenthash].css",
					ignoreOrder: true,
				}),
				new HtmlWebpackPlugin({
					filename: "index.html",
					template: path.join(frontDir, "template.html"),
					publicPath: "./",
				}),
			],
		},
	];
};
