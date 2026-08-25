import { Page } from "./base";
import html from "./buttons.html";
import "./buttons.less";
import { UIKIT } from "@brandup/ui-kit/names";

export default class ButtonsPage extends Page {
	get typeName(): string {
		return "ButtonsPage";
	}
	get header(): string {
		return "Buttons";
	}

	protected async onRenderContent(container: HTMLElement) {
		container.insertAdjacentHTML("beforeend", html);

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
