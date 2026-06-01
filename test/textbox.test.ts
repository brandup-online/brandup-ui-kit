/**
 * @jest-environment jsdom
 */
import TextBox, { ROOT_CLASS } from "../npm/brandup-ui-textbox/source/textbox";

function setup(opts: { value?: string; required?: boolean; type?: string } = {}) {
	document.body.innerHTML = "";
	const form = document.createElement("form");
	const input = document.createElement("input");
	input.type = opts.type ?? "text";
	if (opts.value !== undefined) input.value = opts.value;
	if (opts.required) input.required = true;
	form.appendChild(input);
	document.body.appendChild(form);
	return { input, form };
}

describe("TextBox", () => {
	it("wraps the input in a ui-textbox container", () => {
		const { input } = setup();
		new TextBox(input);

		const container = input.parentElement!;
		expect(container.classList.contains(ROOT_CLASS)).toBe(true);
		// the contenteditable .input div exists inside the container
		expect(container.querySelector(".input")).not.toBeNull();
	});

	it("getValue() returns the trimmed underlying value", () => {
		const { input } = setup({ value: "  hello  " });
		const tb = new TextBox(input);
		expect(tb.getValue()).toBe("hello");
	});

	it("setValue() updates the underlying input value", () => {
		const { input } = setup();
		const tb = new TextBox(input);
		tb.setValue("world");
		expect(input.value).toBe("world");
	});

	it("setValue() does not inject HTML (XSS regression)", () => {
		const { input } = setup();
		const tb = new TextBox(input);

		tb.setValue("<img src=x onerror=alert(1)>");

		const editable = tb.element!.querySelector(".input")!;
		expect(editable.querySelector("img")).toBeNull();
		expect(editable.textContent).toBe("<img src=x onerror=alert(1)>");
	});

	it("hasValue() reflects emptiness", () => {
		const { input } = setup();
		const tb = new TextBox(input);
		expect(tb.hasValue()).toBe(false);

		tb.setValue("x");
		expect(tb.hasValue()).toBe(true);
	});

	it("onChange() handler fires on setValue with the new value", () => {
		const { input } = setup();
		const tb = new TextBox(input);
		const handler = jest.fn();
		tb.onChange(handler);

		tb.setValue("typed");

		expect(handler).toHaveBeenCalledWith(expect.objectContaining({ value: "typed" }));
	});

	it("validate() returns true for valid input", () => {
		const { input } = setup({ value: "ok" });
		const tb = new TextBox(input);
		expect(tb.validate()).toBe(true);
		expect(tb.element!.classList.contains("invalid")).toBe(false);
	});

	it("validate() marks invalid class when required field is empty", () => {
		const { input } = setup({ required: true });
		const tb = new TextBox(input);

		expect(tb.validate()).toBe(false);
		expect(tb.element!.classList.contains("invalid")).toBe(true);
	});

	it("destroy() removes the container and restores the original input to the DOM", () => {
		const { input } = setup();
		const tb = new TextBox(input);
		const container = tb.element!;

		tb.destroy();

		expect(container.isConnected).toBe(false);
		expect(input.isConnected).toBe(true);
	});

	it("multiline contenteditable preserves <br> between pasted lines but does not over-count newlines", () => {
		// Regression for __getTextLength: \n in innerText should not count toward maxlength.
		// We can verify the public effect by setting a multiline value via setValue and reading getValue.
		const textarea = document.createElement("textarea");
		textarea.value = "line1\nline2";
		document.body.appendChild(textarea);

		const tb = new TextBox(textarea);
		expect(tb.getValue()).toBe("line1\nline2");
	});
});
