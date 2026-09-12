import { Page } from "./base";
import { pickContent } from "../i18n";
import "./buttons.less";
import { UIKIT } from "@brandup/ui-kit/names";

export default class ButtonsPage extends Page {
	get typeName(): string {
		return "ButtonsPage";
	}
	get header(): string {
		return this.app.model.texts.t((m) => m.pages.buttons);
	}

	protected async onRenderContent(container: HTMLElement) {
		container.insertAdjacentHTML(
			"beforeend",
			await pickContent({ ru: () => import("./buttons.html"), en: () => import("./buttons.en.html") })
		);

		// ожидание ответа: кнопка гаснет на две секунды и второго нажатия не принимает
		this.registerCommand("submit", (context) => {
			const button = context.target;
			button.classList.add(UIKIT.BUTTON.CLASS.STATE.LOADING);
			button.setAttribute("aria-busy", "true");

			setTimeout(() => {
				button.classList.remove(UIKIT.BUTTON.CLASS.STATE.LOADING);
				button.removeAttribute("aria-busy");
			}, 2000);
		});
	}
}
