import "./modal.less"; // стили окна

import { DOM, UIElement } from "@brandup/ui";
import { LayerManager, type Layer } from "./layer";
import { UIKIT } from "./names";
import { textTag } from "./utils/text";
import closeIcon from "../svg/x.svg";

/** Имена окна — в общем модуле имён кита (см. names.ts). */
const MODAL = UIKIT.MODAL;
const ELEM = MODAL.CLASS.ELEMENT;

let modalIdSeq = 0;

export interface ModalOptions {
	/** Заголовок в шапке; пусто — шапка только с крестиком. */
	title?: string | null;
	/** Дополнительный класс на корне — под оформление конкретного окна. */
	className?: string | null;
	/** Закрывать по клику вне окна (по умолчанию да). */
	closeOnBackdrop?: boolean;
	/** Крестик в шапке (по умолчанию да). */
	closeButton?: boolean;
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
	private readonly __layer: Layer;
	private readonly __closeHandlers: Array<() => void> = [];
	private __closed = false;
	private __disposed = false;

	get typeName(): string {
		return "BrandUp.Modal";
	}

	constructor(options: ModalOptions = {}) {
		super();

		const body = DOM.tag("div", { class: ELEM.BODY });

		// the title is host data — text, not markup (see textTag)
		// Заголовку — свой идентификатор: окно объявляет его своим именем через aria-labelledby,
		// иначе скринридер читает диалог безымянным.
		const titleId = options.title ? `${MODAL.TITLE_ID}${++modalIdSeq}` : undefined;
		const title = titleId ? textTag("div", { class: ELEM.TITLE, id: titleId }, options.title!) : null;

		// Закрытие — через систему команд, как у остальных контролов кита: крестик и подложка
		// объявляют одну и ту же команду, обработчик находит её по ближайшему data-command.
		// Крестик убирают у окна, которое обязано кончиться выбором внутри тела; Esc и подложка
		// при этом остаются на своих настройках — места в шапке они не занимают.
		const closeButton =
			options.closeButton === false
				? null
				: DOM.tag(
						"button",
						{ type: "button", class: ELEM.CLOSE, title: MODAL.TEXT.CLOSE, command: MODAL.COMMAND.CLOSE },
						closeIcon
					);

		// шапки нет вовсе, когда показывать в ней нечего: пустая занимала бы отступ над телом
		const header = title || closeButton ? DOM.tag("div", { class: ELEM.HEADER }, [title, closeButton]) : null;

		const modalWindow = DOM.tag(
			"div",
			{
				class: ELEM.WINDOW,
				role: "dialog",
				"aria-modal": "true",
				"aria-labelledby": titleId,
				// фокус приходит на само окно, когда фокусировать внутри нечего (окно с одним текстом)
				tabindex: "-1",
			},
			[header, body]
		);

		const rootClasses: string[] = [MODAL.CLASS.ROOT];
		if (options.className) rootClasses.push(options.className);

		const root = DOM.tag("div", { class: rootClasses }, [
			DOM.tag(
				"div",
				options.closeOnBackdrop === false
					? { class: ELEM.BACKDROP }
					: { class: ELEM.BACKDROP, command: MODAL.COMMAND.CLOSE }
			),
			modalWindow,
		]);

		this.__body = body;
		this.setElement(root);

		this.registerCommand(MODAL.COMMAND.CLOSE, () => this.close());

		document.body.appendChild(root);

		// Esc, придержанная прокрутка, ловушка и возврат фокуса — за менеджером слоёв: окон
		// бывает несколько (одно поверх другого), и каждое из этого обязано считаться с соседями
		// (см. layer.ts). Слой ставим уже по вставленному в документ окну — ловушке фокуса нужно
		// живое дерево.
		this.__layer = LayerManager.push({
			close: () => this.close(),
			// слоем считается само окно, а не корень с подложкой: фокусу в подложке делать нечего
			element: modalWindow,
			bodyClass: MODAL.CLASS.BODY,
			trapFocus: true,
		});
	}

	/**
	 * Вызывается перед закрытием — наследнику отдать результат или прибрать за собой.
	 * Не путать с {@link onClosed}: та подписка срабатывает после того, как окна не стало.
	 */
	protected onClosing(): void {
		// по умолчанию ничего
	}

	/**
	 * Подписка на закрытие окна — в отличие от {@link onClosing}, уже по закрытому: вызывается
	 * ровно один раз, чем бы оно ни кончилось — крестиком,
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

		this.onClosing();
		this.destroy();
	}

	override destroy(): void {
		// Придти сюда могут дважды: из close() и следом от авто-уничтожения по удалению элемента
		// из DOM (UIElement подписан на MutationObserver). Второй проход обращался бы к уже
		// снятому элементу.
		if (this.__disposed) return;
		this.__disposed = true;

		// Снимаем слой до уборки: он вернёт фокус туда, откуда окно открыли, и подписчики
		// закрытия (ниже) при надобности перебьют это своим — им виднее, куда возвращать каретку.
		this.__layer.release();

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
