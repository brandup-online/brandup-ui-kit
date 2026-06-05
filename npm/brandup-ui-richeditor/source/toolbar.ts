// Общий (единый для всех редакторов) тулбар форматирования.
// По умолчанию живёт в document.body и позиционируется над активным редактором (position: fixed).
// Если редактор задал toolbarContainer — панель монтируется в него и позиционируется
// относительно него (position: absolute; над контейнером).
// Кнопки диспатчат форматирование напрямую активному редактору (без системы команд,
// т.к. тулбар находится вне привязанных UIElement).

import { DOM } from "@brandup/ui";
import { FORMAT_TOOLS, type FormatTool } from "./format";
import boldIcon from "../svg/bold.svg";
import italicIcon from "../svg/italic.svg";
import strikeIcon from "../svg/strike.svg";
import underlineIcon from "../svg/underline.svg";

const FORMAT_ICONS: Record<FormatTool, string> = {
	bold: boldIcon,
	italic: italicIcon,
	strike: strikeIcon,
	underline: underlineIcon,
};

export const TOOLBAR_CLASS = "ui-richeditor-toolbar";

/** Редактор, которым управляет общий тулбар. */
export interface ToolbarHost {
	readonly editable: HTMLElement;
	readonly formatTools: FormatTool[];
	/** Контейнер для тулбара; null/undefined — document.body (position: fixed над редактором). */
	readonly toolbarContainer?: HTMLElement | null;
	applyFormat(tool: FormatTool): void;
	isToolActive(tool: FormatTool): boolean;
}

const MARGIN = 6;

class FormatToolbar {
	private __elem: HTMLElement | null = null;
	private __buttons: Array<[FormatTool, HTMLButtonElement]> = [];
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
		if (!host.formatTools.length) return;

		this.__active = host;
		this.__build(host.formatTools);
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

		this.__active = null;
		if (this.__elem) this.__elem.classList.remove("visible");
		this.__removeViewportListeners();
	}

	/** Обновить подсветку активных инструментов по текущему выделению. */
	refresh() {
		if (!this.__active) return;
		for (const [tool, btn] of this.__buttons) btn.classList.toggle("active", this.__active.isToolActive(tool));
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
		if (!this.__elem) this.__elem = DOM.tag("div", { class: TOOLBAR_CLASS });
		return this.__elem;
	}

	private __build(tools: FormatTool[]) {
		const key = tools.join(",");
		const elem = this.__ensure();
		if (key === this.__toolsKey && this.__buttons.length) return; // тот же состав — переиспользуем кнопки

		this.__toolsKey = key;
		DOM.empty(elem);
		this.__buttons = [];

		for (const tool of tools) {
			const def = FORMAT_TOOLS[tool];
			const btn = DOM.tag(
				"button",
				{ type: "button", class: "format-button", "data-format-tool": tool, title: def.title },
				FORMAT_ICONS[tool]
			);
			// не даём кнопке забрать фокус, иначе теряется выделение в редакторе
			btn.addEventListener("mousedown", (e) => e.preventDefault());
			btn.addEventListener("click", () => this.__active?.applyFormat(tool));

			elem.appendChild(btn);
			this.__buttons.push([tool, btn]);
		}
	}
}

/** Единый экземпляр тулбара для всех редакторов. */
export const formatToolbar = new FormatToolbar();
