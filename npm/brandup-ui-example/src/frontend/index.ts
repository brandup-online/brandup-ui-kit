import { ApplicationBuilder } from "@brandup/ui-app";
import { uiKitMiddlewareFactory } from "@brandup/ui-kit";
import { ExampleApplicationModel } from "./typings/app";
import { ExampleApplication } from "./app";
import "./pages/base";
import "./styles/styles.less";

import pages from "./middlewares/pages";
import errors from "./middlewares/error";

const builder = new ApplicationBuilder<ExampleApplicationModel>({});

builder
	.useApp(ExampleApplication)
	.useMiddleware(uiKitMiddlewareFactory)
	.useMiddleware(pages, {
		routes: {
			"/": { page: () => import("./pages/index") },
			"/styles": { page: () => import("./pages/styles") },
			"/inputs": { page: () => import("./pages/inputs") },
			"/popups": { page: () => import("./pages/popups") },
			"/textbox": { page: () => import("./pages/textbox") },
			"/dropdown": { page: () => import("./pages/dropdown") },
		},
		notfound: { page: () => import("./pages/error/notfound") },
		error: { page: () => import("./pages/error/exception") },
	})
	.useMiddleware(errors);

const app = builder.build({ basePath: "/" });

app.run();
