export const POPUP_CLASS = "ui-popup";
export const POPUP_EXPANDED_CLASS = "ui-popup-expanded";
export const POPUP_COMMAND = "ui-popup-toggle";

type CurrentPopup = {
	initiator?: HTMLElement,
	popup: HTMLElement,
	closeCallback?: () => void
};

var current: CurrentPopup | null = null;

const closePopupEventHandler = (e: MouseEvent) => {
	const target = e.target as HTMLElement;
	if (target.closest(`.${POPUP_CLASS}`))
		return; // если клик внутри popup, то делать ничего не нужно

	close();

	const clickedMenuItem = target.closest(`.${POPUP_EXPANDED_CLASS}`);
	if (clickedMenuItem || target == current?.initiator) {
		// если клик по тому же элементу, который открыл контекстное меню, то останавливаем обработку клика, чтобы оно не отрылось заново

		e.preventDefault();
		e.stopImmediatePropagation();
	}
};

const close = () => {
	if (current) {
		if (current.closeCallback)
			current.closeCallback();

		current.initiator?.classList.remove(POPUP_EXPANDED_CLASS); // закрываем последнее открытое контекстное меню
		current.popup.classList.remove("opened");
	}

	document.body.removeEventListener("click", closePopupEventHandler);
}

const open = (popupElem: HTMLElement, options?: PopupOptions) => {
	let newPopup: CurrentPopup = {
		popup: popupElem,
		initiator: options?.initiator
	};

	newPopup.closeCallback = options?.onClose;

	if (newPopup.popup.classList.toggle("opened")) {
		// это новый popup, открываем его

		newPopup.initiator?.classList.add(POPUP_EXPANDED_CLASS);

		document.body.addEventListener("click", closePopupEventHandler);

		current = newPopup;
	}
	else {
		// данный popup уже открыт, закрываем его
		close();
	}
}

export const PopupManager: IPopupManager = {
	open,
	close,
	isOpened: () => !!current
};

interface IPopupManager {
	open: (popupElem: HTMLElement, options?: PopupOptions) => void;
	close: () => void;
	isOpened: () => boolean;
}

interface PopupOptions {
	initiator?: HTMLElement;
	onClose?: () => void
}