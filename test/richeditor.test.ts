/**
 * @jest-environment jsdom
 */
import RichEditor, { ROOT_CLASS, TOOLBAR_CLASS } from "../npm/brandup-ui-richeditor/source/richeditor";

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
	it("makes the passed element itself the editable (no wrapper)", () => {
		const editor = makeEditor();
		expect(editor.editable).toBe(editor.element); // элемент и редактор объединены
		expect(editor.element.classList.contains(ROOT_CLASS)).toBe(true);
		expect(editor.editable.contentEditable).toBe("true");
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

	it("mounts the toolbar inside a provided container (.in-container)", () => {
		document.body.innerHTML = "";
		const container = document.createElement("div");
		const div = document.createElement("div");
		container.appendChild(div);
		document.body.appendChild(container);

		const editor = new RichEditor(div, { format: true, tools: ["bold"], toolbarContainer: container });
		editor.editable.dispatchEvent(new FocusEvent("focus"));

		const toolbar = container.querySelector(`.${TOOLBAR_CLASS}`)!;
		expect(toolbar.parentElement).toBe(container);
		expect(toolbar.classList.contains("in-container")).toBe(true);
	});

	it("does not show the toolbar without format", () => {
		const editor = makeEditor({ format: false });
		editor.editable.dispatchEvent(new FocusEvent("focus"));
		expect(editor.format).toBe(false);
		expect(document.querySelector(`.${TOOLBAR_CLASS}.visible`)).toBeNull();
	});

	it("destroy() keeps the host element in the DOM and strips editor styling", () => {
		const editor = makeEditor();
		const editable = editor.editable;

		editor.destroy();

		expect(editable.isConnected).toBe(true);
		expect(editable.classList.contains(ROOT_CLASS)).toBe(false);
		expect(editable.getAttribute("contenteditable")).toBeNull();
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

describe("RichEditor paragraphs (multiline)", () => {
	it("renders the value as <p> paragraphs", () => {
		const editor = makeEditor({ format: false, multiline: true, value: "ab\n\ncd" });
		expect(editor.editable.innerHTML).toBe("<p>ab</p><p>cd</p>");
		expect(editor.getValue()).toBe("ab\n\ncd");
	});

	it("Enter splits the current paragraph into a new <p>", () => {
		const editor = makeEditor({ format: false, multiline: true, value: "abcd" });
		caretAt(editor.editable.querySelector("p")!.firstChild!, 2);

		editor.editable.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true, bubbles: true }));

		expect(editor.editable.innerHTML).toBe("<p>ab</p><p>cd</p>");
		expect(editor.getValue()).toBe("ab\n\ncd");
	});

	it("Enter on an empty editor creates a new line on the first press", () => {
		const editor = makeEditor({ format: false, multiline: true });
		caretAt(editor.editable, 0);

		editor.editable.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true, bubbles: true }));

		expect(editor.editable.innerHTML).toBe("<p><br></p><p><br></p>");
	});

	it("Enter with the caret at editor level appends a new paragraph (first press)", () => {
		const editor = makeEditor({ format: false, multiline: true, value: "abcd" });
		caretAt(editor.editable, 1); // на уровне редактора, после <p>

		editor.editable.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true, bubbles: true }));

		expect(editor.editable.innerHTML).toBe("<p>abcd</p><p><br></p>");
	});

	it("Enter at the end of a paragraph adds an empty <p> with placeholder and moves the caret", () => {
		const editor = makeEditor({ format: false, multiline: true, value: "abcd" });
		caretAt(editor.editable.querySelector("p")!.firstChild!, 4); // конец "abcd"

		editor.editable.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true, bubbles: true }));

		expect(editor.editable.innerHTML).toBe("<p>abcd</p><p><br></p>"); // есть <br>, абзац не пустой <p></p>
		const paras = editor.editable.querySelectorAll("p");
		expect(window.getSelection()!.anchorNode).toBe(paras[1]); // каретка в новом абзаце (с первого раза)
	});

	it("Ctrl+Enter inserts a soft <br> within the paragraph", () => {
		const editor = makeEditor({ format: false, multiline: true, value: "abcd" });
		caretAt(editor.editable.querySelector("p")!.firstChild!, 2);

		editor.editable.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, cancelable: true, bubbles: true })
		);

		expect(editor.editable.innerHTML).toBe("<p>ab<br>cd</p>");
		expect(editor.getValue()).toBe("ab\ncd");
	});

	it("Shift+Enter inserts a soft <br> within the paragraph", () => {
		const editor = makeEditor({ format: false, multiline: true, value: "abcd" });
		caretAt(editor.editable.querySelector("p")!.firstChild!, 2);

		editor.editable.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, cancelable: true, bubbles: true })
		);

		expect(editor.editable.innerHTML).toBe("<p>ab<br>cd</p>");
		expect(editor.getValue()).toBe("ab\ncd");
	});

	it("removes the placeholder <br> once a paragraph has text (input)", () => {
		const editor = makeEditor({ format: false, multiline: true });
		editor.editable.innerHTML = "<p>a<br></p>"; // как после ввода первого символа в пустой абзац
		editor.editable.dispatchEvent(new Event("input", { bubbles: true }));
		expect(editor.editable.innerHTML).toBe("<p>a</p>");
	});

	it("keeps the caret after the typed character through normalization", () => {
		const editor = makeEditor({ format: false, multiline: true });
		editor.editable.innerHTML = "<p>a<br></p>"; // символ + <br>-заполнитель
		const sel = window.getSelection()!;
		sel.removeAllRanges();
		const r = document.createRange();
		r.setStart(editor.editable.querySelector("p")!.firstChild!, 1);
		r.collapse(true);
		sel.addRange(r);

		editor.editable.dispatchEvent(new Event("input", { bubbles: true }));

		expect(editor.editable.innerHTML).toBe("<p>a</p>");
		// каретка осталась после "a" (а не сброшена в начало — иначе ввод шёл бы в обратном порядке)
		expect(sel.anchorNode).toBe(editor.editable.querySelector("p")!.firstChild);
		expect(sel.anchorOffset).toBe(1);
	});

	it("keeps inner soft breaks when stripping edge placeholders", () => {
		const editor = makeEditor({ format: false, multiline: true });
		editor.editable.innerHTML = "<p>a<br>b<br></p>";
		editor.editable.dispatchEvent(new Event("input", { bubbles: true }));
		expect(editor.editable.innerHTML).toBe("<p>a<br>b</p>");
	});

	it("Enter does not split in single-line mode (calls onEnter)", () => {
		const onEnter = jest.fn();
		const editor = makeEditor({ format: false, multiline: false, value: "ab", onEnter });
		caretAt(editor.editable.firstChild!, 1);

		editor.editable.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true, bubbles: true }));

		expect(onEnter).toHaveBeenCalled();
		expect(editor.editable.querySelector("p")).toBeNull(); // без абзацев
	});
});

describe("RichEditor readonly", () => {
	it("blocks any editing via beforeinput", () => {
		const editor = makeEditor({ readonly: true, value: "abc" });
		expect(editor.readonly).toBe(true);

		const e = new InputEvent("beforeinput", {
			inputType: "insertText",
			data: "x",
			cancelable: true,
			bubbles: true,
		});
		editor.editable.dispatchEvent(e);

		expect(e.defaultPrevented).toBe(true);
		expect(editor.getValue()).toBe("abc");
	});

	it("does not enable formatting or show a toolbar in readonly", () => {
		const editor = makeEditor({ readonly: true });
		editor.editable.dispatchEvent(new FocusEvent("focus"));

		expect(editor.formatTools).toHaveLength(0);
		expect(document.querySelector(`.${TOOLBAR_CLASS}.visible`)).toBeNull();
	});

	it("stays selectable/copyable (contenteditable remains)", () => {
		const editor = makeEditor({ readonly: true, value: "abc" });
		expect(editor.editable.contentEditable).toBe("true");
		expect(editor.editable.classList.contains("readonly")).toBe(true);
	});
});
