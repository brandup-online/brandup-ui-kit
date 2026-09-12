import { ApplicationBuilder } from "@brandup/ui-app";
import { uiKitMiddlewareFactory } from "@brandup/ui-kit";
import type { ExampleApplicationModel } from "./typings/app";
import { ExampleApplication } from "./app";
import "./pages/base";
import { applyLanguage } from "./i18n";
import { applyStoredTheme } from "./theme-switch";
import "./styles/styles.less";

import pages from "./middlewares/pages";
import errors from "./middlewares/error";

// Тема — первым делом: это атрибут на `<html>`, и чем раньше он встанет, тем меньше страница
// успеет показать чужую палитру. Язык к этому моменту уже применён — его ставит `./i18n`
// при загрузке модуля, до того как движок прочитает `<html lang>`.
applyStoredTheme();

// Язык готовится до постройки приложения: тексты оболочки уходят в модель, из которой приложение
// собирает шапку, а подписи контролов кита объявляются тем же вызовом. Подпись попадает в разметку
// в момент постройки контрола, и первую страницу строит как раз `run()` — объявленные позже
// словари ей бы уже не достались.
applyLanguage().then((texts) => {
	const builder = new ApplicationBuilder<ExampleApplicationModel>({ texts });

	builder
		.useApp(ExampleApplication)
		.useMiddleware(uiKitMiddlewareFactory)
		.useMiddleware(pages, {
			routes: {
				"/": { page: () => import("./pages/index") },
				"/styles": { page: () => import("./pages/styles") },
				"/inputs": { page: () => import("./pages/inputs") },
				"/buttons": { page: () => import("./pages/buttons") },
				"/popups": { page: () => import("./pages/popups") },
				"/modal": { page: () => import("./pages/modal") },
				"/textbox": { page: () => import("./pages/textbox") },
				"/richeditor": { page: () => import("./pages/richeditor") },
				"/messageeditor": { page: () => import("./pages/messageeditor") },
				"/dropdown": { page: () => import("./pages/dropdown") },
			},
			notfound: { page: () => import("./pages/error/notfound") },
			error: { page: () => import("./pages/error/exception") },
		})
		.useMiddleware(errors);

	builder.build({ basePath: "/" }).run();
});
