// The `less` package ships no type declarations, and pulling in `@types/less` for the one test that
// compiles a stylesheet (popup-css.test.ts) is not worth a dev dependency. Declared here to the
// extent that test uses it — the same way the build scripts carry hand-written `.d.cts` files.
declare module "less" {
	interface RenderOutput {
		css: string;
	}

	interface RenderOptions {
		/** Directories to resolve `@import` against. */
		paths?: string[];
		/** Name reported in error messages. */
		filename?: string;
	}

	const less: {
		render(input: string, options?: RenderOptions): Promise<RenderOutput>;
	};

	export default less;
}
