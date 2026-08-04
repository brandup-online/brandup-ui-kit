// Общий (единый для всех редакторов) тулбар форматирования.
// По умолчанию живёт в document.body и позиционируется над активным редактором (position: fixed).
// Если редактор задал toolbarContainer — панель монтируется в него и позиционируется
// относительно него (position: absolute; над контейнером).
// Кнопки диспатчат форматирование напрямую активному редактору (без системы команд,
// т.к. тулбар находится вне привязанных UIElement).

import { DOM } from "@brandup/ui";
import { POPUP_CLASS, PopupManager } from "@brandup/ui-kit";
import { EDITOR_ACTIONS, FORMAT_TOOLS, type EditorAction, type FormatTool } from "./format";
import { EMOJIS } from "./emoji";
import boldIcon from "../svg/bold.svg";
import italicIcon from "../svg/italic.svg";
import strikeIcon from "../svg/strike.svg";
import underlineIcon from "../svg/underline.svg";
import emojiIcon from "../svg/emoji.svg";
import eraseIcon from "../svg/erase.svg";
import undoIcon from "../svg/undo.svg";
import redoIcon from "../svg/redo.svg";

const FORMAT_ICONS: Record<FormatTool, string> = {
	bold: boldIcon,
	italic: italicIcon,
	strike: strikeIcon,
	underline: underlineIcon,
};

const ACTION_ICONS: Record<EditorAction, string> = {
	emoji: emojiIcon,
	erase: eraseIcon,
	undo: undoIcon,
	redo: redoIcon,
};

export const TOOLBAR_CLASS = "ui-richeditor-toolbar";
export const EMOJI_PICKER_CLASS = "ui-richeditor-emoji";

/** Редактор, которым управляет общий тулбар. */
export interface ToolbarHost {
	readonly editable: HTMLElement;
	readonly formatTools: FormatTool[];
	/** Действия (очистка формата, отмена/повтор); пусто/undefined — кнопок действий нет. */
	readonly editorActions?: EditorAction[];
	/** Контейнер для тулбара; null/undefined — document.body (position: fixed над редактором). */
	readonly toolbarContainer?: HTMLElement | null;
	applyFormat(tool: FormatTool): void;
	isToolActive(tool: FormatTool): boolean;
	applyAction?(action: EditorAction): void;
	/** false — кнопка действия недоступна (нечего отменять/очищать). */
	isActionEnabled?(action: EditorAction): boolean;
	/** Вставка текста в каретку — для панели смайликов. */
	insertText?(text: string): void;
}

const MARGIN = 6;

class FormatToolbar {
	private __elem: HTMLElement | null = null;
	private __emojiPicker: HTMLElement | null = null;
	private __buttons: Array<[FormatTool, HTMLButtonElement]> = [];
	private __actionButtons: Array<[EditorAction, HTMLButtonElement]> = [];
	private __active: ToolbarHost | null = null;
	private __toolsKey = "";
	private __inContainer = false;
	private readonly __reposition = () => this.reposition();
	private __resizeObserver: ResizeObserver | null = null;

	constructor() {
		// единый листенер на весь app: подсветка активных инструментов по текущему выделению.
		// refresh() сам проверяет наличие активного редактора, поэтому отдельных per-editor листенеров не нужно.
		if (typeof document !== "undefined") document.addEventListener("selectionchange", () => this.refresh());
	}

	/** Показать тулбар для редактора (на фокусе): перестроить кнопки, спозиционировать, показать. */
	attach(host: ToolbarHost) {
		const actions = host.editorActions ?? [];
		if (!host.formatTools.length && !actions.length) return;

		this.__active = host;
		this.__build(host.formatTools, actions);
		this.refresh();

		const elem = this.__ensure();
		const container = host.toolbarContainer ?? document.body;
		this.__inContainer = container !== document.body;

		if (elem.parentElement !== container) container.appendChild(elem);
		elem.classList.toggle("in-container", this.__inContainer);
		elem.classList.add("visible");

		if (this.__inContainer) {
			// позиционирование задаёт CSS (absolute; bottom: 100% относительно контейнера) — JS не нужен;
			// сбрасываем inline-координаты от предыдущего body-режима, чтобы не перекрывали CSS
			elem.style.left = "";
			elem.style.top = "";
			this.__removeViewportListeners();
		} else {
			window.addEventListener("scroll", this.__reposition, { passive: true });
			window.addEventListener("resize", this.__reposition, { passive: true });
			// рост высоты редактора (многострочный ввод) сдвигает его верх — пересчитываем позицию
			if (typeof ResizeObserver !== "undefined") {
				this.__resizeObserver ??= new ResizeObserver(this.__reposition);
				this.__resizeObserver.observe(host.editable);
			}
			this.reposition();
		}
	}

	/** Скрыть тулбар, если он обслуживает этот редактор (на blur/destroy). */
	detach(host: ToolbarHost) {
		if (this.__active !== host) return;

		this.__closeEmoji();
		this.__active = null;
		if (this.__elem) this.__elem.classList.remove("visible");
		this.__removeViewportListeners();
	}

	/** Обновить подсветку активных инструментов и доступность действий по текущему состоянию. */
	refresh() {
		const host = this.__active;
		if (!host) return;

		for (const [tool, btn] of this.__buttons) btn.classList.toggle("active", host.isToolActive(tool));
		// хост может не реализовывать isActionEnabled — тогда кнопка всегда доступна
		for (const [action, btn] of this.__actionButtons) btn.disabled = host.isActionEnabled?.(action) === false;
	}

	/** Пересчитать позицию над активным редактором (только для режима body/fixed). */
	reposition() {
		if (!this.__active || !this.__elem || this.__inContainer) return;

		const rect = this.__active.editable.getBoundingClientRect();
		const elem = this.__elem;
		const top = rect.top - elem.offsetHeight - MARGIN;
		elem.style.left = `${Math.max(4, rect.left)}px`;
		elem.style.top = `${Math.max(4, top)}px`;
	}

	private __removeViewportListeners() {
		// capture должен совпадать с addEventListener (там { passive: true } → capture=false), иначе не снимется
		window.removeEventListener("scroll", this.__reposition);
		window.removeEventListener("resize", this.__reposition);
		this.__resizeObserver?.disconnect();
	}

	private __ensure(): HTMLElement {
		if (!this.__elem) {
			this.__elem = DOM.tag("div", { class: TOOLBAR_CLASS });

			// Панель нигде не должна забирать фокус, иначе редактор теряет выделение, а blur
			// прячет сам тулбар. Слушатель висит на корне, а не на кнопках: до disabled-кнопки
			// событие не доходит (браузер их не диспатчит), да и клик по фону панели между
			// кнопками иначе тоже уводил бы фокус. Дочерние элементы покрываются всплытием.
			this.__elem.addEventListener("mousedown", (e) => e.preventDefault());
		}

		return this.__elem;
	}

	private __build(tools: FormatTool[], actions: EditorAction[]) {
		const key = `${tools.join(",")}|${actions.join(",")}`;
		const elem = this.__ensure();
		if (key === this.__toolsKey && elem.firstChild) return; // тот же состав — переиспользуем кнопки

		this.__toolsKey = key;
		DOM.empty(elem);
		this.__buttons = [];
		this.__actionButtons = [];

		for (const tool of tools) {
			const def = FORMAT_TOOLS[tool];
			const btn = DOM.tag(
				"button",
				{ type: "button", class: "format-button", "data-format-tool": tool, title: def.title },
				FORMAT_ICONS[tool]
			);
			btn.addEventListener("click", () => this.__active?.applyFormat(tool));

			elem.appendChild(btn);
			this.__buttons.push([tool, btn]);
		}

		if (tools.length && actions.length) elem.appendChild(DOM.tag("div", { class: "split" }));

		for (const action of actions) {
			const def = EDITOR_ACTIONS[action];
			const btn = DOM.tag(
				"button",
				{ type: "button", class: "action-button", "data-editor-action": action, title: def.title },
				ACTION_ICONS[action]
			);
			if (action === "emoji") btn.addEventListener("click", (e) => this.__toggleEmoji(btn, e));
			else btn.addEventListener("click", () => this.__active?.applyAction?.(action));

			elem.appendChild(btn);
			this.__actionButtons.push([action, btn]);
		}

		// панель пережила перестройку кнопок — возвращаем её в тулбар, чтобы не собирать заново
		if (this.__emojiPicker) elem.appendChild(this.__emojiPicker);
	}

	private __toggleEmoji(initiator: HTMLButtonElement, e: MouseEvent) {
		// PopupManager вешает свой слушатель закрытия на body прямо в open(), то есть во время
		// этого же клика: до body событие ещё не дошло, слушатель успел бы его получить и закрыть
		// панель сразу после открытия. Штатно попап открывается из command-обработчика на window,
		// куда событие приходит последним, — здесь роль этого играет остановка всплытия.
		e.stopPropagation();

		PopupManager.open(this.__ensureEmojiPicker(), { initiator });
	}

	private __ensureEmojiPicker(): HTMLElement {
		if (this.__emojiPicker) return this.__emojiPicker;

		const picker = DOM.tag("div", { class: `${POPUP_CLASS} ${EMOJI_PICKER_CLASS}` });

		const fragment = document.createDocumentFragment();
		for (const emoji of EMOJIS)
			fragment.appendChild(DOM.tag("button", { type: "button", class: "emoji", tabindex: "-1", title: emoji }, emoji));
		picker.appendChild(fragment);

		// фокус панель не забирает — mousedown гасится общим слушателем на корне тулбара
		picker.addEventListener("click", (e) => {
			const target = (e.target as HTMLElement).closest<HTMLElement>(".emoji");
			if (!target) return;

			this.__active?.insertText?.(target.textContent ?? "");
			PopupManager.close();
		});

		this.__ensure().appendChild(picker);
		this.__emojiPicker = picker;

		return picker;
	}

	/** Закрыть панель смайликов, если открыта именно она (тулбар уходит — попап не должен остаться). */
	private __closeEmoji() {
		if (this.__emojiPicker?.classList.contains("opened")) PopupManager.close();
	}
}

/** Единый экземпляр тулбара для всех редакторов. */
export const formatToolbar = new FormatToolbar();
