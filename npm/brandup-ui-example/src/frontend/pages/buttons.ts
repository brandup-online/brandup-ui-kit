import type { CommandContext } from "@brandup/ui";
import { Page } from "./base";
import { pickContent } from "../i18n";
import "./buttons.less";

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

		// Ожидание ответа: кнопка гаснет на две секунды и второго нажатия не принимает. Класс
		// ставить не нужно — пока Promise команды не завершился, @brandup/ui держит на кнопке
		// executing, а кит рисует его как loading. Скринридеру о состоянии говорит сама команда.
		//
		// У каждой кнопки своя команда: повторный запуск @brandup/ui не пускает на уровне команды,
		// а не элемента, и с одной общей вторая кнопка молча не нажималась бы, пока ждёт первая.
		const submit = async (context: CommandContext) => {
			const button = context.target;
			button.setAttribute("aria-busy", "true");

			try {
				await new Promise((resolve) => setTimeout(resolve, 2000));
			} finally {
				button.removeAttribute("aria-busy");
			}
		};

		this.registerCommand("submit-primary", submit);
		this.registerCommand("submit-default", submit);
	}
}
