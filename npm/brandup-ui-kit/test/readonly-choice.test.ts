import { enforceReadonlyChoice } from "../source/utils/readonly-choice";

// The browser does not read `readonly` on a checkbox or a radio at all: HTML has no such attribute
// for them. The kit's stylesheet draws such a control in a closed look, but that was where it ended
// — Space on the keyboard toggled it, and a value the host considered fixed changed.
//
// Checked through `click`: the browser turns Space on a choice control into one of its own accord,
// so a cancelled `click` is a cancelled key too (jsdom does not reproduce keyboard behaviour, but
// `elem.click()` goes the same way it does).

// Nothing is armed explicitly: the module subscribes itself as soon as it is loaded. That is why
// this suite does not call `enforceReadonlyChoice()` before the checks — should the subscription
// ever be moved back to an outside call, these checks would be the first to fail.

beforeEach(() => {
	document.body.innerHTML = "";
});

const input = (attributes: Partial<Record<"type" | "readonly" | "checked", string>>): HTMLInputElement => {
	const elem = document.createElement("input");
	for (const [name, value] of Object.entries(attributes)) elem.setAttribute(name, value);
	document.body.appendChild(elem);

	return elem;
};

describe("enforceReadonlyChoice", () => {
	it("keeps a readonly checkbox unchecked", () => {
		const elem = input({ type: "checkbox", readonly: "" });

		elem.click();

		expect(elem.checked).toBe(false);
	});

	it("keeps a readonly checkbox checked", () => {
		const elem = input({ type: "checkbox", readonly: "", checked: "" });

		elem.click();

		expect(elem.checked).toBe(true);
	});

	// A switch is the same checkbox and differs only by its role, so the cancel has to reach it too.
	it("keeps a readonly switch as it was", () => {
		const elem = input({ type: "checkbox", readonly: "", checked: "" });
		elem.setAttribute("role", "switch");

		elem.click();

		expect(elem.checked).toBe(true);
	});

	it("keeps a readonly radio unselected", () => {
		const elem = input({ type: "radio", readonly: "" });

		elem.click();

		expect(elem.checked).toBe(false);
	});

	it("leaves a checkbox without the attribute alone", () => {
		const elem = input({ type: "checkbox" });

		elem.click();

		expect(elem.checked).toBe(true);
	});

	// The press is cancelled, not the assignment: the host may change the value of a closed field
	// from code as much as it likes — `readonly` is about the user, not about the program.
	it("does not stand in the way of the host setting the value", () => {
		const elem = input({ type: "checkbox", readonly: "" });

		elem.checked = true;

		expect(elem.checked).toBe(true);
	});

	// The attribute is read at the moment of the press, so removing `readonly` puts the control back
	// in service straight away — with no re-subscription and no re-created element.
	it("lets the control work again once the attribute is removed", () => {
		const elem = input({ type: "checkbox", readonly: "" });

		elem.click();
		expect(elem.checked).toBe(false);

		elem.removeAttribute("readonly");
		elem.click();

		expect(elem.checked).toBe(true);
	});

	// The action is cancelled, not the event: a press on a closed field stays an ordinary press, and
	// the host's handler — the hint explaining why the field does not change — has to see it.
	it("still lets the host see the click", () => {
		const elem = input({ type: "checkbox", readonly: "" });
		const seen = jest.fn();
		elem.addEventListener("click", seen);

		elem.click();

		expect(seen).toHaveBeenCalledTimes(1);
		expect(elem.checked).toBe(false);
	});

	// On a text field the browser honours `readonly` itself, and presses on it must not be cancelled:
	// a click places the caret, and that is what selecting and copying go by.
	it("does not touch a readonly text field", () => {
		const elem = input({ type: "text", readonly: "" });
		const defaultPrevented = jest.fn();
		elem.addEventListener("click", (e) => defaultPrevented(e.defaultPrevented));

		elem.click();

		expect(defaultPrevented).toHaveBeenCalledWith(false);
	});

	// One listener on the document is all that is needed: the subscription has been in place since
	// the module loaded, and repeated calls — from an application that loads the kit lazily — must
	// not add a second one.
	it("subscribes once however many times it is called", () => {
		const spy = jest.spyOn(document, "addEventListener");

		enforceReadonlyChoice();
		enforceReadonlyChoice();

		expect(spy).not.toHaveBeenCalled();

		spy.mockRestore();
	});
});

// The cancel has to arrive with the package rather than with registering a middleware: the closed
// look is drawn by the stylesheet, unconditionally, for everyone who includes it. What is checked
// here is the whole chain at once: the kit itself is imported, nothing is configured, no application
// is running.
describe("importing the kit is enough", () => {
	it("cancels the toggle without any setup", async () => {
		await import("../source/index");

		document.body.innerHTML = "";
		const elem = document.createElement("input");
		elem.type = "checkbox";
		elem.setAttribute("readonly", "");
		document.body.appendChild(elem);

		elem.click();

		expect(elem.checked).toBe(false);
	});
});
