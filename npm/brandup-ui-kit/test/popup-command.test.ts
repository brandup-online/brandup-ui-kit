/**
 * @jest-environment jsdom
 */
import { PopupManager } from "../source/popup";

// Reproduces the example app's popups page as it actually runs: the popup is the button's
// nextElementSibling, and the command that toggles it is dispatched from a listener on `window`
// (that is where @brandup/ui installs it), i.e. AFTER the manager's own listener on `document.body`.

function page(): { menuButton: HTMLElement; menuPopup: HTMLElement; subButton: HTMLElement; subPopup: HTMLElement } {
	document.body.innerHTML = `
		<div class="menu">
			<button data-cmd="anchored">Menu</button>
			<div class="ui-popup"><menu>
				<li><a href="">Item</a></li>
				<li>
					<button data-cmd="anchored-right">Submenu</button>
					<div class="ui-popup"><menu><li><a href="">Sub item</a></li></menu></div>
				</li>
			</menu></div>
		</div>`;

	const buttons = document.querySelectorAll<HTMLElement>("button");
	const popups = document.querySelectorAll<HTMLElement>(".ui-popup");

	return { menuButton: buttons[0], menuPopup: popups[0], subButton: buttons[1], subPopup: popups[1] };
}

// A stand-in for the @brandup/ui command dispatcher: a window-level click listener that runs the
// command and then stops the event, exactly where and how the real one does. A separate attribute
// name keeps the real dispatcher (armed by test/setup.ts) out of the way — it swallows every click
// carrying a `data-command` it has no handler for.
let commandListener: ((e: MouseEvent) => void) | null = null;

beforeEach(() => {
	PopupManager.close();
	if (commandListener) window.removeEventListener("click", commandListener);

	commandListener = (e: MouseEvent) => {
		const commandElem = (e.target as HTMLElement).closest<HTMLElement>("[data-cmd]");
		if (!commandElem) return;

		const name = commandElem.dataset.cmd;
		const popup = commandElem.nextElementSibling as HTMLElement;

		if (name === "anchored") PopupManager.toggle(popup, { initiator: commandElem });
		else if (name === "anchored-right") PopupManager.toggle(popup, { initiator: commandElem });

		e.preventDefault();
		e.stopPropagation();
		e.stopImmediatePropagation();
	};

	window.addEventListener("click", commandListener);
});

const click = (elem: HTMLElement) => elem.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

describe("example popups page", () => {
	it("opens the menu on the first click of its button", () => {
		const { menuButton, menuPopup } = page();

		click(menuButton);

		expect(PopupManager.isOpened(menuPopup)).toBe(true);
	});

	it("closes the menu on a second click of the same button", () => {
		const { menuButton, menuPopup } = page();

		click(menuButton);
		click(menuButton);

		expect(PopupManager.isOpened(menuPopup)).toBe(false);
	});

	it("opens the submenu from a button inside the open menu, keeping the parent", () => {
		const { menuButton, menuPopup, subButton, subPopup } = page();

		click(menuButton);
		click(subButton);

		expect(PopupManager.isOpened(menuPopup)).toBe(true);
		expect(PopupManager.isOpened(subPopup)).toBe(true);
		expect(PopupManager.count).toBe(2);
	});

	it("closes only the submenu on a second click of its button", () => {
		const { menuButton, subButton, menuPopup, subPopup } = page();

		click(menuButton);
		click(subButton);
		click(subButton);

		expect(PopupManager.isOpened(subPopup)).toBe(false);
		expect(PopupManager.isOpened(menuPopup)).toBe(true);
	});

	it("switches between two neighbouring menus", () => {
		document.body.innerHTML = `
			<button data-cmd="anchored">A</button>
			<div class="ui-popup">A body</div>
			<button data-cmd="anchored">B</button>
			<div class="ui-popup">B body</div>`;

		const buttons = document.querySelectorAll<HTMLElement>("button");
		const popups = document.querySelectorAll<HTMLElement>(".ui-popup");

		click(buttons[0]);
		expect(PopupManager.isOpened(popups[0])).toBe(true);

		click(buttons[1]);

		expect(PopupManager.isOpened(popups[0])).toBe(false);
		expect(PopupManager.isOpened(popups[1])).toBe(true);
	});
});
