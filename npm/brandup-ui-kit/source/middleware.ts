import { Middleware, MiddlewareNext, NavigateContext, StartContext } from "@brandup/ui-app";
import { PopupManager, POPUP_COMMAND, POPUP_CLASS } from "./popup";

export class UiKitMiddleware implements Middleware {
	name = "uikit";

	start(context: StartContext, next: MiddlewareNext) {
		context.app.registerCommand(POPUP_COMMAND, context => {
			if (!context.target.nextElementSibling?.classList.contains(POPUP_CLASS))
				throw new Error('Not found popup elem.');

			PopupManager.open(context.target.nextElementSibling as HTMLElement, { initiator: context.target });
		});

		return next();
	}

	navigate(_context: NavigateContext, next: MiddlewareNext) {
		PopupManager.close(); // закрываем открытое контекстное меню при навигации

		return next();
	}
}