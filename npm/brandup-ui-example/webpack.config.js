"use strict";

const path = require("path");
const fs = require("fs/promises");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const CleanCSSPlugin = require("less-plugin-clean-css");
const TerserPlugin = require("terser-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const parseLessVars = require("@brandup/ui-kit/build/parse-less-vars.cjs");
const buildTheme = require("@brandup/ui-kit/build/build-theme.cjs");
const { sources } = require("webpack");

const THEME_FILE_NAME = "theme.css";
const themeFile = path.resolve(__dirname, "uikit.vars.less");
const darkThemeFile = path.resolve(__dirname, "uikit.dark.vars.less");

/**
 * Puts a separate `theme.css` beside the bundle.
 *
 * The light theme itself is already baked into the bundle — `modifyVars` below substitutes it. This
 * file exists for the second one: it declares the dark variant under `:root[data-theme="dark"]`,
 * and the switch in the example's header changes nothing but the attribute on `<html>`.
 *
 * The variant is a delta over the main theme rather than a copy of it, and now that component
 * inputs refer to the palette, almost nothing but the palette lands in that delta: recolouring the
 * whole example costs a dozen values in `uikit.dark.vars.less`.
 *
 * The file is handed to webpack as an asset of ours rather than written to disk behind its back:
 * with `output.clean` everything foreign in the build directory is deleted, and a theme written by
 * hand would disappear on the next rebuild.
 */
class UiKitThemePlugin {
	constructor() {
		/**
		 * The built theme and a fingerprint of the files it was built from.
		 *
		 * Building the theme is a full less compilation, and twice over: the main one plus the
		 * variant. Under `--watch` a rebuild happens on every edit of any source, while the theme
		 * only changes when its own files are edited — so the result is kept until they are.
		 */
		this.__cache = null;
	}

	/** A fingerprint of the theme inputs: mtime and size — enough to notice a change. */
	async __stamp() {
		const stat = async (file) => {
			const info = await fs.stat(file);

			return `${file}:${info.mtimeMs}:${info.size}`;
		};

		return (await Promise.all([themeFile, darkThemeFile].map(stat))).join("|");
	}

	async __build() {
		const stamp = await this.__stamp();
		if (this.__cache && this.__cache.stamp === stamp) return this.__cache.css;

		const css = await buildTheme({
			theme: themeFile,
			variants: [{ selector: ':root[data-theme="dark"]', theme: darkThemeFile }],
		});

		this.__cache = { stamp, css };

		return css;
	}

	apply(compiler) {
		compiler.hooks.thisCompilation.tap("UiKitThemePlugin", (compilation) => {
			compilation.hooks.processAssets.tapPromise(
				{ name: "UiKitThemePlugin", stage: compilation.PROCESS_ASSETS_STAGE_ADDITIONAL },
				async () => {
					compilation.emitAsset(THEME_FILE_NAME, new sources.RawSource(await this.__build()));
				}
			);

			// The link tag is added by us, and necessarily last among the stylesheets: the theme
			// overrides the bundle's defaults, and at equal weight only what comes below can do
			// that. A link written in the template would stand above — HtmlWebpackPlugin appends
			// its own tags to the end of `<head>` — and the theme would lose to the bundle
			// everywhere except in the dark variant, which wins by selector weight rather than by
			// order. That is, precisely where the separate file exists for: nobody would see a
			// theme edit made without rebuilding the bundle.
			//
			// `publicPath` comes from here too: the path to the theme has to be worked out the same
			// way as for every other asset, or it is lost when deployed anywhere but the site root.
			// It is taken from the hook's own data — that is the path HtmlWebpackPlugin has already
			// signed the bundle's tags with. Recomputing it from `compilation.outputOptions` is not
			// allowed: the plugin has a `publicPath` option of its own, and wherever the two differ
			// the theme would go somewhere the bundle does not.
			HtmlWebpackPlugin.getHooks(compilation).alterAssetTagGroups.tap("UiKitThemePlugin", (data) => {
				const prefix = data.publicPath ?? "";

				data.headTags.push({
					tagName: "link",
					voidTag: true,
					meta: { plugin: "UiKitThemePlugin" },
					attributes: { rel: "stylesheet", href: `${prefix}${THEME_FILE_NAME}` },
				});

				return data;
			});

			// rebuild the theme when its own files are edited, not only the page sources
			compilation.fileDependencies.add(themeFile);
			compilation.fileDependencies.add(darkThemeFile);
		});
	}
}

const bundleOutputDir = "./wwwroot/dist";
const frontDir = path.resolve(__dirname, "src", "frontend");

const lessLoaderOptions = {
	webpackImporter: true,
	implementation: require.resolve("less"),
	lessOptions: {
		math: "always",
		plugins: [new CleanCSSPlugin({ advanced: false })],
		modifyVars: parseLessVars(themeFile),
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

	// dev-server отдаёт бандл с корня, поэтому абсолютный publicPath; прод-сборка остаётся относительной
	const publicPath = isDevBuild ? "/" : "./";

	console.log(`NODE_ENV: "${process.env.NODE_ENV}"`);
	console.log(`isDevBuild: ${isDevBuild}`);

	return [
		{
			mode: isDevBuild ? "development" : "production",
			devServer: {
				static: {
					directory: path.join(__dirname, bundleOutputDir),
					publicPath: "/",
				},
				historyApiFallback: true, // клиентский роутинг SPA (/textbox, /dropdown и т.д.)
				hot: false, // приложение не поддерживает HMR — используем полную перезагрузку
				liveReload: true,
				open: true,
				port: 8080,
				proxy: [
					{
						// API отдаёт express-сервер (npm run start), фронт проксирует к нему
						context: ["/_ajax", "/_form"],
						target: "https://localhost:8316",
						secure: false,
						changeOrigin: true,
					},
				],
			},
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
				publicPath: publicPath,
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
					publicPath: publicPath,
				}),
				new UiKitThemePlugin(),
			],
		},
	];
};
