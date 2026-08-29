import { DOM } from "@brandup/ui";
import { Page } from "./base";
import html from "./inputs.html";
import "./inputs.less";

export default class NavigationPage extends Page {
	get typeName(): string {
		return "InputsModel";
	}
	get header(): string {
		return "Input controls";
	}

	protected async onRenderContent(container: HTMLElement) {
		container.insertAdjacentHTML("beforeend", html);

		// «Часть набора отмечена» — состояние без атрибута: в разметке его не записать,
		// браузер читает только свойство. В примере помечаем такой чекбокс `data-indeterminate`,
		// чтобы показанная рядом разметка объясняла, откуда взялся третий вид.
		DOM.queryElements(container, "input[data-indeterminate]").forEach((elem) => {
			(elem as HTMLInputElement).indeterminate = true;
		});

		const controls = DOM.queryElements(container, ".control");
		controls.forEach((control) => {
			const html = control.innerHTML.replace(/[\u00A0-\u9999<>&]/g, (i) => "&#" + i.charCodeAt(0) + ";");
			control.insertAdjacentElement("afterend", DOM.tag("pre", { class: "html" }, html.trim()));
		});
	}
}
