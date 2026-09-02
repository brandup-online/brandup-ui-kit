import { DOM } from "@brandup/ui";
import { LayerManager, Modal, UIKIT, type Layer } from "@brandup/ui-kit";
import { Page } from "./base";
import html from "./modal.html";
import "./modal.less";

class HelloModal extends Modal {
	constructor() {
		super({ title: "Окно кита" });

		this.body.append(
			DOM.tag("p", null, "Тело окна наполняет наследник — само окно знает только про рамку, слои и закрытие."),
			DOM.tag("p", null, [
				DOM.tag(
					"button",
					{ type: "button", class: "ui-button", command: UIKIT.MODAL.COMMAND.CLOSE },
					"Закрыть"
				),
			])
		);
	}

	override get typeName(): string {
		return "Example.HelloModal";
	}
}

/**
 * Окно, которое обязано кончиться выбором: крестика и закрытия по подложке у него нет.
 *
 * Ответ отдаётся через `onClosing` — окно ещё на экране, поле уже заполнено, — а подписчик
 * `onClosed` читает его, когда окна не стало.
 */
class ConfirmModal extends Modal {
	confirmed = false;

	constructor(question: string) {
		super({ title: question, closeButton: false, closeOnBackdrop: false });

		this.body.append(
			DOM.tag("p", { class: "buttons" }, [
				DOM.tag("button", { type: "button", class: "ui-button primary", command: "confirm-yes" }, "Да"),
				DOM.tag("button", { type: "button", class: "ui-button", command: "confirm-no" }, "Нет"),
			])
		);

		this.registerCommand("confirm-yes", () => {
			this.confirmed = true;
			this.close();
		});
		this.registerCommand("confirm-no", () => this.close());
	}

	override get typeName(): string {
		return "Example.ConfirmModal";
	}
}

/** Окно с попапом внутри: кнопка в теле открывает попап, который встаёт над окном. */
class LayersModal extends Modal {
	constructor() {
		super({ title: "Попап внутри окна" });

		this.body.append(
			DOM.tag("p", null, "Кнопка ниже открывает попап, не закрывая окна."),
			DOM.tag("div", { class: "menu" }, [
				DOM.tag("button", { type: "button", class: "ui-button", command: UIKIT.POPUP.COMMAND.TOGGLE }, "Меню"),
				DOM.tag("div", { class: UIKIT.POPUP.CLASS.ROOT }, [
					DOM.tag("menu", null, [
						DOM.tag("li", null, DOM.tag("a", { href: "" }, "Пункт 1")),
						DOM.tag("li", null, DOM.tag("a", { href: "" }, "Пункт 2")),
					]),
				]),
			])
		);
	}

	override get typeName(): string {
		return "Example.LayersModal";
	}
}

export default class ModalPage extends Page {
	get typeName(): string {
		return "ModalPage";
	}
	get header(): string {
		return "Modal, слои и прокрутка";
	}

	protected async onRenderContent(container: HTMLElement) {
		container.insertAdjacentHTML("beforeend", html);

		const answer = container.querySelector("[data-answer]") as HTMLElement;
		const depth = container.querySelector("[data-depth]") as HTMLElement;
		const panel = container.querySelector("[data-panel]") as HTMLElement;

		const showDepth = () => (depth.textContent = `слоёв открыто: ${LayerManager.count}`);

		container.querySelectorAll("[data-filler]").forEach((elem) => {
			for (let i = 1; i <= 30; i++) elem.appendChild(DOM.tag("p", null, `строка ${i}`));
		});

		this.registerCommand("open", () => {
			new HelloModal();
		});

		this.registerCommand("confirm", () => {
			const modal = new ConfirmModal("Удалить запись?");

			modal.onClosed(() => (answer.textContent = modal.confirmed ? "ответ: да" : "ответ: нет"));
		});

		this.registerCommand("layers", () => {
			const modal = new LayersModal();

			// Стек считается на закрытии тоже: попап и окно уходят по одному, и счётчик это видно.
			modal.onClosed(showDepth);
			window.setTimeout(showDepth);
		});

		// Слой не закрывает себя сам: закрытие — дело того, кто его поставил, а `release` снимает
		// его со стека. Оттого одно и то же `hidePanel` и вызывается менеджером по Escape,
		// и зовётся кнопкой панели.
		let panelLayer: Layer | null = null;

		const hidePanel = () => {
			panel.hidden = true;
			panelLayer?.release();
			panelLayer = null;
			showDepth();
		};

		this.registerCommand("panel", (context) => {
			panel.hidden = false;

			panelLayer = LayerManager.push({
				close: hidePanel,
				element: panel,
				bodyClass: "body-side-panel-opened",
				trapFocus: true,
				returnFocus: context.target,
			});

			showDepth();
		});

		this.registerCommand("panel-close", hidePanel);
	}
}
