import { ApplicationBuilder } from "@brandup/ui-app";
import { uiKitMiddlewareFactory } from "@brandup/ui-kit";
import { ExampleApplicationModel } from "./typings/app";
import { ExampleApplication } from "./app";
import "./styles/styles.less";

import pages from "./middlewares/pages";
import errors from "./middlewares/error";

if (!AbortSignal.prototype.throwIfAborted) {
	AbortSignal.prototype.throwIfAborted = function () {
		if (this.aborted)
			throw new Error('Aborted');
	}
}

if (!AbortSignal.any) {
	AbortSignal.any = (signals: AbortSignal[]): AbortSignal => {
		if (!signals || !signals.length)
			throw new Error('AbortSignal array is empty.');

		const controller = new AbortController();
		signals.forEach(s => s.addEventListener("abort", () => controller.abort(s.reason)))
		return controller.signal;
	};
}

if (!AbortSignal.timeout) {
	AbortSignal.timeout = (milliseconds: number): AbortSignal => {
		const controller = new AbortController();
		window.setTimeout(() => controller.abort("TimeoutError"), milliseconds);
		return controller.signal;
	};
}

const builder = new ApplicationBuilder<ExampleApplicationModel>({});

builder
	.useApp(ExampleApplication)
	.useMiddleware(uiKitMiddlewareFactory)
	.useMiddleware(pages, {
		routes: {
			'/': { page: () => import("./pages/index"), preload: true },
			'/inputs': { page: () => import("./pages/inputs") },
			'/navigation': { page: () => import("./pages/navigation") },
			'/forms': { page: () => import("./pages/forms"), preload: true },
			'/ajax': { page: () => import("./pages/ajax") }
		},
		notfound: { page: () => import("./pages/error/notfound") },
		error: { page: () => import("./pages/error/exception") }
	})
	.useMiddleware(errors);

const app = builder.build({ basePath: "/" });

app.run();