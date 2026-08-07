// Общий (единый для всех редакторов) тулбар форматирования.
// По умолчанию живёт в document.body и позиционируется над активным редактором (position: fixed).
// Если редактор задал toolbarContainer — панель монтируется в него и позиционируется
// относительно него (position: absolute; над контейнером).
// Кнопки диспатчат форматирование напрямую активному редактору (без системы команд,
// т.к. тулбар находится вне привязанных UIElement).

import { DOM } from "@brandup/ui";
import { PopupManager } from "@brandup/ui-kit";
import {
	BLOCK_TYPES,
	DEFAULT_BLOCK,
	EDITOR_ACTIONS,
	FORMAT_TOOLS,
	type BlockType,
	type EditorAction,
	type FormatTool,
} from "./format";
import { createEmojiPicker } from "./emoji";
import boldIcon from "../svg/bold.svg";
import italicIcon from "../svg/italic.svg";
import strikeIcon from "../svg/strike.svg";
import underlineIcon from "../svg/underline.svg";
import spoilerIcon from "../svg/spoiler.svg";
import codeIcon from "../svg/mono.svg";
import linkIcon from "../svg/link.svg";
import unlinkIcon from "../svg/unlink.svg";
import applyIcon from "../svg/apply.svg";
import quoteIcon from "../svg/quote.svg";
import codeblockIcon from "../svg/codeblock.svg";
import emojiIcon from "../svg/emoji.svg";
import eraseIcon from "../svg/erase.svg";
import undoIcon from "../svg/undo.svg";
import redoIcon from "../svg/redo.svg";

const FORMAT_ICONS: Record<FormatTool, string> = {
	bold: boldIcon,
	italic: italicIcon,
	strike: strikeIcon,
	underline: underlineIcon,
	spoiler: spoilerIcon,
	code: codeIcon,
	link: linkIcon,
};

// Обычный текст кнопки не имеет: повторное нажатие активной кнопки возвращает блок к нему.
const BLOCK_ICONS: Partial<Record<BlockType, string>> = {
	quote: quoteIcon,
	code: codeblockIcon,
};

const ACTION_ICONS: Record<EditorAction, string> = {
	emoji: emojiIcon,
	erase: eraseIcon,
	undo: undoIcon,
	redo: redoIcon,
};

// Код есть и инструментом (моноширинный), и типом блока — панель сводит их в одну кнопку.
const CODE_TOOL: FormatTool = "code";
const CODE_BLOCK: BlockType = "code";
const MERGED_CODE_TITLE = "Код";

// Ссылка — единственный инструмент, у которого есть данные: кнопка не переключает её, а
// показывает в панели поле адреса вместо кнопок.
const LINK_TOOL: FormatTool = "link";
export const LINK_ROW_CLASS = "link-row";
// панель показывает поле адреса вместо кнопок
export const LINK_EDITING_CLASS = "link-editing";

// Временно скрытые кнопки — для возможностей, которые работают (значение разбирается,
// показывается и сохраняется, правка зовётся из кода), но в панель ещё не выводятся.
// Сейчас скрытых нет; механика остаётся на следующую такую возможность.
const HIDDEN_TOOLS: FormatTool[] = [];
const HIDDEN_BLOCKS: BlockType[] = [];

export const TOOLBAR_CLASS = "ui-richeditor-toolbar";
// Общий класс всех кнопок панели: им они и оформляются. Свой класс у каждой остаётся —
// по нему кнопку находят, а один на всех оформлять удобнее, чем перечислять их в стилях.
export const BUTTON_CLASS = "toolbar-button";
// Коробка с кнопками внутри обёртки: обёртку позиционируют, коробка держит вид и содержимое.
export const BODY_CLASS = "toolbar-body";

/**
 * Кнопка хоста в общей панели — для действий, которых редактор не знает: рандомизация,
 * вставка переменных и прочее доменное. Иконку и поведение задаёт хост, панель отвечает
 * только за отрисовку, доступность и то, что фокус не уходит из редактора.
 */
export interface ToolbarButton {
	/** Уникальное имя: идёт в data-атрибут и в ключ перестройки панели. */
	name: string;
	/** Подсказка на кнопке. */
	title: string;
	/** Разметка иконки (svg). */
	icon: string;
	/** Нажатие. */
	run(): void;
	/** false — кнопка недоступна; проверяется на каждом refresh, как у действий. */
	isEnabled?(): boolean;
}

/** Редактор, которым управляет общий тулбар. */
export interface ToolbarHost {
	readonly editable: HTMLElement;
	readonly formatTools: FormatTool[];
	/** Адрес ссылки под кареткой; пусто — каретка не в ссылке. */
	readonly currentLink?: string;
	/** Поставить ссылку, поменять её адрес или снять её (пустым адресом). */
	applyLink?(url: string): void;
	/** Отпустить фокус — на время правки адреса. */
	releaseFocus?(): void;
	/** Снимок каретки в символах: поле адреса забирает фокус, и выделение вернётся по нему. */
	caretSnapshot?(): [number, number] | null;
	restoreCaret?(bounds: [number, number]): void;
	/** Действия (очистка формата, отмена/повтор); пусто/undefined — кнопок действий нет. */
	readonly editorActions?: EditorAction[];
	/** Контейнер для тулбара; null/undefined — document.body (position: fixed над редактором). */
	readonly toolbarContainer?: HTMLElement | null;
	/**
	 * Типы блоков, которые панель вправе предложить; пусто/undefined — кнопок блоков нет.
	 * Не то же, что набор для разбора значения: показывать цитату и код редактор обязан
	 * и там, где их не переключить (только для чтения).
	 */
	readonly blockTools?: BlockType[];
	applyFormat(tool: FormatTool): void;
	isToolActive(tool: FormatTool): boolean;
	/**
	 * false — инструмент сейчас недоступен (например, внутри кода): кнопка гасится.
	 * Признак «в коде» дорог (обход выделения) — панель считает его один раз на обновление
	 * и передаёт вторым аргументом, чтобы хост не обходил выделение на каждую кнопку.
	 */
	isToolEnabled?(tool: FormatTool, codeActive?: boolean): boolean;
	/** Тип блока под кареткой — им подсвечивается активная кнопка блока. */
	readonly currentBlock?: BlockType;
	applyBlock?(type: BlockType): void;
	/** Правка кода любого вида — для объединённой кнопки (моноширинный + блок кода). */
	applyCode?(): void;
	/** Активен ли код в любом виде — подсветка объединённой кнопки. */
	isCodeActive?(): boolean;
	/** Активные форматы всех инструментов сразу; нет реализации — панель опросит их поштучно. */
	activeTools?(): ReadonlySet<FormatTool>;
	applyAction?(action: EditorAction): void;
	/** false — кнопка действия недоступна (нечего отменять/очищать). */
	isActionEnabled?(action: EditorAction): boolean;
	/** Вставка текста в каретку — для панели смайликов. */
	insertText?(text: string): void;
	/**
	 * Показать переданный попап смайликов у кнопки. Попап панели принадлежит ей самой, а всё
	 * своё — удержание правки, каретку, фокус — редактор берёт на себя.
	 */
	openEmojiPicker?(picker: HTMLElement, initiator: HTMLElement): boolean;
	/** Собственные кнопки хоста; пусто/undefined — только штатные. */
	readonly toolbarButtons?: ToolbarButton[];
}

const MARGIN = 6;

class FormatToolbar {
	private __elem: HTMLElement | null = null; // обёртка: её позиционируют
	private __body: HTMLElement | null = null; // коробка с кнопками внутри обёртки
	private __emojiPicker: HTMLElement | null = null;
	private __linkRow: HTMLElement | null = null;
	private __linkEditing = false;
	private __linkInput: HTMLInputElement | null = null;
	private __linkRemove: HTMLElement | null = null;
	private __linkCaret: [number, number] | null = null; // каретка, снятая на время правки адреса
	private __buttons: Array<[FormatTool, HTMLButtonElement]> = [];
	private __blockButtons: Array<[BlockType, HTMLButtonElement]> = [];
	private __mergedCode = false; // кнопка кода делает и моноширинный, и блок (см. __build)
	private __actionButtons: Array<[EditorAction, HTMLButtonElement]> = [];
	// имя, а не сама кнопка хоста: панель одна на все редакторы и переиспользует разметку между
	// ними, а поведение принадлежит текущему — держать здесь ссылку значит звать чужой обработчик
	private __hostButtons: Array<[string, HTMLButtonElement]> = [];
	private __active: ToolbarHost | null = null;
	private __suspended: ToolbarHost | null = null; // показ придержан на время панели смайликов
	private __toolsKey = "";
	private __inContainer = false;
	private readonly __reposition = () => this.__schedule("position");
	private __resizeObserver: ResizeObserver | null = null;
	private __selectionBound = false;
	private __frame = 0;
	private __pendingRefresh = false;
	private __pendingPosition = false;

	/**
	 * Единый листенер на весь документ: подсветка активных инструментов по текущему выделению.
	 * Вешается при первом показе панели, а не при загрузке модуля, и живёт до конца страницы —
	 * refresh() сам проверяет наличие активного редактора.
	 */
	private __bindSelection() {
		if (this.__selectionBound || typeof document === "undefined") return;

		this.__selectionBound = true;
		document.addEventListener("selectionchange", () => this.__schedule("refresh"));
	}

	/**
	 * Откладывает обновление до кадра отрисовки. selectionchange и scroll приходят пачками,
	 * а и подсветка (обход содержимого), и позиционирование (чтение геометрии) по событию
	 * заметно дороже, чем раз в кадр. Прямые вызовы refresh()/reposition() остаются синхронными.
	 */
	private __schedule(kind: "refresh" | "position") {
		if (!this.__active) return;

		if (kind === "refresh") this.__pendingRefresh = true;
		else this.__pendingPosition = true;

		if (typeof requestAnimationFrame !== "function") this.__flush();
		else this.__frame ||= requestAnimationFrame(() => this.__flush());
	}

	private __flush() {
		const refresh = this.__pendingRefresh;
		const position = this.__pendingPosition;
		this.__cancelScheduled();

		if (refresh) this.refresh();
		if (position) this.reposition();
	}

	private __cancelScheduled() {
		if (this.__frame && typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.__frame);

		this.__frame = 0;
		this.__pendingRefresh = false;
		this.__pendingPosition = false;
	}

	/** Показать тулбар для редактора (на фокусе): перестроить кнопки, спозиционировать, показать. */
	attach(host: ToolbarHost) {
		// открыта панель смайликов у собственной кнопки хоста — показ отложен до её закрытия
		if (this.__suspended === host) return;

		const actions = host.editorActions ?? [];
		const buttons = host.toolbarButtons ?? [];
		const tools = host.formatTools.filter((tool) => !HIDDEN_TOOLS.includes(tool));
		// Обычный текст кнопки не имеет — он не «включается», а остаётся, когда выключены остальные.
		const blocks = (host.blockTools ?? []).filter(
			(type) => type !== DEFAULT_BLOCK && !HIDDEN_BLOCKS.includes(type)
		);
		// Nothing to show — and the previous editor's panel must not stay on screen either: focus
		// moved to this one, while its buttons would still edit the neighbour.
		if (!tools.length && !blocks.length && !actions.length && !buttons.length) {
			if (this.__active) this.__hide();
			return;
		}

		this.__bindSelection();
		this.__active = host;
		this.__build(tools, blocks, actions, buttons);
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

	/**
	 * Убрать панель с экрана, не отпуская редактор: он отдал фокус своему слою — окну или панели
	 * смайликов. От {@link detach} отличается тем, что панель смайликов при этом остаётся: её и
	 * открыли из этого редактора, а фокус сняли как раз ради неё.
	 */
	suspend(host: ToolbarHost) {
		// Фокус мог отпустить и сам тулбар — ради своего поля адреса. Убрав панель с экрана, мы
		// убрали бы и его: кнопка нажата, а править негде. У панели смайликов слой чужой (она
		// у кнопки хоста), поэтому там прятать и нужно.
		if (this.__linkEditing) return;

		if (this.__active === host) this.__hide();
	}

	/** Скрыть тулбар, если он обслуживает этот редактор (на blur/destroy). */
	detach(host: ToolbarHost) {
		// Придержанный показ снимаем первым делом, до закрытия панели: иначе её onClose поднял бы
		// тулбар над редактором, который как раз уходит (в том числе разрушается).
		if (this.__suspended === host) this.__suspended = null;

		if (this.__active !== host) return;

		// попап смайликов панели уходит вместе с ней — он её собственный слой
		this.__closeEmoji();

		// правка адреса живёт в самой панели и заканчивается вместе с ней
		this.__closeLink();
		this.__hide();
	}

	/** Убрать панель с экрана и отпустить активный редактор (позиционирование, подсветка). */
	private __hide() {
		this.__active = null;
		this.__cancelScheduled();
		if (this.__elem) this.__elem.classList.remove("visible");
		this.__removeViewportListeners();
	}

	/**
	 * Обновить подсветку активных инструментов и доступность действий по текущему состоянию.
	 *
	 * Пишем в DOM только при реальном изменении: обновление идёт на каждое движение каретки,
	 * а на документе живёт MutationObserver (им UIElement следит за удалением элементов) —
	 * повторная запись того же значения всё равно порождает запись мутации и его пробуждение.
	 */
	refresh() {
		const host = this.__active;
		if (!host) return;

		const setDisabled = (btn: HTMLButtonElement, disabled: boolean) => {
			if (btn.disabled !== disabled) btn.disabled = disabled;
		};

		const active = host.activeTools?.();
		// Признак «в коде» гасит остальные кнопки и подсвечивает объединённую; сам он — обход
		// выделения, поэтому считается один раз на обновление, а не на каждую кнопку. Вывести
		// его из activeTools можно только вместе с currentBlock (блок кода — не формат): хосту
		// без блоков остаётся его собственный isCodeActive.
		const inCode =
			active && host.currentBlock !== undefined
				? host.currentBlock === CODE_TOOL || active.has(CODE_TOOL)
				: host.isCodeActive?.();

		for (const [tool, btn] of this.__buttons) {
			// объединённая кнопка подсвечена и на блоке кода, а не только на моноширинном
			const isActive =
				this.__mergedCode && tool === CODE_TOOL
					? !!inCode
					: active
						? active.has(tool)
						: host.isToolActive(tool);

			// toggle с force не трогает атрибут, когда состояние уже нужное, — мутации не будет
			btn.classList.toggle("active", isActive);
			setDisabled(btn, host.isToolEnabled?.(tool, inCode) === false);
		}

		// тип под кареткой спрашиваем, только если есть что подсвечивать: обновление идёт
		// на каждое её движение, а поиск блока — обход предков
		if (this.__blockButtons.length) {
			const block = host.currentBlock;

			for (const [type, btn] of this.__blockButtons) btn.classList.toggle("active", block === type);
		}

		// хост может не реализовывать isActionEnabled — тогда кнопка всегда доступна
		for (const [action, btn] of this.__actionButtons) setDisabled(btn, host.isActionEnabled?.(action) === false);
		for (const [name, btn] of this.__hostButtons)
			setDisabled(btn, this.__hostButton(name)?.isEnabled?.() === false);
	}

	/** Кнопка хоста по имени — у активного редактора, а не у того, кто собрал разметку панели. */
	private __hostButton(name: string): ToolbarButton | undefined {
		return this.__active?.toolbarButtons?.find((button) => button.name === name);
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
		this.__cancelScheduled();
	}

	private __ensure(): HTMLElement {
		if (!this.__elem) {
			// Обёртка и коробка внутри: обёртку позиционируют (fixed над редактором либо absolute
			// над контейнером), коробка держит вид и кнопки. Порознь потому, что размер коробки
			// меняется вместе с содержимым — на правку адреса, например, — а точка привязки от
			// этого съезжать не должна. Выпадающие слои (панель смайликов) висят на обёртке:
			// её коробка их и не растит, и не обрезает.
			this.__elem = DOM.tag("div", { class: TOOLBAR_CLASS });
			this.__body = DOM.tag("div", { class: BODY_CLASS });
			this.__elem.appendChild(this.__body);

			// Панель нигде не должна забирать фокус, иначе редактор теряет выделение, а blur
			// прячет сам тулбар. Слушатель висит на корне, а не на кнопках: до disabled-кнопки
			// событие не доходит (браузер их не диспатчит), да и клик по фону панели между
			// кнопками иначе тоже уводил бы фокус. Дочерние элементы покрываются всплытием.
			//
			// Исключение одно — поле адреса ссылки: набирать в нём без фокуса негде. Каретку
			// редактора это не теряет: её снимают до перевода фокуса, см. openLink.
			this.__elem.addEventListener("mousedown", (e) => {
				if (e.target !== this.__linkInput) e.preventDefault();
			});
		}

		return this.__elem;
	}

	private __build(tools: FormatTool[], blocks: BlockType[], actions: EditorAction[], buttons: ToolbarButton[]) {
		const key = `${tools.join(",")}|${blocks.join(",")}|${actions.join(",")}|${buttons.map((b) => b.name).join(",")}`;
		this.__ensure();
		const elem = this.__body!;
		if (key === this.__toolsKey && elem.firstChild) return; // тот же состав — переиспользуем кнопки

		this.__toolsKey = key;
		const linkInToolbar = !!this.__linkRow && this.__linkRow.parentElement === elem;
		DOM.empty(elem);
		this.__buttons = [];
		this.__blockButtons = [];
		this.__actionButtons = [];
		this.__hostButtons = [];

		// Код — одна кнопка на оба вида, как в мессенджерах: и моноширинный, и блок кода. Какой
		// из них применить, решает редактор по выделению, поэтому отдельная кнопка блока не нужна.
		this.__mergedCode = tools.includes(CODE_TOOL) && blocks.includes(CODE_BLOCK);
		const blockTypes = this.__mergedCode ? blocks.filter((type) => type !== CODE_BLOCK) : blocks;

		for (const tool of tools) {
			const merged = this.__mergedCode && tool === CODE_TOOL;
			const def = FORMAT_TOOLS[tool];
			const btn = DOM.tag(
				"button",
				{
					type: "button",
					class: [BUTTON_CLASS, "format-button"],
					dataset: { formatTool: tool },
					title: merged ? MERGED_CODE_TITLE : def.title,
				},
				FORMAT_ICONS[tool]
			);
			// у ссылки адрес спрашивается полем ввода в самой панели — переключать её кнопке нечем
			btn.addEventListener("click", () =>
				tool === LINK_TOOL
					? this.openLink()
					: merged
						? this.__active?.applyCode?.()
						: this.__active?.applyFormat(tool)
			);

			elem.appendChild(btn);
			this.__buttons.push([tool, btn]);
		}

		for (const type of blockTypes) {
			const def = BLOCK_TYPES[type];
			const btn = DOM.tag(
				"button",
				{
					type: "button",
					class: [BUTTON_CLASS, "block-button"],
					dataset: { blockType: type },
					title: def.title,
				},
				BLOCK_ICONS[type] ?? ""
			);
			btn.addEventListener("click", () => this.__active?.applyBlock?.(type));

			elem.appendChild(btn);
			this.__blockButtons.push([type, btn]);
		}

		for (const action of actions) {
			const def = EDITOR_ACTIONS[action];
			const btn = DOM.tag(
				"button",
				{
					type: "button",
					class: [BUTTON_CLASS, "action-button"],
					dataset: { editorAction: action },
					title: def.title,
				},
				ACTION_ICONS[action]
			);
			if (action === "emoji") btn.addEventListener("click", (e) => this.__toggleEmoji(btn, e));
			else btn.addEventListener("click", () => this.__active?.applyAction?.(action));

			elem.appendChild(btn);
			this.__actionButtons.push([action, btn]);
		}

		// Инструменты, блоки и действия — одна группа: всё это правка оформления. Разделитель
		// нужен только перед кнопками хоста: они про другое — переменные, рандомизацию и прочее
		// доменное. Пустых групп разделитель не касается, иначе панель начиналась бы с линии.
		if (buttons.length && (tools.length || blockTypes.length || actions.length))
			elem.appendChild(DOM.tag("div", { class: "split" }));

		// кнопки хоста — последними, чтобы штатные не переезжали при их появлении
		for (const button of buttons) {
			const btn = DOM.tag(
				"button",
				{
					type: "button",
					class: [BUTTON_CLASS, "host-button"],
					dataset: { toolbarButton: button.name },
					title: button.title,
				},
				button.icon
			);
			btn.addEventListener("click", () => this.__hostButton(button.name)?.run());

			elem.appendChild(btn);
			this.__hostButtons.push([button.name, btn]);
		}

		// строка адреса живёт только в панели, но пережить перестройку кнопок обязана так же.
		// Панель смайликов висит на обёртке и перестройки кнопок не замечает вовсе.
		if (linkInToolbar && this.__linkRow) elem.appendChild(this.__linkRow);
	}

	/**
	 * Панель смайликов закрылась — показываем придержанный тулбар, если редактор ещё в фокусе.
	 * Зовёт редактор: попап у кнопки хоста принадлежит ему, а придерживает показ панель.
	 */
	resume() {
		const host = this.__suspended;
		if (!host) return;

		this.__suspended = null;

		// панель могло закрыть и движение мимо поля — тогда показывать нечего
		if (host.editable.ownerDocument.activeElement === host.editable) this.attach(host);
	}

	// Попап панели — её собственный: свой у неё, свой у хоста. Общий пришлось бы переносить
	// между владельцами и помнить, чей он сейчас, а показать два разом всё равно нельзя.
	private __toggleEmoji(initiator: HTMLButtonElement, e: MouseEvent) {
		// PopupManager вешает слушатель закрытия на body прямо в open() — до body этот же клик
		// ещё не дошёл, и без остановки он закрыл бы попап сразу после открытия
		e.stopPropagation();

		const host = this.__active;
		if (!host) return;

		// через редактор, а не напрямую: правку на время попапа придерживает он
		host.openEmojiPicker?.(this.__ensureEmojiPicker(), initiator);
	}

	private __ensureEmojiPicker(): HTMLElement {
		const picker = (this.__emojiPicker ??= createEmojiPicker((emoji) => this.__active?.insertText?.(emoji)));
		const elem = this.__ensure();
		if (picker.parentElement !== elem) elem.appendChild(picker);

		return picker;
	}

	/** Закрыть панель смайликов, если открыта именно она (тулбар уходит — попап не должен остаться). */
	private __closeEmoji() {
		if (this.__emojiPicker && PopupManager.isOpened(this.__emojiPicker)) PopupManager.close();
	}

	/** Открыть правку адреса хоткеем — так же, как её открывает собственная кнопка. */
	openLinkFor(host: ToolbarHost) {
		if (this.__active === host) this.openLink();
	}

	/**
	 * Правка адреса: панель на это время показывает поле ввода вместо кнопок.
	 *
	 * Не выпадающий слой, а другое содержимое той же панели: место, коробка и положение у них
	 * общие, и панели не приходится ни ужиматься под соседа, ни позиционировать его. Кнопки при
	 * этом всё равно недоступны — пока адрес не введён, править нечего.
	 *
	 * Поле ввода, в отличие от всего остального в панели, забирает фокус: без него не наберёшь.
	 * А фокус в чужом поле — это и чужое выделение: то, что стояло в редакторе, `getSelection()`
	 * уже не вернёт. Поэтому каретку снимаем до перевода фокуса и возвращаем перед правкой.
	 */
	openLink() {
		// Повторное нажатие возвращает кнопки — проверяем раньше доступности: фокус на это время
		// отпущен, каретки в поле нет, и кнопка ссылки сама себя считает недоступной.
		if (this.__linkEditing) return this.__closeLink();

		const host = this.__active;
		// делать ссылкой нечего — спрашивать адрес не за чем (кнопка в этот момент и погашена)
		if (!host?.applyLink || host.isToolEnabled?.(LINK_TOOL) === false) return;

		this.__ensureLinkRow();
		const current = host.currentLink ?? "";

		this.__linkInput!.value = current;
		this.__linkRemove!.hidden = !current; // снимать нечего, пока ссылки под кареткой нет

		this.__linkEditing = true;
		this.__elem!.classList.add(LINK_EDITING_CLASS);
		// ширина панели сменилась вместе с содержимым, а с ней и её высота — положение пересчитываем
		this.reposition();

		// releaseFocus снимает каретку только когда поле активно — на это полагаться нельзя,
		// поэтому снимок делаем сами
		this.__linkCaret = host.caretSnapshot?.() ?? null;
		host.releaseFocus?.();

		this.__linkInput!.focus();
		this.__linkInput!.select();
	}

	private __ensureLinkRow(): HTMLElement {
		const row = this.__linkRow ?? this.__buildLinkRow();
		this.__ensure();
		if (row.parentElement !== this.__body) this.__body!.appendChild(row);

		return row;
	}

	private __buildLinkRow(): HTMLElement {
		const input = DOM.tag("input", {
			type: "url",
			class: "link-input",
			placeholder: "https://",
			spellcheck: "false",
		}) as HTMLInputElement;

		// Фокус ушёл в поле адреса, выделение — вместе с ним. Возвращаем каретку, снятую при
		// открытии, и только потом правим: applyLink работает по выделению в редакторе.
		const apply = (url: string) => {
			const host = this.__active;
			// каретку забираем до закрытия: оно её отпускает
			const caret = this.__linkCaret;

			this.__closeLink();
			if (caret) host?.restoreCaret?.(caret);
			host?.applyLink?.(url);
		};

		const remove = DOM.tag(
			"button",
			{ type: "button", class: [BUTTON_CLASS, "link-remove"], title: "Убрать ссылку" },
			unlinkIcon
		);
		remove.addEventListener("click", () => apply(""));

		const row = DOM.tag("div", { class: LINK_ROW_CLASS }, [
			input,
			DOM.tag("button", { type: "button", class: [BUTTON_CLASS, "link-apply"], title: "Применить" }, applyIcon),
			remove,
		]);

		// фокус гасит корневой слушатель панели, строка лежит внутри неё — своего не нужно
		row.addEventListener("click", (e) => {
			if ((e.target as HTMLElement).closest(".link-apply")) apply(input.value);
		});
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				apply(input.value);
			} else if (e.key === "Escape") {
				e.preventDefault();
				// отказались от правки — возвращаем каретку туда, где её взяли
				const host = this.__active;
				const caret = this.__linkCaret;

				this.__closeLink();
				if (caret) host?.restoreCaret?.(caret);
			}
		});
		// Ушли мимо панели — правку бросили: держаться ей больше не на чем, редактор фокус отпустил
		// ради этого поля. Нажатия по своим кнопкам фокуса не уводят, и сюда не попадают.
		input.addEventListener("blur", (e) => {
			if (this.__elem?.contains(e.relatedTarget as Node | null)) return;

			this.__closeLink();
			this.__hide();
		});

		this.__linkRow = row;
		this.__linkInput = input;
		this.__linkRemove = remove;

		return row;
	}

	/** Вернуть панель к кнопкам (правку адреса закончили или бросили). */
	private __closeLink() {
		if (!this.__linkEditing) return;

		this.__linkEditing = false;
		this.__linkCaret = null;
		this.__elem?.classList.remove(LINK_EDITING_CLASS);
		this.reposition();
	}
}

/** Единый экземпляр тулбара для всех редакторов. */
export const formatToolbar = new FormatToolbar();
