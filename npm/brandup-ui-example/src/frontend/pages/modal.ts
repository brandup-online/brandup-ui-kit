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
	private __refreshDepth: (() => void) | null = null;

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

		// Стек меняют не только кнопки этой страницы: попап внутри окна открывает кит, а Escape
		// снимает верхний слой мимо любого обработчика. Событий у стека нет, поэтому счётчик
		// пересчитывается после каждого клика и нажатия — отложенно, чтобы попасть уже после
		// обработчика, которым слой поставили или сняли.
		this.__refreshDepth = () => window.setTimeout(showDepth);
		document.addEventListener("click", this.__refreshDepth);
		document.addEventListener("keydown", this.__refreshDepth);

		showDepth();

		this.registerCommand("open", () => {
			new HelloModal();
		});

		this.registerCommand("confirm", () => {
			const modal = new ConfirmModal("Удалить запись?");

			modal.onClosed(() => (answer.textContent = modal.confirmed ? "ответ: да" : "ответ: нет"));
		});

		this.registerCommand("layers", () => {
			new LayersModal();
		});

		// Слой не закрывает себя сам: закрытие — дело того, кто его поставил, а `release` снимает
		// его со стека. Оттого одно и то же `hidePanel` и вызывается менеджером по Escape,
		// и зовётся кнопкой панели.
		let panelLayer: Layer | null = null;

		const hidePanel = () => {
			panel.hidden = true;
			panelLayer?.release();
			panelLayer = null;
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
		});

		this.registerCommand("panel-close", hidePanel);
	}

	// Слушатели висят на документе, а страница живёт до ухода с неё: без снятия каждый визит
	// добавлял бы ещё одну пару.
	override destroy() {
		if (this.__refreshDepth) {
			document.removeEventListener("click", this.__refreshDepth);
			document.removeEventListener("keydown", this.__refreshDepth);
			this.__refreshDepth = null;
		}

		super.destroy();
	}
}
