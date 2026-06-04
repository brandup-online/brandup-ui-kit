/**
 * @jest-environment jsdom
 */
import RichEditor, { ROOT_CLASS, EDITABLE_CLASS, TOOLBAR_CLASS } from "../npm/brandup-ui-richeditor/source/richeditor";

type Opts = ConstructorParameters<typeof RichEditor>[1];

function makeEditor(opts: Opts = {}) {
	document.body.innerHTML = "";
	const div = document.createElement("div");
	document.body.appendChild(div);
	return new RichEditor(div, { format: true, ...opts });
}

function selectRange(node: Node, start: number, end: number) {
	const sel = window.getSelection()!;
	sel.removeAllRanges();
	const r = document.createRange();
	r.setStart(node, start);
	r.setEnd(node, end);
	sel.addRange(r);
	return sel;
}

function caretAt(node: Node, offset: number) {
	const sel = window.getSelection()!;
	sel.removeAllRanges();
	const r = document.createRange();
	r.setStart(node, offset);
	r.collapse(true);
	sel.addRange(r);
	return sel;
}

const expandWords = (editor: RichEditor, sel: Selection) =>
	(editor as unknown as { __expandSelectionToWords(s: Selection): void }).__expandSelectionToWords(sel);

const toolbarButtons = () => document.querySelectorAll(`.${TOOLBAR_CLASS} .format-button`);
const toolbarButton = (tool: string) =>
	document.querySelector(`.${TOOLBAR_CLASS} .format-button[data-format-tool="${tool}"]`);

describe("RichEditor structure", () => {
	it("wraps the element and makes it editable", () => {
		const editor = makeEditor();
		expect(editor.element.classList.contains(ROOT_CLASS)).toBe(true);
		expect(editor.editable.classList.contains(EDITABLE_CLASS)).toBe(true);
		expect(editor.editable.contentEditable).toBe("true");
		expect(editor.element.contains(editor.editable)).toBe(true);
	});

	it("shows the shared toolbar (in body) with all tools on focus", () => {
		const editor = makeEditor();
		editor.editable.dispatchEvent(new FocusEvent("focus"));

		const toolbar = document.querySelector(`.${TOOLBAR_CLASS}`)!;
		expect(toolbar.parentElement).toBe(document.body);
		expect(editor.formatTools).toEqual(["bold", "italic", "strike", "underline"]);
		expect(toolbarButtons()).toHaveLength(4);
	});

	it("rebuilds the toolbar with only the editor's tools on focus", () => {
		const editor = makeEditor({ tools: ["bold", "italic"] });
		editor.editable.dispatchEvent(new FocusEvent("focus"));
		expect(toolbarButtons()).toHaveLength(2);
	});

	it("does not show the toolbar without format", () => {
		const editor = makeEditor({ format: false });
		editor.editable.dispatchEvent(new FocusEvent("focus"));
		expect(editor.format).toBe(false);
		expect(document.querySelector(`.${TOOLBAR_CLASS}.visible`)).toBeNull();
	});

	it("destroy() unwraps the element and keeps it in the DOM", () => {
		const editor = makeEditor();
		const editable = editor.editable;
		const wrapper = editor.element;

		editor.destroy();

		expect(wrapper.isConnected).toBe(false);
		expect(editable.isConnected).toBe(true);
		expect(editable.classList.contains(EDITABLE_CLASS)).toBe(false);
	});
});

describe("RichEditor value", () => {
	it("plain mode round-trips text via get/set", () => {
		const editor = makeEditor({ format: false });
		editor.setValue("hello");
		expect(editor.getValue()).toBe("hello");
	});

	it("setValue does not inject HTML in plain mode (XSS)", () => {
		const editor = makeEditor({ format: false });
		editor.setValue("<img src=x onerror=alert(1)>");
		expect(editor.editable.querySelector("img")).toBeNull();
		expect(editor.editable.textContent).toBe("<img src=x onerror=alert(1)>");
	});

	it("fires change on setValue", () => {
		const editor = makeEditor({ format: false });
		const handler = jest.fn();
		editor.onChange(handler);
		editor.setValue("typed");
		expect(handler).toHaveBeenCalledWith(expect.objectContaining({ value: "typed" }));
	});

	it("deserializes stored HTML keeping only allowed tags", () => {
		const editor = makeEditor({ value: "a <b>bold</b> <script>x</script>" });
		expect(editor.editable.querySelector("b")).not.toBeNull();
		expect(editor.editable.querySelector("script")).toBeNull();
		expect(editor.editable.textContent).toBe("a bold x");
	});

	it("serializes editor content back to HTML on input", () => {
		const editor = makeEditor();
		editor.editable.innerHTML = "plain <b>x</b> <i>y</i>";
		editor.editable.dispatchEvent(new Event("input", { bubbles: true }));
		expect(editor.getValue()).toBe("plain <b>x</b> <i>y</i>");
	});

	it("uses custom markdown markers", () => {
		const editor = makeEditor({ storage: "markdown", markers: { italic: "_" }, value: "_x_ y" });
		expect(editor.editable.querySelector("i")).not.toBeNull();
		editor.editable.dispatchEvent(new Event("input", { bubbles: true }));
		expect(editor.getValue()).toBe("_x_ y");
	});

	it("normalizes whitespace on initialization", () => {
		const editor = makeEditor({ format: false, value: "  a   b  " });
		expect(editor.getValue()).toBe("a b");
		expect(editor.editable.textContent).toBe("a b");
	});
});

describe("RichEditor formatting", () => {
	it("applies a format to the whole word when only a part is selected", () => {
		const editor = makeEditor({ tools: ["bold"], value: "barbaz" });
		selectRange(editor.editable.firstChild!, 0, 3);
		editor.applyFormat("bold");
		expect(editor.editable.innerHTML).toBe("<b>barbaz</b>");
		expect(editor.getValue()).toBe("<b>barbaz</b>");
	});

	it("keeps the original partial selection after formatting", () => {
		const editor = makeEditor({ tools: ["bold"], value: "barbaz" });
		selectRange(editor.editable.firstChild!, 0, 3);
		editor.applyFormat("bold");
		expect(window.getSelection()!.toString()).toBe("bar");
	});

	it("expands a collapsed caret to the whole word", () => {
		const editor = makeEditor({ tools: ["bold"], value: "foo bar baz" });
		caretAt(editor.editable.firstChild!, 5);
		expandWords(editor, window.getSelection()!);
		expect(window.getSelection()!.toString()).toBe("bar");
	});

	it("toggles formatting off when reapplied", () => {
		const editor = makeEditor({ tools: ["bold"], value: "barbaz" });
		selectRange(editor.editable.firstChild!, 0, 3);
		editor.applyFormat("bold");
		expect(editor.editable.innerHTML).toBe("<b>barbaz</b>");
		selectRange(editor.editable.querySelector("b")!.firstChild!, 0, 3);
		editor.applyFormat("bold");
		expect(editor.editable.innerHTML).toBe("barbaz");
	});

	it("drops formatting tags that are not in the enabled tools", () => {
		const editor = makeEditor({ tools: ["bold"], value: "<b>x</b> <i>y</i>" });
		expect(editor.editable.querySelector("b")).not.toBeNull();
		expect(editor.editable.querySelector("i")).toBeNull();
		expect(editor.editable.textContent).toBe("x y");
	});

	it("enters typing mode on an empty field and wraps typed text", () => {
		const editor = makeEditor({ tools: ["bold"] });
		editor.editable.dispatchEvent(new FocusEvent("focus")); // показываем тулбар
		caretAt(editor.editable, 0);
		editor.applyFormat("bold");

		expect(toolbarButton("bold")!.classList.contains("active")).toBe(true);

		editor.editable.dispatchEvent(
			new InputEvent("beforeinput", { inputType: "insertText", data: "x", cancelable: true, bubbles: true })
		);
		expect(editor.editable.innerHTML).toBe("<b>x</b>");
	});

	it("applies formatting via a shared toolbar button click", () => {
		const editor = makeEditor({ tools: ["bold"], value: "barbaz" });
		editor.editable.dispatchEvent(new FocusEvent("focus")); // активный редактор + тулбар
		selectRange(editor.editable.firstChild!, 0, 3);

		(toolbarButton("bold") as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));

		expect(editor.editable.innerHTML).toBe("<b>barbaz</b>");
	});
});
