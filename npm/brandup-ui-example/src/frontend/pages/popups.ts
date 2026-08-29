import { Page } from "./base";
import html from "./popups.html";
import "./popups.less";
import { PopupManager } from "@brandup/ui-kit";

export default class PopupsPage extends Page {
	get typeName(): string {
		return "PopupsPage";
	}
	get header(): string {
		return "Popups";
	}

	protected async onRenderContent(container: HTMLElement) {
		container.insertAdjacentHTML("beforeend", html);

		this.registerCommand("open", (context) => {
			PopupManager.toggle(context.target.nextElementSibling as HTMLElement, { initiator: context.target });
		});

		// Координат в стилях нет вовсе — их считает кит: `position: true` ставит попап под
		// кнопкой, переворачивает вверх у нижнего края экрана и прижимает к правому.
		this.registerCommand("anchored", (context) => {
			PopupManager.toggle(context.target.nextElementSibling as HTMLElement, {
				initiator: context.target,
				position: true,
			});
		});

		// Подменю раскрывается вбок: кнопка стоит внутри уже открытого попапа, поэтому родитель
		// остаётся, а не закрывается.
		this.registerCommand("anchored-right", (context) => {
			PopupManager.toggle(context.target.nextElementSibling as HTMLElement, {
				initiator: context.target,
				position: { placement: "right-start", gap: 8 },
			});
		});
	}
}
