import { Middleware, MiddlewareNext, NavigateContext, StartContext } from "@brandup/ui-app";
import { LayerManager } from "./layer";
import { UIKIT } from "./names";
import { PopupManager } from "./popup";
import { resetUserScroll } from "./utils/user-scroll";

export class UiKitMiddleware implements Middleware {
	name = "uikit";

	private __navigated = false;

	start(context: StartContext, next: MiddlewareNext) {
		context.app.registerCommand(UIKIT.POPUP.COMMAND.TOGGLE, (context) => {
			if (!context.target.nextElementSibling?.classList.contains(UIKIT.POPUP.CLASS.ROOT))
				throw new Error("Not found popup elem.");

			// команда-переключатель: повторное нажатие по кнопке попап закрывает
			PopupManager.toggle(context.target.nextElementSibling as HTMLElement, { initiator: context.target });
		});

		return next();
	}

	navigate(_context: NavigateContext, next: MiddlewareNext) {
		// Показана другая страница — всё, что висело над прежней, к ней и относилось: контекстное
		// меню, окно, раскрытый список. Закрываем сверху вниз через менеджер слоёв, а не каждый
		// вид по отдельности: слои друг о друге не знают, а забытый остался бы висеть над новой
		// страницей вместе с придержанной прокруткой.
		LayerManager.closeAll();

		// Показана другая страница — прокрутка пользователя по прежней больше ни при чём
		// (см. resetUserScroll). Первую навигацию пропускаем: она показывает ту же страницу,
		// с которой приложение стартовало, и прокрутка во время его загрузки остаётся в силе —
		// именно она и должна отменить автофокус.
		//
		// Забываем до next(), а не после: страницу рисуют внутри него, и её контролы обязаны
		// видеть уже чистый признак. Плата за это — окно, пока новая страница ещё не нарисована:
		// контрол, доинициализированный на прежней в этот момент, посчитает её непрокрученной.
		// Возвращать флаг на неудачной навигации нельзя: редирект успевает нарисовать свою
		// страницу до того, как отмена дойдёт сюда, и она получила бы чужую прокрутку.
		if (this.__navigated) resetUserScroll();
		this.__navigated = true;

		return next();
	}
}
