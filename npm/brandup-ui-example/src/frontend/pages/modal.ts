import { DOM } from "@brandup/ui";
import { LayerManager, Modal, UIKIT, textTag, type Layer } from "@brandup/ui-kit";
import { Page } from "./base";
import { pickContent, type AppTexts } from "../i18n";
import "./modal.less";

class HelloModal extends Modal {
	constructor(texts: AppTexts) {
		super({ title: texts.t((m) => m.demo.modal.helloTitle) });

		this.body.append(
			textTag(
				"p",
				null,
				texts.t((m) => m.demo.modal.helloBody)
			),
			DOM.tag("p", null, [
				textTag(
					"button",
					{ type: "button", class: "ui-button", command: UIKIT.MODAL.COMMAND.CLOSE },
					texts.t((m) => m.demo.modal.close)
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

	constructor(question: string, texts: AppTexts) {
		super({ title: question, closeButton: false, closeOnBackdrop: false });

		this.body.append(
			DOM.tag("p", { class: "buttons" }, [
				textTag(
					"button",
					{ type: "button", class: "ui-button primary", command: "confirm-yes" },
					texts.t((m) => m.demo.modal.yes)
				),
				textTag(
					"button",
					{ type: "button", class: "ui-button", command: "confirm-no" },
					texts.t((m) => m.demo.modal.no)
				),
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
	constructor(texts: AppTexts) {
		super({ title: texts.t((m) => m.demo.modal.layersTitle) });

		this.body.append(
			textTag(
				"p",
				null,
				texts.t((m) => m.demo.modal.layersBody)
			),
			DOM.tag("div", { class: "menu" }, [
				textTag(
					"button",
					{ type: "button", class: "ui-button", command: UIKIT.POPUP.COMMAND.TOGGLE },
					texts.t((m) => m.demo.modal.menu)
				),
				DOM.tag("div", { class: UIKIT.POPUP.CLASS.ROOT }, [
					DOM.tag("menu", null, [
						DOM.tag(
							"li",
							null,
							textTag(
								"a",
								{ href: "" },
								texts.t((m) => m.demo.modal.item1)
							)
						),
						DOM.tag(
							"li",
							null,
							textTag(
								"a",
								{ href: "" },
								texts.t((m) => m.demo.modal.item2)
							)
						),
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
		return this.app.model.texts.t((m) => m.pages.modal);
	}

	protected async onRenderContent(container: HTMLElement) {
		const texts = this.app.model.texts;

		container.insertAdjacentHTML(
			"beforeend",
			await pickContent({ ru: () => import("./modal.html"), en: () => import("./modal.en.html") })
		);

		const answer = container.querySelector("[data-answer]") as HTMLElement;
		const depth = container.querySelector("[data-depth]") as HTMLElement;
		const panel = container.querySelector("[data-panel]") as HTMLElement;

		const showDepth = () => (depth.textContent = texts.t((m) => m.demo.modal.depth, { count: LayerManager.count }));

		container.querySelectorAll("[data-filler]").forEach((elem) => {
			for (let i = 1; i <= 30; i++)
				elem.appendChild(
					textTag(
						"p",
						null,
						texts.t((m) => m.demo.modal.line, { number: i })
					)
				);
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
			new HelloModal(texts);
		});

		this.registerCommand("confirm", () => {
			const modal = new ConfirmModal(
				texts.t((m) => m.demo.modal.question),
				texts
			);

			modal.onClosed(
				() =>
					(answer.textContent = modal.confirmed
						? texts.t((m) => m.demo.modal.answerYes)
						: texts.t((m) => m.demo.modal.answerNo))
			);
		});

		this.registerCommand("layers", () => {
			new LayersModal(texts);
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
