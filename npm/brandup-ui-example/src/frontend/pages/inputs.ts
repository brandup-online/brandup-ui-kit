import { DOM } from "@brandup/ui";
import { Page } from "./base";
import html from "./inputs.html";
import "./inputs.less";

export default class InputsPage extends Page {
	get typeName(): string {
		return "InputsModel";
	}
	get header(): string {
		return "Input controls";
	}

	protected async onRenderContent(container: HTMLElement) {
		container.insertAdjacentHTML("beforeend", html);

		// "Part of the set is ticked" is a state with no attribute: it cannot be written in markup,
		// the browser reads the property only. In the example such a checkbox is marked with
		// `data-indeterminate` so the markup shown beside it explains where the third look came
		// from.
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
