import "./modal.less"; // стили окна

import { DOM, UIElement } from "@brandup/ui";
import { textTag } from "./utils/text";
import closeIcon from "../svg/x.svg";

export const MODAL_CLASS = "ui-modal";
export const MODAL_OPENED_CLASS = "ui-modal-opened"; // на <body>, чтобы страница не прокручивалась
export const MODAL_CLOSE_COMMAND = "ui-modal-close";

export interface ModalOptions {
	/** Заголовок в шапке; пусто — шапка только с крестиком. */
	title?: string | null;
	/** Дополнительный класс на корне — под оформление конкретного окна. */
	className?: string | null;
	/** Закрывать по клику вне окна (по умолчанию да). */
	closeOnBackdrop?: boolean;
}

/**
 * Базовое модальное окно: затемнение, шапка с заголовком и крестиком, тело.
 *
 * Наследник наполняет {@link body} в собственном конструкторе и живёт до {@link close}.
 * Само окно не знает, что в нём показывают, — только рамку, слои и закрытие.
 *
 * Рендер содержимого намеренно не вызывается отсюда: до возврата из `super()` поля наследника
 * ещё не объявлены, и с `useDefineForClassFields` их объявления затирают всё, что успел
 * присвоить вызванный из конструктора метод.
 */
export default abstract class Modal extends UIElement {
	private readonly __body: HTMLElement;
	private readonly __onKeyDown: (e: KeyboardEvent) => void;
	private readonly __closeHandlers: Array<() => void> = [];
	private __closed = false;
	private __disposed = false;

	get typeName(): string {
		return "BrandUp.Modal";
	}

	constructor(options: ModalOptions = {}) {
		super();

		const body = DOM.tag("div", { class: "modal-body" });

		// закрытие — через систему команд, как у остальных контролов кита; крестик и подложка
		// объявляют одну и ту же команду, обработчик находит её по ближайшему data-command
		const root = DOM.tag("div", { class: [MODAL_CLASS].concat(options.className ? [options.className] : []) }, [
			DOM.tag(
				"div",
				options.closeOnBackdrop === false
					? { class: "modal-backdrop" }
					: { class: "modal-backdrop", command: MODAL_CLOSE_COMMAND }
			),
			DOM.tag("div", { class: "modal-window", role: "dialog", "aria-modal": "true" }, [
				DOM.tag("div", { class: "modal-header" }, [
					// the title is host data — text, not markup (see textTag)
					options.title ? textTag("div", { class: "modal-title" }, options.title) : null,
					DOM.tag(
						"button",
						{ type: "button", class: "modal-close", title: "Закрыть", command: MODAL_CLOSE_COMMAND },
						closeIcon
					),
				]),
				body,
			]),
		]);

		this.__body = body;
		this.setElement(root);

		this.registerCommand(MODAL_CLOSE_COMMAND, () => this.close());

		// Esc слушаем на документе: фокус может быть где угодно внутри окна
		this.__onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				this.close();
			}
		};
		document.addEventListener("keydown", this.__onKeyDown);

		document.body.appendChild(root);
		document.body.classList.add(MODAL_OPENED_CLASS);
	}

	/** Вызывается перед закрытием — наследнику отдать результат или прибрать за собой. */
	protected onClose(): void {
		// по умолчанию ничего
	}

	/**
	 * Подписка на закрытие окна: вызывается ровно один раз, чем бы оно ни кончилось — крестиком,
	 * Esc, подложкой, применением или удалением элемента из DOM. Нужна тому, кто придержал что-то
	 * на время работы окна и обязан отпустить это в любом исходе.
	 *
	 * Подписка на уже закрытое окно срабатывает сразу: иначе придержанное не отпустил бы никто.
	 */
	onClosed(handler: () => void): void {
		if (this.__disposed) handler();
		else this.__closeHandlers.push(handler);
	}

	protected get body(): HTMLElement {
		return this.__body;
	}

	close(): void {
		if (this.__closed) return; // закрыть могут и крестиком, и Esc, и подложкой
		this.__closed = true;

		this.onClose();
		this.destroy();
	}

	override destroy(): void {
		// Придти сюда могут дважды: из close() и следом от авто-уничтожения по удалению элемента
		// из DOM (UIElement подписан на MutationObserver). Второй проход обращался бы к уже
		// снятому элементу.
		if (this.__disposed) return;
		this.__disposed = true;

		document.removeEventListener("keydown", this.__onKeyDown);
		document.body.classList.remove(MODAL_OPENED_CLASS);

		this.element?.remove();

		// После того как окна не стало: подписчик обычно возвращает себе фокус и каретку.
		// Ошибка одного не должна лишать остальных их уборки и рвать разрушение окна.
		const handlers = this.__closeHandlers.splice(0);
		for (const handler of handlers) {
			try {
				handler();
			} catch (error) {
				console.error("Modal: обработчик закрытия завершился ошибкой.", error);
			}
		}

		super.destroy();
	}
}
