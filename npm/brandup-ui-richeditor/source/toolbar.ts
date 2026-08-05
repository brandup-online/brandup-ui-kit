// Общий (единый для всех редакторов) тулбар форматирования.
// По умолчанию живёт в document.body и позиционируется над активным редактором (position: fixed).
// Если редактор задал toolbarContainer — панель монтируется в него и позиционируется
// относительно него (position: absolute; над контейнером).
// Кнопки диспатчат форматирование напрямую активному редактору (без системы команд,
// т.к. тулбар находится вне привязанных UIElement).

import { DOM } from "@brandup/ui";
import { POPUP_CLASS, PopupManager, SCROLLABLE_CLASS } from "@brandup/ui-kit";
import {
	BLOCK_TYPES,
	DEFAULT_BLOCK,
	EDITOR_ACTIONS,
	FORMAT_TOOLS,
	type BlockType,
	type EditorAction,
	type FormatTool,
} from "./format";
import { EMOJI_GROUPS, type EmojiGroup } from "./emoji";
import boldIcon from "../svg/bold.svg";
import italicIcon from "../svg/italic.svg";
import strikeIcon from "../svg/strike.svg";
import underlineIcon from "../svg/underline.svg";
import spoilerIcon from "../svg/spoiler.svg";
import codeIcon from "../svg/mono.svg";
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

// Временно скрытые кнопки. Сами возможности работают: значение разбирается, показывается
// и сохраняется, правку можно вызвать из кода — в панель они просто не выводятся.
// Убрать отсюда, когда будут доведены.
const HIDDEN_TOOLS: FormatTool[] = ["spoiler", "code"];
const HIDDEN_BLOCKS: BlockType[] = ["code"];

export const TOOLBAR_CLASS = "ui-richeditor-toolbar";
export const EMOJI_PICKER_CLASS = "ui-richeditor-emoji";

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
	/** Действия (очистка формата, отмена/повтор); пусто/undefined — кнопок действий нет. */
	readonly editorActions?: EditorAction[];
	/** Контейнер для тулбара; null/undefined — document.body (position: fixed над редактором). */
	readonly toolbarContainer?: HTMLElement | null;
	/** Типы блоков многострочного режима; пусто/undefined — кнопок блоков нет. */
	readonly blockTypes?: BlockType[];
	applyFormat(tool: FormatTool): void;
	isToolActive(tool: FormatTool): boolean;
	/** false — инструмент сейчас недоступен (например, внутри кода): кнопка гасится. */
	isToolEnabled?(tool: FormatTool): boolean;
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
	/** Собственные кнопки хоста; пусто/undefined — только штатные. */
	readonly toolbarButtons?: ToolbarButton[];
}

const MARGIN = 6;

// Сколько кнопок помещается в ряд при ширине панели (см. .ui-richeditor-emoji в richeditor.less).
// Точность нужна только для оценки высоты нерисованной группы: ошибка сдвинет ползунок прокрутки,
// но не саму раскладку — группа переносит кнопки сама.
const EMOJI_COLUMNS = 8;

/**
 * Группа смайликов: и смысловое деление в панели (отбивается линией), и кусок, к которому
 * применяется пропуск отрисовки. Поэлементно это было бы семьсот отслеживаемых поддеревьев,
 * и слежение за ними съедает выигрыш от пропуска.
 */
function buildEmojiGroup(group: EmojiGroup): HTMLElement {
	const rows = Math.ceil(group.emojis.length / EMOJI_COLUMNS);
	const elem = DOM.tag("div", {
		class: "emoji-group",
		role: "group",
		"aria-label": group.title,
		// высота, пока группа не нарисована: без неё список схлопнулся бы, а прокрутка скакала
		style: `--emoji-rows: ${rows}`,
	});

	const fragment = document.createDocumentFragment();
	for (const emoji of group.emojis)
		fragment.appendChild(DOM.tag("button", { type: "button", class: "emoji", tabindex: "-1" }, emoji));
	elem.appendChild(fragment);

	return elem;
}

class FormatToolbar {
	private __elem: HTMLElement | null = null;
	private __emojiPicker: HTMLElement | null = null;
	private __emojiHost: ToolbarHost | null = null; // куда уйдёт выбранный символ
	private __emojiInitiator: HTMLElement | null = null; // кнопка, у которой открыта панель
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
		const blocks = (host.blockTypes ?? []).filter(
			(type) => type !== DEFAULT_BLOCK && !HIDDEN_BLOCKS.includes(type)
		);
		if (!tools.length && !blocks.length && !actions.length && !buttons.length) return;

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

	/** Скрыть тулбар, если он обслуживает этот редактор (на blur/destroy). */
	detach(host: ToolbarHost) {
		// Придержанный показ снимаем первым делом, до закрытия панели: иначе её onClose поднял бы
		// тулбар над редактором, который как раз уходит (в том числе разрушается).
		if (this.__suspended === host) this.__suspended = null;

		// панель смайликов могла быть открыта не для активного редактора (у своей кнопки хоста) —
		// ссылку на него всё равно отпускаем, иначе уничтоженный редактор держится синглтоном
		const emojiHost = this.__emojiHost === host;
		if (!emojiHost && this.__active !== host) return;

		// Закрываем только свою панель. Открытие у кнопки другого редактора само переводит туда
		// фокус, и этот уход приходит уже после — панель к тому времени принадлежит соседу, и
		// закрыть её значило бы гасить только что открытое: она требовала бы второго нажатия.
		if (emojiHost) {
			this.__closeEmoji();

			this.__emojiHost = null;
			this.__emojiInitiator = null;
		}

		if (this.__active !== host) return;

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
		for (const [tool, btn] of this.__buttons) {
			// объединённая кнопка подсвечена и на блоке кода, а не только на моноширинном
			const isActive =
				this.__mergedCode && tool === CODE_TOOL
					? !!host.isCodeActive?.()
					: active
						? active.has(tool)
						: host.isToolActive(tool);

			if (btn.classList.contains("active") !== isActive) btn.classList.toggle("active", isActive);
			setDisabled(btn, host.isToolEnabled?.(tool) === false);
		}

		// тип под кареткой спрашиваем, только если есть что подсвечивать: обновление идёт
		// на каждое её движение, а поиск блока — обход предков
		if (this.__blockButtons.length) {
			const block = host.currentBlock;

			for (const [type, btn] of this.__blockButtons) {
				const isActive = block === type;
				if (btn.classList.contains("active") !== isActive) btn.classList.toggle("active", isActive);
			}
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
			this.__elem = DOM.tag("div", { class: TOOLBAR_CLASS });

			// Панель нигде не должна забирать фокус, иначе редактор теряет выделение, а blur
			// прячет сам тулбар. Слушатель висит на корне, а не на кнопках: до disabled-кнопки
			// событие не доходит (браузер их не диспатчит), да и клик по фону панели между
			// кнопками иначе тоже уводил бы фокус. Дочерние элементы покрываются всплытием.
			this.__elem.addEventListener("mousedown", (e) => e.preventDefault());
		}

		return this.__elem;
	}

	private __build(tools: FormatTool[], blocks: BlockType[], actions: EditorAction[], buttons: ToolbarButton[]) {
		const key = `${tools.join(",")}|${blocks.join(",")}|${actions.join(",")}|${buttons.map((b) => b.name).join(",")}`;
		const elem = this.__ensure();
		if (key === this.__toolsKey && elem.firstChild) return; // тот же состав — переиспользуем кнопки

		this.__toolsKey = key;
		const pickerInToolbar = !!this.__emojiPicker && this.__emojiPicker.parentElement === elem;
		DOM.empty(elem);
		this.__buttons = [];
		this.__blockButtons = [];
		this.__actionButtons = [];
		this.__hostButtons = [];

		// Код — одна кнопка на оба вида, как в мессенджерах: и моноширинный, и блок кода. Какой
		// из них применить, решает редактор по выделению, поэтому отдельная кнопка блока не нужна.
		this.__mergedCode = tools.includes(CODE_TOOL) && blocks.includes(CODE_BLOCK);
		const blockTypes = this.__mergedCode ? blocks.filter((type) => type !== CODE_BLOCK) : blocks;

		// Разделитель ставится только между непустыми группами — иначе панель начиналась бы
		// с линии или показывала две подряд.
		let filled = false;
		const separate = (group: unknown[]) => {
			if (filled && group.length) elem.appendChild(DOM.tag("div", { class: "split" }));
			filled ||= group.length > 0;
		};

		separate(tools);

		for (const tool of tools) {
			const merged = this.__mergedCode && tool === CODE_TOOL;
			const def = FORMAT_TOOLS[tool];
			const btn = DOM.tag(
				"button",
				{
					type: "button",
					class: "format-button",
					dataset: { formatTool: tool },
					title: merged ? MERGED_CODE_TITLE : def.title,
				},
				FORMAT_ICONS[tool]
			);
			btn.addEventListener("click", () =>
				merged ? this.__active?.applyCode?.() : this.__active?.applyFormat(tool)
			);

			elem.appendChild(btn);
			this.__buttons.push([tool, btn]);
		}

		separate(blockTypes);

		for (const type of blockTypes) {
			const def = BLOCK_TYPES[type];
			const btn = DOM.tag(
				"button",
				{ type: "button", class: "block-button", dataset: { blockType: type }, title: def.title },
				BLOCK_ICONS[type] ?? ""
			);
			btn.addEventListener("click", () => this.__active?.applyBlock?.(type));

			elem.appendChild(btn);
			this.__blockButtons.push([type, btn]);
		}

		separate(actions);

		for (const action of actions) {
			const def = EDITOR_ACTIONS[action];
			const btn = DOM.tag(
				"button",
				{ type: "button", class: "action-button", dataset: { editorAction: action }, title: def.title },
				ACTION_ICONS[action]
			);
			if (action === "emoji") btn.addEventListener("click", (e) => this.__toggleEmoji(btn, e));
			else btn.addEventListener("click", () => this.__active?.applyAction?.(action));

			elem.appendChild(btn);
			this.__actionButtons.push([action, btn]);
		}

		separate(buttons);

		// кнопки хоста — последними, чтобы штатные не переезжали при их появлении
		for (const button of buttons) {
			const btn = DOM.tag(
				"button",
				{ type: "button", class: "host-button", dataset: { toolbarButton: button.name }, title: button.title },
				button.icon
			);
			btn.addEventListener("click", () => this.__hostButton(button.name)?.run());

			elem.appendChild(btn);
			this.__hostButtons.push([button.name, btn]);
		}

		// панель пережила перестройку кнопок — возвращаем её в тулбар, чтобы не собирать заново.
		// Если её забрал хост под свою кнопку, она остаётся у него.
		if (pickerInToolbar && this.__emojiPicker) elem.appendChild(this.__emojiPicker);
	}

	/**
	 * Открыть панель смайликов у произвольной кнопки — например у собственной кнопки хоста рядом
	 * с полем ввода, а не в тулбаре. Панель одна на все редакторы и переезжает в `container`;
	 * выбранный символ уходит в `host`, даже если тулбар сейчас обслуживает другой редактор.
	 *
	 * Вызывать из обработчика `click`, погасив всплытие: PopupManager вешает свой слушатель
	 * закрытия на body прямо в open(), то есть во время этого же клика — до body событие ещё
	 * не дошло, и слушатель закрыл бы панель сразу после открытия.
	 */
	openEmoji(host: ToolbarHost, initiator: HTMLElement, container: HTMLElement) {
		// повторный клик по той же кнопке закрывает панель (это делает toggle внутри PopupManager),
		// а вот у другой кнопки её нужно сперва закрыть — иначе toggle сочтёт открытие повторным
		if (this.__emojiInitiator !== initiator && this.__emojiPicker?.classList.contains("opened"))
			PopupManager.close();

		this.__emojiHost = host;
		this.__emojiInitiator = initiator;

		// Панель у собственной кнопки хоста — самостоятельный слой, и показывать её вместе с тулбаром
		// нельзя: это два всплывающих окна над одним полем. Тулбар придерживаем на всё время работы
		// панели, а показанный убираем с экрана; вернётся он сам при её закрытии, если поле осталось
		// в фокусе. Панель самого тулбара (container === __elem) — его собственный выпадающий слой,
		// прятать её носителя незачем и нечем.
		if (container !== this.__elem) {
			this.__suspended = host;
			if (this.__active === host) this.__hide();
		}

		PopupManager.open(this.__ensureEmojiPicker(container), { initiator, onClose: () => this.__resume() });
	}

	/** Панель смайликов закрылась — показываем придержанный тулбар, если редактор ещё в фокусе. */
	private __resume() {
		const host = this.__suspended;
		if (!host) return;

		this.__suspended = null;

		// панель могло закрыть и движение мимо поля — тогда показывать нечего
		if (host.editable.ownerDocument.activeElement === host.editable) this.attach(host);
	}

	private __toggleEmoji(initiator: HTMLButtonElement, e: MouseEvent) {
		e.stopPropagation();

		if (this.__active) this.openEmoji(this.__active, initiator, this.__ensure());
	}

	private __ensureEmojiPicker(container: HTMLElement): HTMLElement {
		const picker = this.__emojiPicker ?? this.__buildEmojiPicker();
		if (picker.parentElement !== container) container.appendChild(picker);

		return picker;
	}

	private __buildEmojiPicker(): HTMLElement {
		const picker = DOM.tag("div", { class: `${POPUP_CLASS} ${EMOJI_PICKER_CLASS}` });

		// Прокручивается список, а не сам попап: полоса прокрутки рисуется по краю коробки
		// и перекрывала бы скругление рамки — угол выглядел бы срезанным.
		const list = DOM.tag("div", { class: ["emoji-list", SCROLLABLE_CLASS] });
		picker.appendChild(list);

		for (const group of EMOJI_GROUPS) list.appendChild(buildEmojiGroup(group));

		// панель может висеть и вне тулбара, поэтому гасит фокус сама
		picker.addEventListener("mousedown", (e) => e.preventDefault());
		picker.addEventListener("click", (e) => {
			const target = (e.target as HTMLElement).closest<HTMLElement>(".emoji");
			if (!target) return;

			this.__emojiHost?.insertText?.(target.textContent ?? "");
			PopupManager.close();
		});

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
