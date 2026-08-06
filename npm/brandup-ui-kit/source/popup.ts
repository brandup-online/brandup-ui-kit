import "./popup.less"; // стили всплывающей поверхности

export const POPUP_CLASS = "ui-popup";
/** Ставится на сам попап, пока он открыт. */
export const POPUP_OPENED_CLASS = "opened";
export const POPUP_EXPANDED_CLASS = "ui-popup-expanded";
/** Ставится на body, пока открыт попап: страница может подстроиться под него (см. popup.less). */
export const POPUP_OPENED_BODY_CLASS = "ui-popup-opened";
export const POPUP_COMMAND = "ui-popup-toggle";

type CurrentPopup = {
	initiator?: HTMLElement;
	popup: HTMLElement;
	closeCallback?: () => void;
};

let current: CurrentPopup | null = null;

const closePopupEventHandler = (e: MouseEvent) => {
	const target = e.target as HTMLElement;
	if (target.closest(`.${POPUP_CLASS}`)) return; // если клик внутри popup, то делать ничего не нужно

	const clickedMenuItem = target.closest(`.${POPUP_EXPANDED_CLASS}`);
	const isInitiator = target == current?.initiator;

	close();

	if (clickedMenuItem || isInitiator) {
		// если клик по тому же элементу, который открыл контекстное меню, то останавливаем обработку клика, чтобы оно не отрылось заново

		e.preventDefault();
		e.stopImmediatePropagation();
	}
};

// Escape закрывает попап — это ожидание от любого всплывающего слоя, и держать свой обработчик
// каждому компоненту незачем. Слушатель не перехватывающий: обработчики на самом попапе получают
// клавишу первыми и успевают сделать своё (вернуть фокус, отменить ввод).
const closePopupKeyHandler = (e: KeyboardEvent) => {
	if (e.key !== "Escape") return;

	close();
};

const close = () => {
	if (current) {
		if (current.closeCallback) current.closeCallback();

		current.initiator?.classList.remove(POPUP_EXPANDED_CLASS); // закрываем последнее открытое контекстное меню
		current.popup.classList.remove(POPUP_OPENED_CLASS);

		current = null;
	}

	document.body.classList.remove(POPUP_OPENED_BODY_CLASS);
	document.body.removeEventListener("click", closePopupEventHandler);
	document.removeEventListener("keydown", closePopupKeyHandler);
};

const open = (popupElem: HTMLElement, options?: PopupOptions) => {
	if (current && current.popup !== popupElem) close(); // если открыт другой popup, закрываем его, чтобы не оставлять «осиротевший» visible popup

	const newPopup: CurrentPopup = {
		popup: popupElem,
		initiator: options?.initiator,
	};

	newPopup.closeCallback = options?.onClose;

	if (newPopup.popup.classList.toggle(POPUP_OPENED_CLASS)) {
		// это новый popup, открываем его

		newPopup.initiator?.classList.add(POPUP_EXPANDED_CLASS);
		document.body.classList.add(POPUP_OPENED_BODY_CLASS);

		document.body.addEventListener("click", closePopupEventHandler);
		document.addEventListener("keydown", closePopupKeyHandler);

		current = newPopup;
	} else {
		// данный popup уже открыт, закрываем его
		close();
	}
};

export const PopupManager: IPopupManager = {
	open,
	close,
	isOpened: (popupElem?: HTMLElement) => (popupElem ? current?.popup === popupElem : !!current),
};

interface IPopupManager {
	open: (popupElem: HTMLElement, options?: PopupOptions) => void;
	close: () => void;
	/** Без аргумента — открыт ли хоть один попап; с аргументом — открыт ли именно этот. */
	isOpened: (popupElem?: HTMLElement) => boolean;
}

interface PopupOptions {
	initiator?: HTMLElement;
	onClose?: () => void;
}
