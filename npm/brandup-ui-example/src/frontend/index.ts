import { ApplicationBuilder } from "@brandup/ui-app";
import { uiKitMiddlewareFactory } from "@brandup/ui-kit";
import { ExampleApplicationModel } from "./typings/app";
import { ExampleApplication } from "./app";
import "./pages/base";
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
			'/': { page: () => import("./pages/index") },
			'/styles': { page: () => import("./pages/styles") },
			'/inputs': { page: () => import("./pages/inputs") },
			'/popups': { page: () => import("./pages/popups") },
			'/textbox': { page: () => import("./pages/textbox") },
			'/message-editor': { page: () => import("./pages/message-editor") }
		},
		notfound: { page: () => import("./pages/error/notfound") },
		error: { page: () => import("./pages/error/exception") }
	})
	.useMiddleware(errors);

const app = builder.build({ basePath: "/" });

app.run();