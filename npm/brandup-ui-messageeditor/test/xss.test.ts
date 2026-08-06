/**
 * @jest-environment jsdom
 */
import RandomizerModal from "../source/randomizer";
import VariablesModal from "../source/variables";
import { highlight } from "../source/highlight";

// Message text and variable lists come from outside: typing in the field, a stored template,
// attributes of the value element. A string child of DOM.tag is inserted as HTML, so everything
// that is not our own markup has to reach the DOM as text.
const PAYLOAD = '<img src=x onerror="window.__pwned = 1">';

const opened: Array<{ close(): void }> = [];
const open = <T extends { close(): void }>(modal: T): T => {
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

describe("text is never rendered as markup", () => {
	it("keeps a randomizer variant as text", () => {
		const modal = open(new RandomizerModal(PAYLOAD, () => {}));
		const field = modal.element!.querySelector<HTMLElement>(".variant .editable")!;

		expect(field.querySelector("img")).toBeNull();
		expect(field.textContent).toBe(PAYLOAD);
	});

	it("keeps a variable name and key as text", () => {
		const modal = open(new VariablesModal([{ key: PAYLOAD, name: PAYLOAD }], () => {}));
		const button = modal.element!.querySelector<HTMLElement>(".variable")!;

		expect(button.querySelector("img")).toBeNull();
		expect(button.querySelector(".preview")!.textContent).toBe(`{${PAYLOAD}}`);
		expect(button.querySelector(".key")!.textContent).toBe(PAYLOAD);
	});

	it("keeps the empty-list hint as text", () => {
		const modal = open(new VariablesModal([], () => {}, PAYLOAD));
		const empty = modal.element!.querySelector<HTMLElement>(".variables .empty")!;

		expect(empty.querySelector("img")).toBeNull();
		expect(empty.textContent).toBe(PAYLOAD);
	});

	it("keeps a highlighted variable key as text", () => {
		const root = document.createElement("div");
		root.textContent = `{${PAYLOAD}}`;

		highlight(root, { names: new Map([[PAYLOAD, "Имя"]]) });

		const key = root.querySelector<HTMLElement>(".variable .key")!;
		expect(key.querySelector("img")).toBeNull();
		expect(key.textContent).toBe(`{${PAYLOAD}}`);
	});
});
