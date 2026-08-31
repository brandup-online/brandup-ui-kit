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

	// open() shows and only shows: closing what it opened itself would surprise anyone who is just
	// asking for the popup to be shown (redrawing its content, showing it on an external event)
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

	// the button of a neighbouring popup was pressed: the old one closes, the new one is shown
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

	// The same strings are written as selectors in popup.less: renaming the constant would quietly
	// drift apart from the stylesheet, and the popup would be left with no open-state styling.
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

	// a toggle button declares its state: the class is visible to the stylesheet, aria to a screen reader
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

	// the button stays a toggle when closed too — the state has to be readable then as well
	it("close() leaves the initiator collapsed, not silent", () => {
		const popup = makePopup();
		const initiator = makeInitiator();
		PopupManager.open(popup, { initiator });

		PopupManager.close();

		expect(initiator.getAttribute("aria-expanded")).toBe("false");
	});

	// focus went into the popup from the keyboard — closing returns it to the button, or it is lost on body
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

	// the emoji popup is opened without letting go of the caret in the field: it must not be taken away
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

// Nested popups: a submenu opened from a menu, an emoji panel inside an open panel. Kinship is
// decided by the button — one standing inside an open popup opens a submenu rather than replacing
// the parent. Neighbours still evict each other: two menus in a header must not be open at once
// (see the checks above).
describe("PopupManager: nested popups", () => {
	beforeEach(() => {
		PopupManager.close();
		document.body.innerHTML = "";
	});

	/** A popup and the button that opens it from inside `parent`. */
	function makeChildOf(parent: HTMLElement): { popup: HTMLElement; initiator: HTMLElement } {
		const initiator = document.createElement("button");
		parent.appendChild(initiator);

		return { popup: makePopup(), initiator };
	}

	it("lays a submenu on top of its parent rather than in place of it", () => {
		const parent = makePopup();
		PopupManager.open(parent);
		const child = makeChildOf(parent);

		PopupManager.open(child.popup, { initiator: child.initiator });

		expect(PopupManager.isOpened(parent)).toBe(true);
		expect(PopupManager.isOpened(child.popup)).toBe(true);
		expect(PopupManager.count).toBe(2);
		expect(PopupManager.current).toBe(child.popup);
	});

	it("takes the submenu away when the parent closes", () => {
		const parent = makePopup();
		PopupManager.open(parent);
		const child = makeChildOf(parent);
		PopupManager.open(child.popup, { initiator: child.initiator });

		PopupManager.close(parent);

		expect(PopupManager.isOpened(child.popup)).toBe(false);
		expect(PopupManager.isOpened(parent)).toBe(false);
		expect(PopupManager.count).toBe(0);
	});

	it("leaves the parent alone when the submenu closes", () => {
		const parent = makePopup();
		PopupManager.open(parent);
		const child = makeChildOf(parent);
		PopupManager.open(child.popup, { initiator: child.initiator });

		PopupManager.close(child.popup);

		expect(PopupManager.isOpened(child.popup)).toBe(false);
		expect(PopupManager.isOpened(parent)).toBe(true);
	});

	// There is one Escape listener for the whole layer stack, and it takes down the top one:
	// otherwise a single press would close the menu underneath along with the submenu.
	it("takes down only the top popup on Escape", () => {
		const parent = makePopup();
		PopupManager.open(parent);
		const child = makeChildOf(parent);
		PopupManager.open(child.popup, { initiator: child.initiator });

		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

		expect(PopupManager.isOpened(child.popup)).toBe(false);
		expect(PopupManager.isOpened(parent)).toBe(true);
	});

	it("closes the submenu on a press inside the parent and leaves the parent open", () => {
		const parent = makePopup();
		const inside = document.createElement("span");
		parent.appendChild(inside);
		PopupManager.open(parent);
		const child = makeChildOf(parent);
		PopupManager.open(child.popup, { initiator: child.initiator });

		inside.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

		expect(PopupManager.isOpened(child.popup)).toBe(false);
		expect(PopupManager.isOpened(parent)).toBe(true);
	});

	// A second press on the submenu's button is its closing, and the event is swallowed: otherwise
	// the `ui-popup-toggle` command bubbling up behind it would see the popup closed and open it again.
	it("closes only the submenu on a second press of its button", () => {
		const parent = makePopup();
		PopupManager.open(parent);
		const child = makeChildOf(parent);
		PopupManager.open(child.popup, { initiator: child.initiator });

		const event = new MouseEvent("click", { bubbles: true, cancelable: true });
		child.initiator.dispatchEvent(event);

		expect(event.defaultPrevented).toBe(true);
		expect(PopupManager.isOpened(child.popup)).toBe(false);
		expect(PopupManager.isOpened(parent)).toBe(true);
	});

	// A popup can also be closed past the top-down closing: Escape calls the takedown straight from
	// the layer. The body click listener used to be removed only in the top-down closing and stayed
	// armed after Escape — running on every press on the page until it removed itself.
	it("leaves no listener on the body after Escape", () => {
		const popup = makePopup();
		PopupManager.open(popup);

		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		expect(PopupManager.count).toBe(0);

		// A leftover listener would give itself away by working: on an empty stack it removes itself.
		const remove = jest.spyOn(document.body, "removeEventListener");
		document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		const leftover = remove.mock.calls.length > 0;
		remove.mockRestore();

		expect(leftover).toBe(false);
	});

	it("closes both the submenu and the parent on a press outside them all", () => {
		const parent = makePopup();
		PopupManager.open(parent);
		const child = makeChildOf(parent);
		PopupManager.open(child.popup, { initiator: child.initiator });

		document.body.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

		expect(PopupManager.count).toBe(0);
	});

	// A button on the page rather than inside a popup: such a popup is no kin to the open ones, so
	// they close.
	it("evicts the whole stack for a standalone popup", () => {
		const parent = makePopup();
		PopupManager.open(parent);
		const child = makeChildOf(parent);
		PopupManager.open(child.popup, { initiator: child.initiator });

		const neighbour = makePopup();
		PopupManager.open(neighbour, { initiator: makeInitiator() });

		expect(PopupManager.count).toBe(1);
		expect(PopupManager.isOpened(neighbour)).toBe(true);
		expect(PopupManager.isOpened(parent)).toBe(false);
	});

	// The body class is counted by the layer manager: it comes off with the last one closed, or
	// closing a submenu would give the page back the scrolling its parent was still holding.
	it("keeps the body class while at least one popup is open", () => {
		const parent = makePopup();
		PopupManager.open(parent);
		const child = makeChildOf(parent);
		PopupManager.open(child.popup, { initiator: child.initiator });

		PopupManager.close(child.popup);
		expect(document.body.classList.contains(UIKIT.POPUP.CLASS.BODY)).toBe(true);

		PopupManager.close(parent);
		expect(document.body.classList.contains(UIKIT.POPUP.CLASS.BODY)).toBe(false);
	});

	// Closing goes top down, so focus travels along the chain: from a submenu to its button in the
	// parent rather than straight to the page.
	it("returns focus along the chain", () => {
		const parent = makePopup();
		const parentInitiator = makeInitiator();
		PopupManager.open(parent, { initiator: parentInitiator });
		const child = makeChildOf(parent);
		child.initiator.focus();
		PopupManager.open(child.popup, { initiator: child.initiator });
		child.popup.focus();

		PopupManager.close(child.popup);

		expect(document.activeElement).toBe(child.initiator);
	});

	it("keeps a re-opened popup in its own place in the stack", () => {
		const parent = makePopup();
		PopupManager.open(parent);
		const child = makeChildOf(parent);
		PopupManager.open(child.popup, { initiator: child.initiator });

		PopupManager.open(child.popup, { initiator: child.initiator });

		expect(PopupManager.count).toBe(2);
		expect(PopupManager.current).toBe(child.popup);
	});
});

// Positioning is turned on by an option and is off by default: the popup keeps the coordinates
// written in the project's markup — a rule like `left: calc(100% + 10px)` worked before the option
// existed and has to work after it. The calculation itself is checked in position.test.ts; here it
// is that the manager turns it on, turns it off and cleans up after itself.
describe("PopupManager: anchored positioning", () => {
	// jsdom does not lay anything out, and its viewport is zero — with one like that every popup is
	// pressed to the edge padding and there would be nothing to check. The screen size is set here.
	beforeAll(() => {
		Object.defineProperty(document.documentElement, "clientWidth", { value: 1000, configurable: true });
		Object.defineProperty(document.documentElement, "clientHeight", { value: 800, configurable: true });
	});

	beforeEach(() => {
		PopupManager.close();
		document.body.innerHTML = "";
	});

	it("does not touch the popup's coordinates without the option", () => {
		const popup = makePopup();
		popup.style.left = "42px";

		PopupManager.open(popup, { initiator: makeInitiator() });

		expect(popup.style.position).toBe("");
		expect(popup.style.left).toBe("42px");
	});

	it("puts the popup at the initiator with the option", () => {
		const popup = makePopup();

		PopupManager.open(popup, { initiator: makeInitiator(), position: true });

		expect(popup.style.position).toBe("fixed");
		expect(popup.style.left).not.toBe("");
	});

	it("gives the popup its own coordinates back on closing", () => {
		const popup = makePopup();
		PopupManager.open(popup, { initiator: makeInitiator(), position: true });

		PopupManager.close(popup);

		expect(popup.style.position).toBe("");
		expect(popup.style.left).toBe("");
		expect(popup.style.top).toBe("");
	});

	// A popup by a text field is opened by a button inside the field, but has to stand by the whole field.
	it("takes an anchor separate from the button", () => {
		const popup = makePopup();
		const field = document.createElement("div");
		document.body.appendChild(field);
		field.getBoundingClientRect = () => ({ left: 120, top: 40, width: 300, height: 46 }) as DOMRect;

		PopupManager.open(popup, { initiator: makeInitiator(), position: { anchor: field } });

		expect(popup.style.left).toBe("120px");
		expect(popup.style.top).toBe("90px"); // 40 + 46 + gap of 4
	});

	// The option with no anchor — neither an initiator nor `anchor` — must not break opening: the
	// popup simply stays on its own coordinates.
	it("simply does not position anything without an anchor", () => {
		const popup = makePopup();

		PopupManager.open(popup, { position: true });

		expect(PopupManager.isOpened(popup)).toBe(true);
		expect(popup.style.position).toBe("");
	});
});

// Regressions for the two ways the stack could be driven into an inconsistent state.
describe("PopupManager: closing re-entrancy and wrapper initiators", () => {
	beforeEach(() => {
		PopupManager.close();
		document.body.innerHTML = "";
	});

	// onClose calling close() again is a defensive pattern consumers already use. The stack has to
	// survive it: closing walked the stack by a counter, and a callback that emptied the stack under
	// the loop left it closing an entry that no longer existed.
	it("survives a close() re-entered from an onClose callback", () => {
		const parent = makePopup();
		PopupManager.open(parent);

		const childInitiator = document.createElement("button");
		parent.appendChild(childInitiator);
		const child = makePopup();

		PopupManager.open(child, {
			initiator: childInitiator,
			onClose: () => PopupManager.close(),
		});

		expect(() => PopupManager.close()).not.toThrow();

		expect(PopupManager.count).toBe(0);
		expect(PopupManager.isOpened(parent)).toBe(false);
		expect(PopupManager.isOpened(child)).toBe(false);
	});

	// The teardown after a re-entrant close still has to finish: a listener left on the body would
	// keep firing on every click of the page.
	it("leaves no body listener behind after a re-entrant close", () => {
		const popup = makePopup();
		PopupManager.open(popup, { onClose: () => PopupManager.close() });

		PopupManager.close();

		const other = makePopup();
		PopupManager.open(other);
		// A stale handler from the closed popup would see this click and close the fresh popup.
		const inside = document.createElement("span");
		other.appendChild(inside);
		inside.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

		expect(PopupManager.isOpened(other)).toBe(true);
	});

	// The initiator may legally wrap its own popup. A click inside such a popup is work inside the
	// popup, not a press on the button, so it must neither close it nor swallow the event.
	it("keeps the popup open when the initiator contains it", () => {
		const wrapper = document.createElement("div");
		document.body.appendChild(wrapper);

		const popup = document.createElement("div");
		popup.classList.add(UIKIT.POPUP.CLASS.ROOT);
		wrapper.appendChild(popup);

		const item = document.createElement("a");
		popup.appendChild(item);

		PopupManager.open(popup, { initiator: wrapper });

		const event = new MouseEvent("click", { bubbles: true, cancelable: true });
		item.dispatchEvent(event);

		expect(PopupManager.isOpened(popup)).toBe(true);
		expect(event.defaultPrevented).toBe(false);
	});

	// Pressing the wrapper itself, outside the popup, is still the toggle press.
	it("closes the popup when the wrapping initiator is pressed outside it", () => {
		const wrapper = document.createElement("div");
		document.body.appendChild(wrapper);

		const label = document.createElement("span");
		wrapper.appendChild(label);

		const popup = document.createElement("div");
		popup.classList.add(UIKIT.POPUP.CLASS.ROOT);
		wrapper.appendChild(popup);

		PopupManager.open(popup, { initiator: wrapper });

		label.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

		expect(PopupManager.isOpened(popup)).toBe(false);
	});

	// A wrapping initiator contains its own popup, and the submenu button sits inside that popup —
	// so the wrapper contains the submenu button too. Searching the stack bottom-up matched the
	// wrapper first and closed the whole chain instead of just the submenu.
	it("closes only the submenu when the parent initiator wraps it as well", () => {
		const wrapper = document.createElement("div");
		document.body.appendChild(wrapper);

		const parent = document.createElement("div");
		parent.classList.add(UIKIT.POPUP.CLASS.ROOT);
		wrapper.appendChild(parent);

		PopupManager.open(parent, { initiator: wrapper });

		const childInitiator = document.createElement("button");
		parent.appendChild(childInitiator);
		const child = makePopup();
		PopupManager.open(child, { initiator: childInitiator });

		expect(PopupManager.count).toBe(2);

		childInitiator.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

		expect(PopupManager.isOpened(child)).toBe(false);
		expect(PopupManager.isOpened(parent)).toBe(true);
	});
});
