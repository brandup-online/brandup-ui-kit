/**
 * @jest-environment jsdom
 */
import Modal from "../source/modal";

class TestModal extends Modal {
	override get typeName(): string {
		return "Test.Modal";
	}
}

const opened: Modal[] = [];
const open = (modal: Modal): Modal => {
	opened.push(modal);
	return modal;
};

beforeEach(() => {
	document.body.innerHTML = "";
	document.body.className = "";
});

// an unclosed window stays subscribed to its element leaving the DOM, and the jsdom teardown
// triggers that after the environment is already gone
afterEach(() => {
	opened.forEach((modal) => modal.close());
	opened.length = 0;
});

describe("Modal", () => {
	// The title is host data. A string child of DOM.tag is inserted as HTML (that is how the svg
	// reaches the close button), so the title has to reach the DOM as text — otherwise markup
	// coming from data would execute.
	it("renders the title as text, not as markup", () => {
		const title = '<img src=x onerror="window.__pwned = 1">';
		const modal = open(new TestModal({ title }));
		const elem = modal.element!.querySelector<HTMLElement>(".modal-title")!;

		expect(elem.querySelector("img")).toBeNull();
		expect(elem.textContent).toBe(title);
	});

	it("renders no title when none is given", () => {
		const modal = open(new TestModal());

		expect(modal.element!.querySelector(".modal-title")).toBeNull();
	});

	it("renders the close button by default", () => {
		const modal = open(new TestModal());

		expect(modal.element!.querySelector(".modal-close")).not.toBeNull();
	});

	// the button is dropped from the markup, not hidden by styles: a hidden one is still
	// reachable by keyboard
	it("renders no close button when it is turned off", () => {
		const modal = open(new TestModal({ title: "Заголовок", closeButton: false }));

		expect(modal.element!.querySelector(".modal-close")).toBeNull();
		expect(modal.element!.querySelector(".modal-header")).not.toBeNull();
	});

	// an empty header would still take its padding above the body
	it("renders no header without a title and a close button", () => {
		const modal = open(new TestModal({ closeButton: false }));

		expect(modal.element!.querySelector(".modal-header")).toBeNull();
	});

	// Esc and the backdrop have their own settings — dropping the button leaves them alone
	it("still closes by Esc without the close button", () => {
		const modal = open(new TestModal({ closeButton: false }));

		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

		expect(document.querySelector(".ui-modal")).toBeNull();
		expect(modal.element).toBeUndefined();
	});
});
