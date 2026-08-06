/**
 * @jest-environment jsdom
 */
import {
	PopupManager,
	POPUP_CLASS,
	POPUP_OPENED_CLASS,
	POPUP_EXPANDED_CLASS,
	POPUP_OPENED_BODY_CLASS,
} from "../source/popup";

function makePopup(): HTMLElement {
	const el = document.createElement("div");
	el.classList.add(POPUP_CLASS);
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

		expect(popup.classList.contains("opened")).toBe(true);
		expect(PopupManager.isOpened()).toBe(true);
	});

	it("close() removes opened class and resets isOpened()", () => {
		const popup = makePopup();
		PopupManager.open(popup);

		PopupManager.close();

		expect(popup.classList.contains("opened")).toBe(false);
		expect(PopupManager.isOpened()).toBe(false);
	});

	it("open() with initiator marks the initiator as expanded", () => {
		const popup = makePopup();
		const initiator = makeInitiator();

		PopupManager.open(popup, { initiator });

		expect(initiator.classList.contains(POPUP_EXPANDED_CLASS)).toBe(true);
	});

	it("close() unmarks the initiator", () => {
		const popup = makePopup();
		const initiator = makeInitiator();
		PopupManager.open(popup, { initiator });

		PopupManager.close();

		expect(initiator.classList.contains(POPUP_EXPANDED_CLASS)).toBe(false);
	});

	it("calling close() twice is idempotent", () => {
		const popup = makePopup();
		PopupManager.open(popup);
		PopupManager.close();

		expect(() => PopupManager.close()).not.toThrow();
		expect(PopupManager.isOpened()).toBe(false);
	});

	it("re-opening the same popup toggles it closed", () => {
		const popup = makePopup();
		PopupManager.open(popup);

		PopupManager.open(popup);

		expect(popup.classList.contains("opened")).toBe(false);
		expect(PopupManager.isOpened()).toBe(false);
	});

	it("opening a different popup while one is open closes the previous (regression: multi-popup leak)", () => {
		const popupA = makePopup();
		const initiatorA = makeInitiator();
		const popupB = makePopup();
		const initiatorB = makeInitiator();

		PopupManager.open(popupA, { initiator: initiatorA });
		PopupManager.open(popupB, { initiator: initiatorB });

		expect(popupA.classList.contains("opened")).toBe(false);
		expect(initiatorA.classList.contains(POPUP_EXPANDED_CLASS)).toBe(false);
		expect(popupB.classList.contains("opened")).toBe(true);
		expect(initiatorB.classList.contains(POPUP_EXPANDED_CLASS)).toBe(true);
		expect(PopupManager.isOpened()).toBe(true);
	});

	it("open() marks body and close() unmarks it", () => {
		const popup = makePopup();

		PopupManager.open(popup);
		expect(document.body.classList.contains(POPUP_OPENED_BODY_CLASS)).toBe(true);

		PopupManager.close();
		expect(document.body.classList.contains(POPUP_OPENED_BODY_CLASS)).toBe(false);
	});

	it("body stays marked when another popup takes over", () => {
		const popupA = makePopup();
		const popupB = makePopup();

		PopupManager.open(popupA);
		PopupManager.open(popupB);

		expect(document.body.classList.contains(POPUP_OPENED_BODY_CLASS)).toBe(true);
	});

	it("toggling the same popup closed unmarks body", () => {
		const popup = makePopup();

		PopupManager.open(popup);
		PopupManager.open(popup);

		expect(document.body.classList.contains(POPUP_OPENED_BODY_CLASS)).toBe(false);
	});

	// Те же строки прописаны селекторами в popup.less: переименование константы молча разъехалось
	// бы со стилями, и попап остался бы без оформления открытого состояния.
	it("class names match the CSS contract", () => {
		expect(POPUP_CLASS).toBe("ui-popup");
		expect(POPUP_OPENED_CLASS).toBe("opened");
		expect(POPUP_EXPANDED_CLASS).toBe("ui-popup-expanded");
		expect(POPUP_OPENED_BODY_CLASS).toBe("ui-popup-opened");
	});

	it("isOpened(elem) answers about that popup only", () => {
		const popup = makePopup();
		const other = makePopup();

		PopupManager.open(popup);

		expect(PopupManager.isOpened(popup)).toBe(true);
		expect(PopupManager.isOpened(other)).toBe(false);
	});

	it("Escape closes the popup", () => {
		const popup = makePopup();
		PopupManager.open(popup);

		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

		expect(PopupManager.isOpened()).toBe(false);
		expect(popup.classList.contains(POPUP_OPENED_CLASS)).toBe(false);
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
