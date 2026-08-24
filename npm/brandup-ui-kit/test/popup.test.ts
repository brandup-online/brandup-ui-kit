/**
 * @jest-environment jsdom
 */
import { PopupManager } from "../source/popup";
import { UIKIT } from "../source/names";

function makePopup(): HTMLElement {
	const el = document.createElement("div");
	el.classList.add(UIKIT.POPUP.CLASS.ROOT);
	document.body.appendChild(el);
	return el;
}

function makeInitiator(): HTMLElement {
	const el = document.createElement("button");
	document.body.appendChild(el);
	return el;
}

describe("PopupManager", () => {
	beforeEach(() => {
		PopupManager.close(); // reset singleton state across tests
		document.body.innerHTML = "";
	});

	it("open() marks popup as opened and updates isOpened()", () => {
		const popup = makePopup();
		expect(PopupManager.isOpened()).toBe(false);

		PopupManager.open(popup);

		expect(popup.classList.contains("ui-popup-opened")).toBe(true);
		expect(PopupManager.isOpened()).toBe(true);
	});

	it("close() removes opened class and resets isOpened()", () => {
		const popup = makePopup();
		PopupManager.open(popup);

		PopupManager.close();

		expect(popup.classList.contains("ui-popup-opened")).toBe(false);
		expect(PopupManager.isOpened()).toBe(false);
	});

	it("open() with initiator marks the initiator as expanded", () => {
		const popup = makePopup();
		const initiator = makeInitiator();

		PopupManager.open(popup, { initiator });

		expect(initiator.classList.contains(UIKIT.POPUP.CLASS.EXPANDED)).toBe(true);
	});

	it("close() unmarks the initiator", () => {
		const popup = makePopup();
		const initiator = makeInitiator();
		PopupManager.open(popup, { initiator });

		PopupManager.close();

		expect(initiator.classList.contains(UIKIT.POPUP.CLASS.EXPANDED)).toBe(false);
	});

	it("calling close() twice is idempotent", () => {
		const popup = makePopup();
		PopupManager.open(popup);
		PopupManager.close();

		expect(() => PopupManager.close()).not.toThrow();
		expect(PopupManager.isOpened()).toBe(false);
	});

	// open() показывает — и только: закрывать открытое им же было бы сюрпризом для того,
	// кто просто просит показать попап (перерисовка содержимого, показ по внешнему событию)
	it("re-opening the same popup keeps it open", () => {
		const popup = makePopup();
		PopupManager.open(popup);

		PopupManager.open(popup);

		expect(popup.classList.contains("ui-popup-opened")).toBe(true);
		expect(PopupManager.isOpened(popup)).toBe(true);
	});

	it("toggle() opens a closed popup and reports it open", () => {
		const popup = makePopup();

		expect(PopupManager.toggle(popup)).toBe(true);
		expect(PopupManager.isOpened(popup)).toBe(true);
	});

	it("toggle() closes the popup it opened and reports it closed", () => {
		const popup = makePopup();
		PopupManager.toggle(popup);

		expect(PopupManager.toggle(popup)).toBe(false);
		expect(popup.classList.contains("ui-popup-opened")).toBe(false);
		expect(PopupManager.isOpened()).toBe(false);
	});

	// нажали кнопку соседнего попапа: прежний закрывается, новый показывается
	it("toggle() switches from another open popup", () => {
		const first = makePopup();
		const second = makePopup();
		PopupManager.toggle(first);

		expect(PopupManager.toggle(second)).toBe(true);
		expect(PopupManager.isOpened(second)).toBe(true);
		expect(first.classList.contains("ui-popup-opened")).toBe(false);
	});

	it("opening a different popup while one is open closes the previous (regression: multi-popup leak)", () => {
		const popupA = makePopup();
		const initiatorA = makeInitiator();
		const popupB = makePopup();
		const initiatorB = makeInitiator();

		PopupManager.open(popupA, { initiator: initiatorA });
		PopupManager.open(popupB, { initiator: initiatorB });

		expect(popupA.classList.contains("ui-popup-opened")).toBe(false);
		expect(initiatorA.classList.contains(UIKIT.POPUP.CLASS.EXPANDED)).toBe(false);
		expect(popupB.classList.contains("ui-popup-opened")).toBe(true);
		expect(initiatorB.classList.contains(UIKIT.POPUP.CLASS.EXPANDED)).toBe(true);
		expect(PopupManager.isOpened()).toBe(true);
	});

	it("open() marks body and close() unmarks it", () => {
		const popup = makePopup();

		PopupManager.open(popup);
		expect(document.body.classList.contains(UIKIT.POPUP.CLASS.BODY)).toBe(true);

		PopupManager.close();
		expect(document.body.classList.contains(UIKIT.POPUP.CLASS.BODY)).toBe(false);
	});

	it("body stays marked when another popup takes over", () => {
		const popupA = makePopup();
		const popupB = makePopup();

		PopupManager.open(popupA);
		PopupManager.open(popupB);

		expect(document.body.classList.contains(UIKIT.POPUP.CLASS.BODY)).toBe(true);
	});

	it("toggling the same popup closed unmarks body", () => {
		const popup = makePopup();

		PopupManager.toggle(popup);
		PopupManager.toggle(popup);

		expect(document.body.classList.contains(UIKIT.POPUP.CLASS.BODY)).toBe(false);
	});

	// Те же строки прописаны селекторами в popup.less: переименование константы молча разъехалось
	// бы со стилями, и попап остался бы без оформления открытого состояния.
	it("class names match the CSS contract", () => {
		expect(UIKIT.POPUP.CLASS).toEqual({
			ROOT: "ui-popup",
			OPENED: "ui-popup-opened",
			EXPANDED: "ui-popup-expanded",
			BODY: "body-popup-opened",
		});
		expect(UIKIT.POPUP.COMMAND.TOGGLE).toBe("ui-popup-toggle");
	});

	it("isOpened(elem) answers about that popup only", () => {
		const popup = makePopup();
		const other = makePopup();

		PopupManager.open(popup);

		expect(PopupManager.isOpened(popup)).toBe(true);
		expect(PopupManager.isOpened(other)).toBe(false);
	});

	// кнопка-переключатель объявляет своё состояние: класс виден стилям, aria — скринридеру
	it("open() marks the initiator with aria state bound to the popup", () => {
		const popup = makePopup();
		const initiator = makeInitiator();

		PopupManager.open(popup, { initiator });

		expect(initiator.getAttribute("aria-expanded")).toBe("true");
		expect(initiator.getAttribute("aria-controls")).toBe(popup.id);
		expect(popup.id).toBeTruthy();
	});

	it("keeps the id the markup gave the popup", () => {
		const popup = makePopup();
		popup.id = "menu";
		const initiator = makeInitiator();

		PopupManager.open(popup, { initiator });

		expect(popup.id).toBe("menu");
		expect(initiator.getAttribute("aria-controls")).toBe("menu");
	});

	// кнопка остаётся переключателем и в закрытом виде — состояние обязано читаться и тогда
	it("close() leaves the initiator collapsed, not silent", () => {
		const popup = makePopup();
		const initiator = makeInitiator();
		PopupManager.open(popup, { initiator });

		PopupManager.close();

		expect(initiator.getAttribute("aria-expanded")).toBe("false");
	});

	// фокус ушёл в попап с клавиатуры — по закрытию его возвращают на кнопку, иначе он теряется на body
	it("returns focus to the initiator when the popup had it", () => {
		const popup = makePopup();
		const initiator = makeInitiator();
		const inside = document.createElement("button");
		popup.appendChild(inside);

		PopupManager.open(popup, { initiator });
		inside.focus();
		PopupManager.close();

		expect(document.activeElement).toBe(initiator);
	});

	// попап смайликов открывают, не отпуская каретку в поле: забирать её у поля нельзя
	it("leaves focus where it stayed outside the popup", () => {
		const field = document.createElement("input");
		document.body.appendChild(field);
		const popup = makePopup();
		const initiator = makeInitiator();

		field.focus();
		PopupManager.open(popup, { initiator });
		PopupManager.close();

		expect(document.activeElement).toBe(field);
	});

	it("Escape closes the popup", () => {
		const popup = makePopup();
		PopupManager.open(popup);

		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

		expect(PopupManager.isOpened()).toBe(false);
		expect(popup.classList.contains(UIKIT.POPUP.CLASS.OPENED)).toBe(false);
	});

	it("other keys keep the popup open", () => {
		const popup = makePopup();
		PopupManager.open(popup);

		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

		expect(PopupManager.isOpened()).toBe(true);
	});

	it("Escape after close does not fire onClose again", () => {
		const popup = makePopup();
		const onClose = jest.fn();
		PopupManager.open(popup, { onClose });
		PopupManager.close();

		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("close() fires the onClose callback", () => {
		const popup = makePopup();
		const onClose = jest.fn();

		PopupManager.open(popup, { onClose });
		PopupManager.close();

		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("body click outside the popup closes it", () => {
		const popup = makePopup();
		const outside = document.createElement("div");
		document.body.appendChild(outside);

		PopupManager.open(popup);
		outside.click();

		expect(PopupManager.isOpened()).toBe(false);
	});

	it("body click inside the popup keeps it open", () => {
		const popup = makePopup();
		const inside = document.createElement("span");
		popup.appendChild(inside);

		PopupManager.open(popup);
		inside.click();

		expect(PopupManager.isOpened()).toBe(true);
	});

	it("clicking the initiator preventDefaults and closes (no re-open via bubbling)", () => {
		const popup = makePopup();
		const initiator = makeInitiator();
		PopupManager.open(popup, { initiator });

		const event = new MouseEvent("click", { bubbles: true, cancelable: true });
		initiator.dispatchEvent(event);

		expect(event.defaultPrevented).toBe(true);
		expect(PopupManager.isOpened()).toBe(false);
	});
});
