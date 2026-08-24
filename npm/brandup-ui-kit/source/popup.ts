import { LayerManager, type Layer } from "./layer";
import { UIKIT } from "./names";
import "./popup.less"; // стили всплывающей поверхности

/** Имена попапа — в общем модуле имён кита (см. names.ts). */
const POPUP = UIKIT.POPUP;

type CurrentPopup = {
	initiator?: HTMLElement;
	popup: HTMLElement;
	closeCallback?: () => void;
	layer: Layer;
};

let current: CurrentPopup | null = null;
let closing = false; // закрытие уже идёт: обработчик onClose мог позвать close() ещё раз
let popupIdSeq = 0;

const closePopupEventHandler = (e: MouseEvent) => {
	const target = e.target as HTMLElement;
	if (target.closest(`.${POPUP.CLASS.ROOT}`)) return; // если клик внутри popup, то делать ничего не нужно

	const clickedMenuItem = target.closest(`.${POPUP.CLASS.EXPANDED}`);
	const isInitiator = target == current?.initiator;

	close();

	if (clickedMenuItem || isInitiator) {
		// если клик по тому же элементу, который открыл контекстное меню, то останавливаем обработку клика, чтобы оно не отрылось заново

		e.preventDefault();
		e.stopImmediatePropagation();
	}
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

const close = () => {
	if (current && !closing) {
		closing = true;

		try {
			if (current.closeCallback) current.closeCallback();

			setInitiatorState(current.initiator, current.popup, false);
			current.popup.classList.remove(POPUP.CLASS.OPENED);

			const layer = current.layer;
			current = null;

			// последним: слой возвращает фокус на инициатора, и делать это нужно уже по закрытому попапу
			layer.release();
		} finally {
			closing = false;
		}
	}

	document.body.removeEventListener("click", closePopupEventHandler);
};

/**
 * Показать попап. Открытый этим же вызовом остаётся открытым — повторный `open` ничего не меняет;
 * закрыть его нажатием по той же кнопке — работа {@link toggle}.
 */
const open = (popupElem: HTMLElement, options?: PopupOptions) => {
	if (current?.popup === popupElem) return; // уже показан — открывать нечего

	if (current) close(); // если открыт другой popup, закрываем его, чтобы не оставлять «осиротевший» visible popup

	popupElem.classList.add(POPUP.CLASS.OPENED);

	setInitiatorState(options?.initiator, popupElem, true);

	document.body.addEventListener("click", closePopupEventHandler);

	current = {
		popup: popupElem,
		initiator: options?.initiator,
		closeCallback: options?.onClose,
		// Escape и класс на body — за менеджером слоёв: попап бывает открыт над модальным
		// окном, и закрывать их одним нажатием нельзя (см. layer.ts).
		layer: LayerManager.push({
			close,
			element: popupElem,
			bodyClass: POPUP.CLASS.BODY,
			// Фокус внутрь не уводим: попап открывают, не отпуская каретку в поле (панель
			// смайликов), — но если пользователь сам ушёл в него с клавиатуры, по закрытию
			// вернём его на кнопку.
			returnFocus: options?.initiator ?? null,
		}),
	};
};

/**
 * Переключить попап: показать, а открытый — закрыть. Это поведение кнопки-переключателя, поэтому
 * им пользуется команда `ui-popup-toggle` и всякий, кто раскрывает попап по нажатию на кнопку.
 *
 * Возвращает, открыт ли попап после вызова: показывать его содержимое и придерживать что-то
 * на время показа нужно только при `true`.
 */
const toggle = (popupElem: HTMLElement, options?: PopupOptions): boolean => {
	if (current?.popup === popupElem) {
		close();

		return false;
	}

	open(popupElem, options);

	return true;
};

export const PopupManager: IPopupManager = {
	open,
	toggle,
	close,
	isOpened: (popupElem?: HTMLElement) => (popupElem ? current?.popup === popupElem : !!current),
};

interface IPopupManager {
	/** Показать попап; открытый этим же вызовом остаётся открытым, а другой — закрывается. */
	open: (popupElem: HTMLElement, options?: PopupOptions) => void;
	/** Показать попап, а открытый — закрыть. Возвращает, открыт ли он после вызова. */
	toggle: (popupElem: HTMLElement, options?: PopupOptions) => boolean;
	/** Закрыть открытый попап; закрывать нечего — вызов ничего не делает. */
	close: () => void;
	/** Без аргумента — открыт ли хоть один попап; с аргументом — открыт ли именно этот. */
	isOpened: (popupElem?: HTMLElement) => boolean;
}

interface PopupOptions {
	initiator?: HTMLElement;
	onClose?: () => void;
}
