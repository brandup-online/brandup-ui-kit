import { LayerManager, type Layer } from "./layer";
import { trackPosition, type PositionOptions } from "./position";
import { UIKIT } from "./names";
import "./popup.less"; // стили всплывающей поверхности

/** Имена попапа — в общем модуле имён кита (см. names.ts). */
const POPUP = UIKIT.POPUP;

type OpenPopup = {
	initiator?: HTMLElement;
	popup: HTMLElement;
	closeCallback?: () => void;
	layer: Layer;
	/** Закрытие уже идёт: обработчик onClose мог позвать close() ещё раз. */
	closing: boolean;
	/** Снять слежение за якорем и вернуть попапу его собственные координаты. */
	unposition?: () => void;
};

/**
 * Открытые попапы снизу вверх.
 *
 * Соседние друг друга вытесняют — два меню в шапке одновременно раскрытыми быть не должны, —
 * а вложенный ложится поверх родителя: подменю, выбор смайлика из панели, второй список внутри
 * раскрытого. Вложенность определяется по инициатору: кнопка, стоящая внутри открытого попапа,
 * раскрывает дочерний, а не заменяет собой родителя (см. {@link parentIndexFor}).
 *
 * Стек нужен и потому, что открытых попапов бывает несколько, и потому, что закрывать их нужно
 * порознь: Escape снимает верхний, клик внутри родителя — всё, что над ним.
 */
const stack: OpenPopup[] = [];

let popupIdSeq = 0;

const top = (): OpenPopup | undefined => stack[stack.length - 1];

const indexOfPopup = (popupElem: HTMLElement): number => stack.findIndex((entry) => entry.popup === popupElem);

/**
 * Самый верхний открытый попап, внутри которого лежит элемент, — то есть тот, к которому
 * относится нажатие. `-1`, если нажали мимо всех.
 */
function deepestContaining(target: Node): number {
	for (let i = stack.length - 1; i >= 0; i--) if (stack[i].popup.contains(target)) return i;

	return -1;
}

/**
 * Попап, внутри которого стоит кнопка-инициатор раскрываемого. Он и станет родителем: закрывать
 * его — значит закрыть попап нажатием на его же содержимое.
 *
 * `-1` — инициатора нет вовсе или он лежит на странице: попап самостоятельный, и все открытые
 * ему не родня, а соседи.
 */
function parentIndexFor(initiator?: HTMLElement): number {
	return initiator ? deepestContaining(initiator) : -1;
}

const closePopupEventHandler = (e: MouseEvent) => {
	const target = e.target as HTMLElement;

	// Нажали по кнопке уже раскрытого попапа — это его закрытие. Гасим событие: иначе команда
	// `ui-popup-toggle`, которая всплывает следом, увидит попап закрытым и откроет его заново.
	const initiated = stack.findIndex((entry) => entry.initiator && entry.initiator.contains(target));
	if (initiated >= 0) {
		closeFrom(initiated);

		e.preventDefault();
		e.stopImmediatePropagation();

		return;
	}

	// Нажали внутри попапа: сам он остаётся, а всё, что над ним, к этому нажатию отношения
	// не имеет — подменю, раскрытое из него, закрывается.
	const inside = deepestContaining(target);
	closeFrom(inside + 1);
};

/**
 * Кнопка-инициатор объявляет состояние попапа: `aria-expanded` читает скринридер, `aria-controls`
 * связывает её с раскрытым слоем. Идентификатор попапу выдаём свой, если в разметке его не задали.
 */
const setInitiatorState = (initiator: HTMLElement | undefined, popup: HTMLElement, expanded: boolean) => {
	if (!initiator) return;

	if (expanded) {
		if (!popup.id) popup.id = `${POPUP.ID}${++popupIdSeq}`;

		initiator.classList.add(POPUP.CLASS.EXPANDED);
		initiator.setAttribute("aria-controls", popup.id);
		initiator.setAttribute("aria-expanded", "true");
	} else {
		initiator.classList.remove(POPUP.CLASS.EXPANDED); // закрываем последнее открытое контекстное меню
		initiator.setAttribute("aria-expanded", "false"); // кнопка остаётся переключателем и в закрытом виде
	}
};

/** Снимает один попап — сам по себе, без оглядки на стоящие над ним. */
const closeEntry = (entry: OpenPopup) => {
	if (entry.closing) return;
	entry.closing = true;

	try {
		if (entry.closeCallback) entry.closeCallback();

		// До снятия класса открытого: слежение писало попапу инлайновые координаты, и оставить
		// их значило бы сдвинуть его на следующем показе ещё до того, как он посчитается заново.
		entry.unposition?.();

		setInitiatorState(entry.initiator, entry.popup, false);
		entry.popup.classList.remove(POPUP.CLASS.OPENED);

		const index = stack.indexOf(entry);
		if (index >= 0) stack.splice(index, 1);

		// Слушатель снимается здесь, а не в закрытии сверху вниз: попап закрывают и мимо него —
		// Escape зовёт этот метод прямо из слоя, — и снятый только там слушатель пережил бы
		// последний попап и отрабатывал на каждом нажатии по странице.
		if (!stack.length) document.body.removeEventListener("click", closePopupEventHandler);

		// последним: слой возвращает фокус на инициатора, и делать это нужно уже по закрытому попапу
		entry.layer.release();
	} finally {
		entry.closing = false;
	}
};

/**
 * Закрывает попапы с указанного места и выше — сверху вниз, чтобы фокус возвращался по цепочке:
 * из подменю на его кнопку в родителе, а не сразу на страницу.
 */
function closeFrom(index: number) {
	for (let i = stack.length - 1; i >= index && i >= 0; i--) closeEntry(stack[i]);
}

/**
 * Закрыть попап и всё, что над ним. Без аргумента — закрыть все: у того, кто зовёт `close()`
 * не про конкретный попап, открытых быть не должно вовсе.
 */
const close = (popupElem?: HTMLElement) => {
	if (!popupElem) {
		closeFrom(0);

		return;
	}

	const index = indexOfPopup(popupElem);
	if (index >= 0) closeFrom(index);
};

/**
 * Показан ли попап окном по центру, а не у кнопки. Признак объявляет сам стиль — токеном
 * `--popup-window-mode` внутри адаптивного правила (см. popup.less).
 */
function isWindowMode(popupElem: HTMLElement): boolean {
	return getComputedStyle(popupElem).getPropertyValue("--popup-window-mode").trim() === "1";
}

/** Якорь, у которого держать попап, или `undefined` — если позиционировать не просили. */
function positionAnchor(options?: PopupOptions): HTMLElement | undefined {
	if (!options?.position) return undefined;

	const anchor = typeof options.position === "object" ? options.position.anchor : undefined;

	return anchor ?? options.initiator;
}

/** Настройки расчёта: у `position: true` их нет вовсе, у объекта — всё, кроме якоря. */
function positionOptions(options?: PopupOptions): PositionOptions {
	return typeof options?.position === "object" ? options.position : {};
}

/**
 * Показать попап. Открытый этим же вызовом остаётся открытым — повторный `open` ничего не меняет;
 * закрыть его нажатием по той же кнопке — работа {@link toggle}.
 *
 * Попап, кнопка которого стоит внутри уже открытого, ложится поверх него — это подменю. Всякий
 * другой попап открытым соседям не родня: они закрываются, иначе на странице осталось бы висеть
 * два раскрытых меню.
 */
const open = (popupElem: HTMLElement, options?: PopupOptions) => {
	if (indexOfPopup(popupElem) >= 0) return; // уже показан — открывать нечего

	// Всё, что не является родителем нового попапа, закрываем: от соседей избавляемся целиком,
	// у родителя снимаем ранее раскрытое подменю.
	closeFrom(parentIndexFor(options?.initiator) + 1);

	popupElem.classList.add(POPUP.CLASS.OPENED);

	setInitiatorState(options?.initiator, popupElem, true);

	if (!stack.length) document.body.addEventListener("click", closePopupEventHandler);

	const entry: OpenPopup = {
		popup: popupElem,
		initiator: options?.initiator,
		closeCallback: options?.onClose,
		closing: false,
		layer: null as unknown as Layer,
	};

	// Escape и класс на body — за менеджером слоёв: попап бывает открыт над модальным
	// окном, и закрывать их одним нажатием нельзя (см. layer.ts). Слой снимает только свой
	// попап — вложенные закрываются по одному, сверху вниз.
	entry.layer = LayerManager.push({
		close: () => closeEntry(entry),
		element: popupElem,
		bodyClass: POPUP.CLASS.BODY,
		// Фокус внутрь не уводим: попап открывают, не отпуская каретку в поле (панель
		// смайликов), — но если пользователь сам ушёл в него с клавиатуры, по закрытию
		// вернём его на кнопку.
		returnFocus: options?.initiator ?? null,
	});

	// Позиционируем по вставленному в документ и уже открытому попапу: у скрытого размеры
	// не те, а по ним считается и переворот, и сдвиг.
	const anchor = positionAnchor(options);
	if (anchor)
		entry.unposition = trackPosition(popupElem, anchor, {
			...positionOptions(options),
			// Ниже `@adaptive-tablet-small` попап показывается окном по центру, и координаты
			// у кнопки ему не нужны — признак объявляет сам стиль (см. `--popup-window-mode`
			// в popup.less), чтобы граница не жила ещё и числом в сценарии.
			enabled: () => !isWindowMode(popupElem),
		});

	stack.push(entry);
};

/**
 * Переключить попап: показать, а открытый — закрыть. Это поведение кнопки-переключателя, поэтому
 * им пользуется команда `ui-popup-toggle` и всякий, кто раскрывает попап по нажатию на кнопку.
 *
 * Возвращает, открыт ли попап после вызова: показывать его содержимое и придерживать что-то
 * на время показа нужно только при `true`.
 */
const toggle = (popupElem: HTMLElement, options?: PopupOptions): boolean => {
	const index = indexOfPopup(popupElem);
	if (index >= 0) {
		closeFrom(index);

		return false;
	}

	open(popupElem, options);

	return true;
};

export const PopupManager: IPopupManager = {
	open,
	toggle,
	close,
	isOpened: (popupElem?: HTMLElement) => (popupElem ? indexOfPopup(popupElem) >= 0 : stack.length > 0),
	get count() {
		return stack.length;
	},
	get current() {
		return top()?.popup ?? null;
	},
};

interface IPopupManager {
	/**
	 * Показать попап. Открытый этим же вызовом остаётся открытым; попап, чья кнопка стоит внутри
	 * уже открытого, ложится поверх него, а всякий другой открытые вытесняет.
	 */
	open: (popupElem: HTMLElement, options?: PopupOptions) => void;
	/** Показать попап, а открытый — закрыть вместе с раскрытым из него. Возвращает, открыт ли он после вызова. */
	toggle: (popupElem: HTMLElement, options?: PopupOptions) => boolean;
	/** Закрыть попап и всё, что над ним; без аргумента — закрыть все. */
	close: (popupElem?: HTMLElement) => void;
	/** Без аргумента — открыт ли хоть один попап; с аргументом — открыт ли именно этот. */
	isOpened: (popupElem?: HTMLElement) => boolean;
	/** Сколько попапов открыто: самостоятельный и раскрытые из него подменю. */
	readonly count: number;
	/** Самый верхний открытый попап — тот, которому достанется Escape. `null`, если открытых нет. */
	readonly current: HTMLElement | null;
}

interface PopupOptions {
	/**
	 * Кнопка, от которой раскрылся попап. Кроме состояния для скринридера она решает, чей это
	 * попап: стоящая внутри другого открытого попапа кнопка раскрывает подменю, и родитель
	 * при этом остаётся.
	 */
	initiator?: HTMLElement;
	onClose?: () => void;
	/**
	 * Ставить попап у якоря и держать его там, пока он открыт: с переворотом на другую сторону,
	 * когда на своей не помещается, и со сдвигом от края экрана (см. position.ts).
	 *
	 * `true` — у инициатора с умолчаниями; объект — свои сторона, зазор и отступ, а `anchor`
	 * задаёт якорь, отличный от кнопки: попап у поля ввода раскрывают кнопкой внутри него,
	 * а вставать он должен по всему полю.
	 *
	 * Без этого попапу оставлены его собственные координаты — те, что написаны в разметке
	 * проекта. Кит их не трогает: правило вида `left: calc(100% + 10px)` работало до появления
	 * этой опции и продолжает работать.
	 */
	position?: boolean | (PositionOptions & { anchor?: HTMLElement });
}
