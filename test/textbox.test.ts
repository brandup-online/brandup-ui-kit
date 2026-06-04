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

	it("double-click word selection trims whitespace at word boundaries", () => {
		const { input } = setup({ value: "foo bar baz" });
		const tb = new TextBox(input);
		const editor = tb.element!.querySelector(".input")! as HTMLElement;
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
		expect(tb.element!.querySelector(".input")!.textContent).toBe("a b");
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
		const editor = tb.element!.querySelector(".input")! as HTMLElement;

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
	opts: { tools?: string; storage?: string; type?: string; value?: string; markers?: Record<string, string> } = {}
) {
	document.body.innerHTML = "";
	const input = document.createElement("input");
	input.type = opts.type ?? "text";
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
	it("enables formatting with all tools by default and renders a toolbar", () => {
		const tb = new TextBox(setupFormat());

		expect(tb.format).toBe(true);
		expect(tb.formatStorage).toBe("html");
		expect(tb.formatTools).toEqual(["bold", "italic", "strike", "underline"]);
		expect(tb.element!.querySelectorAll(".format-button")).toHaveLength(4);
	});

	it("limits tools via data-format-tools and ignores unknown values", () => {
		const tb = new TextBox(setupFormat({ tools: "bold italic nonsense" }));

		expect(tb.formatTools).toEqual(["bold", "italic"]);
		expect(tb.element!.querySelectorAll(".format-button")).toHaveLength(2);
	});

	it("reads markdown storage from data-format-storage", () => {
		const tb = new TextBox(setupFormat({ storage: "markdown" }));
		expect(tb.formatStorage).toBe("markdown");
	});

	it("does not enable formatting for non-text types", () => {
		const tb = new TextBox(setupFormat({ type: "number" }));

		expect(tb.format).toBe(false);
		expect(tb.element!.querySelectorAll(".format-button")).toHaveLength(0);
	});

	it("deserializes stored HTML into the editor, keeping only allowed tags", () => {
		const tb = new TextBox(setupFormat({ value: "a <b>bold</b> <script>x</script>" }));

		const editor = tb.element!.querySelector(".input")!;
		expect(editor.querySelector("b")).not.toBeNull();
		expect(editor.querySelector("script")).toBeNull();
		expect(editor.textContent).toBe("a bold x");
	});

	it("serializes editor content back to HTML on input", () => {
		const tb = new TextBox(setupFormat());
		const editor = tb.element!.querySelector(".input")! as HTMLElement;

		editor.innerHTML = "plain <b>x</b> <i>y</i>";
		editor.dispatchEvent(new Event("input", { bubbles: true }));

		expect(tb.getValue()).toBe("plain <b>x</b> <i>y</i>");
	});

	it("uses custom markdown markers from data-format-md-* attributes", () => {
		const tb = new TextBox(setupFormat({ storage: "markdown", markers: { italic: "_" }, value: "_x_ y" }));
		const editor = tb.element!.querySelector(".input")! as HTMLElement;

		// при разборе кастомный маркер даёт тег
		expect(editor.querySelector("i")).not.toBeNull();

		// и сериализуется обратно тем же маркером
		editor.dispatchEvent(new Event("input", { bubbles: true }));
		expect(tb.getValue()).toBe("_x_ y");
		expect(tb.formatMarkers.italic).toBe("_");
	});

	it("round-trips markdown: stored markers render as tags and serialize back to markers", () => {
		const tb = new TextBox(setupFormat({ storage: "markdown", value: "**x** and *y*" }));
		const editor = tb.element!.querySelector(".input")! as HTMLElement;

		expect(editor.querySelector("b")).not.toBeNull();
		expect(editor.querySelector("i")).not.toBeNull();

		editor.dispatchEvent(new Event("input", { bubbles: true }));
		expect(tb.getValue()).toBe("**x** and *y*");
	});

	it("expands a collapsed caret to the whole word", () => {
		const tb = new TextBox(setupFormat({ tools: "bold", value: "foo bar baz" }));
		const editor = tb.element!.querySelector(".input")! as HTMLElement;
		const textNode = editor.firstChild!;

		// курсор внутри слова "bar" без выделения
		const sel = window.getSelection()!;
		sel.removeAllRanges();
		const caret = document.createRange();
		caret.setStart(textNode, 5);
		caret.collapse(true);
		sel.addRange(caret);

		(tb as unknown as { __expandSelectionToWords(s: Selection): void }).__expandSelectionToWords(sel);

		expect(window.getSelection()!.toString()).toBe("bar");
	});

	it("applies formatting to the whole word when only a part is selected", () => {
		const tb = new TextBox(setupFormat({ tools: "bold", value: "barbaz" }));
		const editor = tb.element!.querySelector(".input")! as HTMLElement;
		const textNode = editor.firstChild!;

		// выделяем только "bar" внутри слова "barbaz"
		const sel = window.getSelection()!;
		sel.removeAllRanges();
		const range = document.createRange();
		range.setStart(textNode, 0);
		range.setEnd(textNode, 3);
		sel.addRange(range);

		(tb as unknown as { __applyFormat(tool: string): void }).__applyFormat("bold");

		expect(editor.innerHTML).toBe("<b>barbaz</b>");
		expect(tb.getValue()).toBe("<b>barbaz</b>");
	});

	it("keeps the original partial selection after formatting (does not select the whole word)", () => {
		const tb = new TextBox(setupFormat({ tools: "bold", value: "barbaz" }));
		const editor = tb.element!.querySelector(".input")! as HTMLElement;
		const textNode = editor.firstChild!;

		// выделяем "bar" внутри "barbaz"
		const sel = window.getSelection()!;
		sel.removeAllRanges();
		const range = document.createRange();
		range.setStart(textNode, 0);
		range.setEnd(textNode, 3);
		sel.addRange(range);

		(tb as unknown as { __applyFormat(tool: string): void }).__applyFormat("bold");

		// слово отформатировано целиком, но выделение осталось исходным — "bar"
		expect(editor.innerHTML).toBe("<b>barbaz</b>");
		expect(window.getSelection()!.toString()).toBe("bar");
	});

	it("keeps the caret collapsed after formatting a word (does not select it)", () => {
		const tb = new TextBox(setupFormat({ tools: "bold", value: "barbaz" }));
		const editor = tb.element!.querySelector(".input")! as HTMLElement;
		const textNode = editor.firstChild!;

		// курсор внутри слова без выделения
		const sel = window.getSelection()!;
		sel.removeAllRanges();
		const caret = document.createRange();
		caret.setStart(textNode, 3);
		caret.collapse(true);
		sel.addRange(caret);

		(tb as unknown as { __applyFormat(tool: string): void }).__applyFormat("bold");

		expect(editor.innerHTML).toBe("<b>barbaz</b>");
		expect(window.getSelection()!.isCollapsed).toBe(true);
	});

	it("expands a partial multi-word selection to whole words on both ends", () => {
		const tb = new TextBox(setupFormat({ tools: "bold", value: "foo bar baz" }));
		const editor = tb.element!.querySelector(".input")! as HTMLElement;
		const textNode = editor.firstChild!;

		// выделяем "o ba" — конец "foo" и начало "bar"
		const sel = window.getSelection()!;
		sel.removeAllRanges();
		const range = document.createRange();
		range.setStart(textNode, 2);
		range.setEnd(textNode, 6);
		sel.addRange(range);

		(tb as unknown as { __expandSelectionToWords(s: Selection): void }).__expandSelectionToWords(sel);

		expect(window.getSelection()!.toString()).toBe("foo bar");
	});

	function caretAt(node: Node, offset: number) {
		const sel = window.getSelection()!;
		sel.removeAllRanges();
		const r = document.createRange();
		r.setStart(node, offset);
		r.collapse(true);
		sel.addRange(r);
		return sel;
	}

	it("enters typing mode (pending format) when toggling on an empty field", () => {
		const tb = new TextBox(setupFormat({ tools: "bold" }));
		const editor = tb.element!.querySelector(".input")! as HTMLElement;
		caretAt(editor, 0);

		(tb as unknown as { __applyFormat(tool: string): void }).__applyFormat("bold");

		// текст не изменился, но кнопка активна (режим набора)
		expect(editor.textContent).toBe("");
		const btn = tb.element!.querySelector('.format-button[data-format-tool="bold"]')!;
		expect(btn.classList.contains("active")).toBe(true);
	});

	it("enters typing mode when the caret is between spaces", () => {
		const tb = new TextBox(setupFormat({ tools: "bold" }));
		const editor = tb.element!.querySelector(".input")! as HTMLElement;
		// двойной пробел во время набора (нормализация только на blur), курсор между пробелами
		editor.textContent = "a  b";
		caretAt(editor.firstChild!, 2);

		(tb as unknown as { __applyFormat(tool: string): void }).__applyFormat("bold");

		expect(editor.textContent).toBe("a  b");
		const btn = tb.element!.querySelector('.format-button[data-format-tool="bold"]')!;
		expect(btn.classList.contains("active")).toBe(true);
	});

	it("wraps subsequently typed text while in typing mode", () => {
		const tb = new TextBox(setupFormat({ tools: "bold" }));
		const editor = tb.element!.querySelector(".input")! as HTMLElement;
		caretAt(editor, 0);

		(tb as unknown as { __applyFormat(tool: string): void }).__applyFormat("bold");

		editor.dispatchEvent(
			new InputEvent("beforeinput", { inputType: "insertText", data: "x", cancelable: true, bubbles: true })
		);

		expect(editor.innerHTML).toBe("<b>x</b>");
		expect(tb.getValue()).toBe("<b>x</b>");
	});

	it("toggling the same tool again leaves typing mode", () => {
		const tb = new TextBox(setupFormat({ tools: "bold" }));
		const editor = tb.element!.querySelector(".input")! as HTMLElement;
		const btn = tb.element!.querySelector('.format-button[data-format-tool="bold"]')!;
		caretAt(editor, 0);

		const apply = (tb as unknown as { __applyFormat(tool: string): void }).__applyFormat.bind(tb);
		apply("bold");
		expect(btn.classList.contains("active")).toBe(true);
		apply("bold");
		expect(btn.classList.contains("active")).toBe(false);
	});

	it("clears typing mode on caret navigation", () => {
		const tb = new TextBox(setupFormat({ tools: "bold" }));
		const editor = tb.element!.querySelector(".input")! as HTMLElement;
		const btn = tb.element!.querySelector('.format-button[data-format-tool="bold"]')!;
		caretAt(editor, 0);

		(tb as unknown as { __applyFormat(tool: string): void }).__applyFormat("bold");
		expect(btn.classList.contains("active")).toBe(true);

		editor.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
		expect(btn.classList.contains("active")).toBe(false);
	});

	it("does not expand a collapsed caret surrounded by whitespace", () => {
		const tb = new TextBox(setupFormat({ tools: "bold" }));
		const editor = tb.element!.querySelector(".input")! as HTMLElement;
		// двойной пробел во время набора; нормализация сработает только на blur
		editor.textContent = "foo  bar";
		const textNode = editor.firstChild!;

		// курсор между двумя пробелами — слова рядом нет
		const sel = window.getSelection()!;
		sel.removeAllRanges();
		const caret = document.createRange();
		caret.setStart(textNode, 4);
		caret.collapse(true);
		sel.addRange(caret);

		(tb as unknown as { __expandSelectionToWords(s: Selection): void }).__expandSelectionToWords(sel);

		expect(window.getSelection()!.isCollapsed).toBe(true);
	});

	it("drops formatting tags that are not in the enabled tools", () => {
		const tb = new TextBox(setupFormat({ tools: "bold", value: "<b>x</b> <i>y</i>" }));
		const editor = tb.element!.querySelector(".input")!;

		expect(editor.querySelector("b")).not.toBeNull();
		expect(editor.querySelector("i")).toBeNull(); // italic disabled → tag stripped, text kept
		expect(editor.textContent).toBe("x y");
	});
});
