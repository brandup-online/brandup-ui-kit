/**
 * @jest-environment jsdom
 */
import TextBox, { ROOT_CLASS } from "../npm/brandup-ui-textbox/source/textbox";

function setup(opts: { value?: string; required?: boolean; type?: string; maxlength?: number } = {}) {
	document.body.innerHTML = "";
	const form = document.createElement("form");
	const input = document.createElement("input");
	input.type = opts.type ?? "text";
	if (opts.value !== undefined) input.value = opts.value;
	if (opts.required) input.required = true;
	if (opts.maxlength) input.maxLength = opts.maxlength;
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
		expect(container.querySelector(".ui-richeditor")).not.toBeNull();
	});

	it("getValue() returns the trimmed underlying value", () => {
		const { input } = setup({ value: "  hello  " });
		const tb = new TextBox(input);
		expect(tb.getValue()).toBe("hello");
	});

	it("allows typing to replace a full selection at maxlength", () => {
		const { input } = setup({ value: "abcde", maxlength: 5 });
		const tb = new TextBox(input);
		const editable = tb.editor.editable;

		// выделяем весь текст — ввод символа заменит его, длина не вырастет
		const sel = window.getSelection()!;
		sel.removeAllRanges();
		const r = document.createRange();
		r.selectNodeContents(editable);
		sel.addRange(r);

		const e = new KeyboardEvent("keydown", { key: "x", cancelable: true, bubbles: true });
		editable.dispatchEvent(e);

		expect(e.defaultPrevented).toBe(false); // не отклонён — выделение будет заменено
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

		const editable = tb.element!.querySelector(".ui-richeditor")!;
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

	it("blocks input at maxlength and flashes the incorrect state", () => {
		document.body.innerHTML = "";
		const input = document.createElement("input");
		input.type = "text";
		input.maxLength = 3;
		input.value = "abc";
		document.body.appendChild(input);

		const tb = new TextBox(input);
		const editable = tb.element!.querySelector(".ui-richeditor") as HTMLElement;

		const e = new KeyboardEvent("keydown", { key: "x", cancelable: true, bubbles: true });
		editable.dispatchEvent(e);

		expect(e.defaultPrevented).toBe(true); // символ не вставлен
		expect(tb.element!.classList.contains("incorrect")).toBe(true);
	});

	it("double-click word selection trims whitespace at word boundaries", () => {
		const { input } = setup({ value: "foo bar baz" });
		const tb = new TextBox(input);
		const editor = tb.element!.querySelector(".ui-richeditor")! as HTMLElement;
		const textNode = editor.firstChild!;

		// имитируем выделение " bar " с пробелами по краям
		const range = document.createRange();
		range.setStart(textNode, 3);
		range.setEnd(textNode, 8);
		const sel = window.getSelection()!;
		sel.removeAllRanges();
		sel.addRange(range);

		editor.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));

		expect(window.getSelection()!.toString()).toBe("bar");
	});

	it("normalizes whitespace after initialization (collapse doubles, trim edges)", () => {
		const { input } = setup({ value: "  a   b  " });
		const tb = new TextBox(input);

		expect(tb.getValue()).toBe("a b");
		expect(tb.element!.querySelector(".ui-richeditor")!.textContent).toBe("a b");
	});

	it("normalizes whitespace on setValue", () => {
		const { input } = setup();
		const tb = new TextBox(input);

		tb.setValue("x    y");

		expect(tb.getValue()).toBe("x y");
	});

	it("normalizes whitespace on blur", () => {
		const { input } = setup();
		const tb = new TextBox(input);
		const editor = tb.element!.querySelector(".ui-richeditor")! as HTMLElement;

		editor.textContent = "a   b  ";
		editor.dispatchEvent(new FocusEvent("blur", { bubbles: true }));

		expect(editor.textContent).toBe("a b");
		expect(tb.getValue()).toBe("a b");
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

function setupFormat(
	opts: {
		tools?: string;
		storage?: string;
		type?: string;
		value?: string;
		markers?: Record<string, string>;
		maxlength?: number;
	} = {}
) {
	document.body.innerHTML = "";
	const input = document.createElement("input");
	input.type = opts.type ?? "text";
	if (opts.maxlength) input.maxLength = opts.maxlength;
	input.setAttribute("data-format", "");
	if (opts.tools !== undefined) input.setAttribute("data-format-tools", opts.tools);
	if (opts.storage !== undefined) input.setAttribute("data-format-storage", opts.storage);
	if (opts.markers)
		for (const [tool, marker] of Object.entries(opts.markers)) input.setAttribute(`data-format-md-${tool}`, marker);
	if (opts.value !== undefined) input.value = opts.value;
	document.body.appendChild(input);
	return input;
}

describe("TextBox formatting", () => {
	it("exposes formatting config from attributes", () => {
		const tb = new TextBox(setupFormat());
		expect(tb.format).toBe(true);
		expect(tb.formatStorage).toBe("html");
		expect(tb.formatTools).toEqual(["bold", "italic", "strike", "underline"]);
	});

	it("mounts the toolbar inside the textbox container on focus", () => {
		const tb = new TextBox(setupFormat({ tools: "bold italic" }));
		const editable = tb.element!.querySelector(".ui-richeditor") as HTMLElement;
		editable.dispatchEvent(new FocusEvent("focus"));

		const toolbar = tb.element!.querySelector(".ui-richeditor-toolbar")!;
		expect(toolbar.parentElement).toBe(tb.element); // в контейнере TextBox, не в body
		expect(toolbar.classList.contains("in-container")).toBe(true);
		expect(toolbar.querySelectorAll(".format-button")).toHaveLength(2);
	});

	it("limits tools via data-format-tools and ignores unknown values", () => {
		const tb = new TextBox(setupFormat({ tools: "bold italic nonsense" }));
		expect(tb.formatTools).toEqual(["bold", "italic"]);
	});

	it("reads markdown storage from data-format-storage", () => {
		const tb = new TextBox(setupFormat({ storage: "markdown" }));
		expect(tb.formatStorage).toBe("markdown");
	});

	it("does not enable formatting for non-text types", () => {
		const tb = new TextBox(setupFormat({ type: "number" }));
		const editable = tb.element!.querySelector(".ui-richeditor") as HTMLElement;
		editable.dispatchEvent(new FocusEvent("focus"));
		expect(tb.format).toBe(false);
		expect(document.querySelector(".ui-richeditor-toolbar.visible")).toBeNull();
	});

	it("deserializes stored HTML into the editor, keeping only allowed tags", () => {
		const tb = new TextBox(setupFormat({ value: "a <b>bold</b> <script>x</script>" }));
		const editor = tb.element!.querySelector(".ui-richeditor")!;
		expect(editor.querySelector("b")).not.toBeNull();
		expect(editor.querySelector("script")).toBeNull();
		expect(editor.textContent).toBe("a bold x");
	});

	it("serializes editor content back to the value on input", () => {
		const tb = new TextBox(setupFormat());
		const editor = tb.element!.querySelector(".ui-richeditor") as HTMLElement;
		editor.innerHTML = "plain <b>x</b> <i>y</i>";
		editor.dispatchEvent(new Event("input", { bubbles: true }));
		expect(tb.getValue()).toBe("plain <b>x</b> <i>y</i>");
	});

	it("uses custom markdown markers from data-format-md-* attributes", () => {
		const tb = new TextBox(setupFormat({ storage: "markdown", markers: { italic: "_" }, value: "_x_ y" }));
		const editor = tb.element!.querySelector(".ui-richeditor") as HTMLElement;
		expect(editor.querySelector("i")).not.toBeNull();
		editor.dispatchEvent(new Event("input", { bubbles: true }));
		expect(tb.getValue()).toBe("_x_ y");
		expect(tb.formatMarkers.italic).toBe("_");
	});

	it("drops formatting tags that are not in the enabled tools", () => {
		const tb = new TextBox(setupFormat({ tools: "bold", value: "<b>x</b> <i>y</i>" }));
		const editor = tb.element!.querySelector(".ui-richeditor")!;
		expect(editor.querySelector("b")).not.toBeNull();
		expect(editor.querySelector("i")).toBeNull();
		expect(editor.textContent).toBe("x y");
	});

	it("validate() counts visible text length, not the serialized value (format/html)", () => {
		const tb = new TextBox(setupFormat({ tools: "bold", maxlength: 6, value: "<b>hello</b>" }));

		expect(tb.editor.getLength()).toBe(5); // видимых символов 5
		expect(tb.getValue()).toBe("<b>hello</b>"); // сериализованное value длиннее (12)
		expect(tb.validate()).toBe(true); // 5 ≤ 6 — валидно по видимому тексту, а не по тегам
	});
});
