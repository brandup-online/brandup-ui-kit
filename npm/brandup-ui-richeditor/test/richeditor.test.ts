/**
 * @jest-environment jsdom
 */
import RichEditor, { ROOT_CLASS, TOOLBAR_CLASS } from "../source/richeditor";
import { expandRangeToWords } from "../source/editing";
import { selectionCharBounds } from "../source/selection";

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
	expandRangeToWords(editor.editable, sel.getRangeAt(0)).toString();

function selectAll(editor: RichEditor) {
	const sel = window.getSelection()!;
	sel.removeAllRanges();
	const r = document.createRange();
	r.selectNodeContents(editor.editable);
	sel.addRange(r);
	return sel;
}

const toolbarButtons = () => document.querySelectorAll(`.${TOOLBAR_CLASS} .format-button`);
const toolbarButton = (tool: string) =>
	document.querySelector(`.${TOOLBAR_CLASS} .format-button[data-format-tool="${tool}"]`);
const actionButtons = () => document.querySelectorAll(`.${TOOLBAR_CLASS} .action-button`);
const actionButton = (action: string) =>
	document.querySelector<HTMLButtonElement>(`.${TOOLBAR_CLASS} .action-button[data-editor-action="${action}"]`);

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

	// содержимое заменено целиком — прежняя каретка к нему не относится
	it("puts the caret at the end of the new value when it was inside the editor", () => {
		const editor = makeEditor({ value: "old text" });
		caretAt(editor.editable.firstChild!, 3);

		editor.setValue("brand new value");

		const sel = window.getSelection()!;
		expect(selectionCharBounds(editor.editable, sel.getRangeAt(0))).toEqual([15, 15]);
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

	it("removes empty paragraphs on blur (multiline)", () => {
		const editor = makeEditor({ multiline: true });
		// пустые абзацы в начале/конце и между содержимым
		editor.editable.innerHTML = "<p><br></p><p>a</p><p><br></p><p><br></p><p>b</p><p><br></p>";

		editor.editable.dispatchEvent(new FocusEvent("blur"));

		expect(editor.editable.innerHTML).toBe("<p>a</p><p>b</p>");
		expect(editor.getValue()).toBe("<p>a</p><p>b</p>");
	});

	// Присваивание Text.data схлопывает живые Range в начало узла, поэтому нормализация,
	// которой нечего менять, обязана не трогать текстовые узлы вовсе.
	it("keeps the caret in place when normalization changes nothing", () => {
		const editor = makeEditor({ value: "one two three" });
		const text = editor.editable.firstChild as Text;
		caretAt(text, 6); // внутри "two"

		editor.editable.dispatchEvent(new FocusEvent("blur"));

		const sel = window.getSelection()!;
		expect(sel.anchorNode).toBe(text);
		expect(sel.anchorOffset).toBe(6);
	});

	it("moves the caret with the text when normalization collapses a space", () => {
		const editor = makeEditor({ value: "one two three" });
		const text = editor.editable.firstChild as Text;
		text.data = "one  two three"; // лишний пробел, как после набора
		caretAt(text, 12); // начало "three"

		editor.editable.dispatchEvent(new FocusEvent("blur"));

		const sel = window.getSelection()!;
		expect(editor.editable.textContent).toBe("one two three");
		// смещение уменьшилось ровно на один схлопнутый пробел — каретка осталась у "three"
		expect(sel.anchorOffset).toBe(11);
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

	it("expands a collapsed caret to the whole word without moving the selection", () => {
		const editor = makeEditor({ tools: ["bold"], value: "foo bar baz" });
		caretAt(editor.editable.firstChild!, 5);

		expect(expandWords(editor, window.getSelection()!)).toBe("bar");
		expect(window.getSelection()!.toString()).toBe(""); // расширение не трогает каретку
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

	it("soft break at the end of a paragraph shows a new line on the first press", () => {
		const editor = makeEditor({ format: false, multiline: true, value: "abcd" });
		caretAt(editor.editable.querySelector("p")!.firstChild!, 4); // конец абзаца

		editor.editable.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, cancelable: true, bubbles: true })
		);

		// реальный <br> + <br>-заполнитель (без него новая строка не видна), пустого текст-узла нет
		expect(editor.editable.innerHTML).toBe("<p>abcd<br><br></p>");
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

describe("RichEditor paste (formatted)", () => {
	// в jsdom нет полноценного ClipboardEvent — подкладываем clipboardData вручную
	const paste = (editor: RichEditor, { html = "", plain = "" }: { html?: string; plain?: string }) => {
		const e = new Event("paste", { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown };
		e.clipboardData = { getData: (type: string) => (type === "text/html" ? html : plain) };
		editor.editable.dispatchEvent(e);
		return e;
	};

	it("multiline: preserves <p> paragraphs and formatting, splitting the current paragraph", () => {
		const editor = makeEditor({ tools: ["bold", "italic"], multiline: true, value: "foobar" });
		caretAt(editor.editable.querySelector("p")!.firstChild!, 3); // между foo|bar

		paste(editor, { html: "<p><b>A</b></p><p><i>B</i></p>", plain: "A\nB" });

		// первый абзац влит в текущий, второй — новый <p>, хвост "bar" — в конец вставки
		expect(editor.editable.innerHTML).toBe("<p>foo<b>A</b></p><p><i>B</i>bar</p>");
		expect(editor.getValue()).toBe("<p>foo<b>A</b></p><p><i>B</i>bar</p>");
	});

	it("multiline: single pasted paragraph stays inline in the current paragraph", () => {
		const editor = makeEditor({ tools: ["bold"], multiline: true, value: "foobar" });
		caretAt(editor.editable.querySelector("p")!.firstChild!, 3);

		paste(editor, { html: "<p><b>X</b></p>", plain: "X" });

		expect(editor.editable.innerHTML).toBe("<p>foo<b>X</b>bar</p>");
	});

	it("single-line: flattens paragraphs to inline with spaces, keeps formatting", () => {
		const editor = makeEditor({ tools: ["bold"], value: "foo" });
		caretAt(editor.editable.firstChild!, 3); // конец foo

		paste(editor, { html: "<p><b>A</b></p><p>B</p>", plain: "A\nB" });

		expect(editor.editable.innerHTML).toBe("foo<b>A</b> B");
	});

	it("sanitizes junk and drops disabled tools", () => {
		const editor = makeEditor({ tools: ["bold"], multiline: true });
		caretAt(editor.editable, 0);

		paste(editor, {
			html: "<style>p{color:red}</style><p><b>A</b><i>B</i><span>C</span></p>",
			plain: "ABC",
		});

		// style вырезан, <i>/<span> развёрнуты (i отключён), <b> сохранён
		expect(editor.editable.innerHTML).toBe("<p><b>A</b>BC</p>");
	});

	it("drops empty leading/trailing paragraphs and collapses whitespace from the clipboard", () => {
		const editor = makeEditor({ tools: ["bold"], multiline: true });
		caretAt(editor.editable, 0);

		// типичный мусор браузера: пустые краевые блоки и переводы строк/отступы между тегами
		paste(editor, {
			html: "<p><br></p>\n  <p>  <b>A</b>\n  B  </p>\n<p><br></p>",
			plain: "A B",
		});

		expect(editor.editable.innerHTML).toBe("<p><b>A</b> B</p>"); // без пустых строк вокруг
	});

	it("falls back to plain text when there is no HTML", () => {
		const editor = makeEditor({ tools: ["bold"], multiline: true, value: "foo" });
		caretAt(editor.editable.querySelector("p")!.firstChild!, 3);

		paste(editor, { plain: "bar" });

		expect(editor.editable.textContent).toBe("foobar");
		expect(editor.editable.querySelector("b")).toBeNull();
	});

	it("rejects via filterPaste (null) and inserts nothing", () => {
		const onReject = jest.fn();
		const editor = makeEditor({
			tools: ["bold"],
			multiline: true,
			value: "foo",
			filterPaste: () => null,
			onReject,
		});
		caretAt(editor.editable.querySelector("p")!.firstChild!, 3);

		paste(editor, { html: "<p><b>A</b></p>", plain: "A" });

		expect(onReject).toHaveBeenCalled();
		expect(editor.editable.textContent).toBe("foo");
	});

	it("falls back to plain when filterPaste transforms the text (e.g. maxLength)", () => {
		const editor = makeEditor({
			tools: ["bold"],
			multiline: true,
			filterPaste: (t) => t.slice(0, 2), // обрезка по длине
		});
		caretAt(editor.editable, 0);

		paste(editor, { html: "<p><b>ABCD</b></p>", plain: "ABCD" });

		// форматирование не сохраняем — вставлен очищенный текст без <b>
		expect(editor.editable.textContent).toBe("AB");
		expect(editor.editable.querySelector("b")).toBeNull();
	});
});

describe("RichEditor history (undo/redo)", () => {
	// триггер undo/redo — на keydown (браузер диспатчит historyUndo/Redo в beforeinput только
	// при непустом нативном стеке, которого у нас нет, т.к. нативную отмену мы гасим)
	const undo = (editor: RichEditor, opts: KeyboardEventInit = {}) => {
		const e = new KeyboardEvent("keydown", { key: "z", ctrlKey: true, cancelable: true, bubbles: true, ...opts });
		editor.editable.dispatchEvent(e);
		return e;
	};
	const redoCtrlY = (editor: RichEditor) =>
		editor.editable.dispatchEvent(
			new KeyboardEvent("keydown", { key: "y", ctrlKey: true, cancelable: true, bubbles: true })
		);
	const redoShiftZ = (editor: RichEditor) =>
		editor.editable.dispatchEvent(
			new KeyboardEvent("keydown", { key: "z", ctrlKey: true, shiftKey: true, cancelable: true, bubbles: true })
		);

	it("undoes and redoes a formatting action (Ctrl+Z / Ctrl+Y)", () => {
		const editor = makeEditor({ tools: ["bold"], value: "barbaz" });
		selectRange(editor.editable.firstChild!, 0, 3);
		editor.applyFormat("bold");
		expect(editor.editable.innerHTML).toBe("<b>barbaz</b>");

		const e = undo(editor);
		expect(e.defaultPrevented).toBe(true);
		expect(editor.editable.innerHTML).toBe("barbaz"); // формат снят

		redoCtrlY(editor);
		expect(editor.editable.innerHTML).toBe("<b>barbaz</b>"); // формат возвращён
	});

	it("redoes with Ctrl+Shift+Z as well", () => {
		const editor = makeEditor({ tools: ["bold"], value: "barbaz" });
		selectRange(editor.editable.firstChild!, 0, 3);
		editor.applyFormat("bold");

		undo(editor);
		redoShiftZ(editor);
		expect(editor.editable.innerHTML).toBe("<b>barbaz</b>");
	});

	it("works on a non-Latin layout via e.code (Cyrillic: key='я'/'н', code='KeyZ'/'KeyY')", () => {
		const editor = makeEditor({ tools: ["bold"], value: "barbaz" });
		selectRange(editor.editable.firstChild!, 0, 3);
		editor.applyFormat("bold");

		// кириллическая раскладка: физическая Z даёт key="я", но code="KeyZ"
		editor.editable.dispatchEvent(
			new KeyboardEvent("keydown", { key: "я", code: "KeyZ", ctrlKey: true, cancelable: true, bubbles: true })
		);
		expect(editor.editable.innerHTML).toBe("barbaz");

		// физическая Y даёт key="н", code="KeyY"
		editor.editable.dispatchEvent(
			new KeyboardEvent("keydown", { key: "н", code: "KeyY", ctrlKey: true, cancelable: true, bubbles: true })
		);
		expect(editor.editable.innerHTML).toBe("<b>barbaz</b>");
	});

	it("applies a formatting hotkey on a non-Latin layout (Ctrl+B as key='и', code='KeyB')", () => {
		const editor = makeEditor({ tools: ["bold"], value: "barbaz" });
		selectRange(editor.editable.firstChild!, 0, 3);

		editor.editable.dispatchEvent(
			new KeyboardEvent("keydown", { key: "и", code: "KeyB", ctrlKey: true, cancelable: true, bubbles: true })
		);
		expect(editor.editable.innerHTML).toBe("<b>barbaz</b>");
	});

	it("clears the redo stack after a new action", () => {
		const editor = makeEditor({ tools: ["bold", "italic"], value: "barbaz" });
		selectRange(editor.editable.firstChild!, 0, 3);
		editor.applyFormat("bold");

		undo(editor); // откатили жирный → "barbaz"
		selectRange(editor.editable.firstChild!, 0, 3);
		editor.applyFormat("italic"); // новое действие — redo должен очиститься
		expect(editor.editable.innerHTML).toBe("<i>barbaz</i>");

		redoCtrlY(editor); // повторять нечего
		expect(editor.editable.innerHTML).toBe("<i>barbaz</i>");
	});

	it("undo emits a change event", () => {
		const editor = makeEditor({ tools: ["bold"], value: "barbaz" });
		const onChange = jest.fn();
		editor.onChange(onChange);

		selectRange(editor.editable.firstChild!, 0, 3);
		editor.applyFormat("bold");
		onChange.mockClear();

		undo(editor);
		expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ value: "barbaz" }));
	});

	it("suppresses native history via beforeinput without a second undo", () => {
		const editor = makeEditor({ tools: ["bold"], value: "barbaz" });
		selectRange(editor.editable.firstChild!, 0, 3);
		editor.applyFormat("bold");
		undo(editor); // keydown выполнил отмену → "barbaz"

		// нативный historyUndo (если бы пришёл) гасится, но повторно НЕ откатывает
		const e = new InputEvent("beforeinput", { inputType: "historyUndo", cancelable: true, bubbles: true });
		editor.editable.dispatchEvent(e);
		expect(e.defaultPrevented).toBe(true);
		expect(editor.editable.innerHTML).toBe("barbaz"); // без второго отката
	});

	it("does not intercept history without formatting", () => {
		const editor = makeEditor({ format: false, value: "abc" });
		const e = undo(editor);

		expect(e.defaultPrevented).toBe(false); // не перехватываем — отдаём браузеру
		expect(editor.editable.textContent).toBe("abc");
	});
});

describe("RichEditor clear formatting", () => {
	it("clears all formatting within the selection", () => {
		const editor = makeEditor({ value: "<b>bold</b> <i>italic</i> plain" });
		selectAll(editor);

		editor.clearFormat();

		expect(editor.editable.innerHTML).toBe("bold italic plain");
		expect(editor.getValue()).toBe("bold italic plain");
	});

	it("clears formatting of the whole word under a collapsed caret", () => {
		const editor = makeEditor({ value: "<b>bold</b> plain" });
		caretAt(editor.editable.querySelector("b")!.firstChild!, 2);

		editor.clearFormat();

		expect(editor.editable.innerHTML).toBe("bold plain");
	});

	it("keeps formatting outside the selection", () => {
		const editor = makeEditor({ multiline: true, value: "<p><b>one</b></p><p><b>two</b></p>" });
		const second = editor.editable.querySelectorAll("b")[1]!;
		selectRange(second.firstChild!, 0, 3);

		editor.clearFormat();

		expect(editor.editable.innerHTML).toBe("<p><b>one</b></p><p>two</p>");
	});

	it("removes synonym tags brought in by pasted/stored HTML", () => {
		const editor = makeEditor({ value: "<b>x</b> y" });
		editor.editable.innerHTML = "<strong>x</strong> <em>y</em>"; // синонимы канонических тегов
		selectAll(editor);

		editor.clearFormat();

		expect(editor.editable.innerHTML).toBe("x y");
	});

	it("does nothing (and records no history step) when there is nothing to clear", () => {
		const editor = makeEditor({ value: "plain text" });
		selectAll(editor);

		editor.clearFormat();

		expect(editor.canUndo).toBe(false);
		expect(editor.editable.innerHTML).toBe("plain text");
	});

	// Вызов из кода (кнопка на странице, а не в тулбаре) уводит фокус из редактора, и клик
	// приходит уже после blur. Нормализация на blur не должна двигать каретку — иначе очистка
	// срабатывает не на том слове, где стоял курсор.
	it("clears the word under the caret even when the editor lost focus first", () => {
		const editor = makeEditor({ value: "<b>one two</b>" });
		caretAt(editor.editable.querySelector("b")!.firstChild!, 6); // внутри "two"

		editor.editable.dispatchEvent(new FocusEvent("blur"));
		editor.clearFormat();

		expect(editor.editable.innerHTML).toBe("<b>one </b>two");
	});

	// Хост возвращает фокус в редактор после вызова метода — каретка должна остаться там,
	// где стояла, а не уехать в конец текста.
	it("keeps the caret where it was when focus is returned after the call", () => {
		const editor = makeEditor({ value: "<b>one two</b> three" });
		caretAt(editor.editable.querySelector("b")!.firstChild!, 6); // внутри "two"

		editor.editable.dispatchEvent(new FocusEvent("blur"));
		editor.clearFormat();
		editor.editable.dispatchEvent(new FocusEvent("focus")); // editor.focus() из кода хоста

		const sel = window.getSelection()!;
		const bounds = selectionCharBounds(editor.editable, sel.getRangeAt(0));
		expect(bounds).toEqual([6, 6]); // там же, внутри "two", а не в конце текста (13)
	});

	it("keeps the caret put when there is nothing to clear", () => {
		const editor = makeEditor({ value: "plain word" });
		caretAt(editor.editable.firstChild!, 2); // внутри неформатированного слова

		editor.clearFormat();

		// раньше слово оставалось выделенным расширением, хотя очистка не сработала
		expect(window.getSelection()!.toString()).toBe("");
	});

	it("keeps the original partial selection after clearing", () => {
		const editor = makeEditor({ value: "<b>barbaz</b>" });
		selectRange(editor.editable.querySelector("b")!.firstChild!, 0, 3);

		editor.clearFormat();

		expect(editor.editable.innerHTML).toBe("barbaz");
		expect(window.getSelection()!.toString()).toBe("bar");
	});

	it("erase stays available when the caret sits inside a formatted word", () => {
		const editor = makeEditor({ actions: ["erase"], value: "<b>bold</b> tail" });
		caretAt(editor.editable.querySelector("b")!.firstChild!, 2);

		// предикат кнопки смотрит на ту же цель, что возьмёт clearFormat
		expect(editor.isActionEnabled("erase")).toBe(true);

		editor.clearFormat();
		expect(editor.editable.innerHTML).toBe("bold tail");
	});

	it("erase is unavailable on a plain word", () => {
		const editor = makeEditor({ actions: ["erase"], value: "<b>bold</b> tail" });
		caretAt(editor.editable.lastChild!, 3); // внутри «tail»

		expect(editor.isActionEnabled("erase")).toBe(false);
	});

	it("clearAllFormat() strips formatting without a selection", () => {
		const editor = makeEditor({ value: "<b>a</b> <i>b</i>" });
		window.getSelection()!.removeAllRanges();

		editor.clearAllFormat();

		expect(editor.editable.innerHTML).toBe("a b");
		expect(editor.getValue()).toBe("a b");
	});

	it("clearing is undoable and emits a change", () => {
		const editor = makeEditor({ value: "<b>bold</b> text" });
		const onChange = jest.fn();
		editor.onChange(onChange);
		selectAll(editor);

		editor.clearFormat();
		expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ value: "bold text" }));

		editor.undo();
		expect(editor.editable.innerHTML).toBe("<b>bold</b> text");
	});

	it("exits typing mode when clearing", () => {
		const editor = makeEditor({ tools: ["bold"] });
		editor.editable.dispatchEvent(new FocusEvent("focus"));
		caretAt(editor.editable, 0);
		editor.applyFormat("bold"); // режим набора
		expect(editor.isToolActive("bold")).toBe(true);

		editor.clearFormat();

		expect(editor.isToolActive("bold")).toBe(false);
	});

	it("does not clear formatting in readonly", () => {
		const editor = makeEditor({ readonly: true });
		editor.editable.innerHTML = "<b>bold</b>"; // разметка проставлена хостом мимо deserialize
		selectAll(editor);

		editor.clearFormat();
		editor.clearAllFormat();

		expect(editor.editable.innerHTML).toBe("<b>bold</b>");
	});
});

describe("RichEditor undo/redo API", () => {
	it("undo()/redo() revert and replay a formatting operation", () => {
		const editor = makeEditor({ tools: ["bold"], value: "barbaz" });
		selectRange(editor.editable.firstChild!, 0, 3);
		editor.applyFormat("bold");
		expect(editor.editable.innerHTML).toBe("<b>barbaz</b>");

		editor.undo();
		expect(editor.editable.innerHTML).toBe("barbaz");

		editor.redo();
		expect(editor.editable.innerHTML).toBe("<b>barbaz</b>");
	});

	it("reports canUndo/canRedo", () => {
		const editor = makeEditor({ tools: ["bold"], value: "barbaz" });
		expect(editor.canUndo).toBe(false);
		expect(editor.canRedo).toBe(false);

		selectRange(editor.editable.firstChild!, 0, 3);
		editor.applyFormat("bold");
		expect(editor.canUndo).toBe(true);
		expect(editor.canRedo).toBe(false);

		editor.undo();
		expect(editor.canUndo).toBe(false);
		expect(editor.canRedo).toBe(true);
	});

	it("has no history without formatting", () => {
		const editor = makeEditor({ format: false, value: "abc" });
		expect(editor.canUndo).toBe(false);

		editor.undo(); // не должно падать
		expect(editor.editable.textContent).toBe("abc");
	});
});

describe("RichEditor toolbar actions", () => {
	it("adds no action buttons by default", () => {
		const editor = makeEditor();
		editor.editable.dispatchEvent(new FocusEvent("focus"));

		expect(editor.editorActions).toHaveLength(0);
		expect(actionButtons()).toHaveLength(0);
		expect(toolbarButtons()).toHaveLength(4);
	});

	it("renders requested action buttons after a separator", () => {
		const editor = makeEditor({ tools: ["bold"], actions: ["erase", "undo", "redo"] });
		editor.editable.dispatchEvent(new FocusEvent("focus"));

		expect(actionButtons()).toHaveLength(3);
		expect(document.querySelector(`.${TOOLBAR_CLASS} .split`)).not.toBeNull();
	});

	it("shows the toolbar with actions only (no format tools)", () => {
		const editor = makeEditor({ tools: [], actions: ["undo", "redo"] });
		editor.editable.dispatchEvent(new FocusEvent("focus"));

		expect(document.querySelector(`.${TOOLBAR_CLASS}.visible`)).not.toBeNull();
		expect(actionButtons()).toHaveLength(2);
	});

	it("disables undo/redo/erase while there is nothing to do", () => {
		const editor = makeEditor({ tools: ["bold"], actions: ["erase", "undo", "redo"], value: "barbaz" });
		editor.editable.dispatchEvent(new FocusEvent("focus"));
		caretAt(editor.editable.firstChild!, 0);

		expect(actionButton("undo")!.disabled).toBe(true);
		expect(actionButton("redo")!.disabled).toBe(true);
		expect(actionButton("erase")!.disabled).toBe(true);
	});

	it("enables undo and erase after a formatting operation", () => {
		const editor = makeEditor({ tools: ["bold"], actions: ["erase", "undo", "redo"], value: "barbaz" });
		editor.editable.dispatchEvent(new FocusEvent("focus"));

		selectRange(editor.editable.firstChild!, 0, 3);
		editor.applyFormat("bold");

		expect(actionButton("undo")!.disabled).toBe(false);
		expect(actionButton("erase")!.disabled).toBe(false);
		expect(actionButton("redo")!.disabled).toBe(true);
	});

	it("runs the action on button click", () => {
		const editor = makeEditor({ tools: ["bold"], actions: ["erase", "undo"], value: "barbaz" });
		editor.editable.dispatchEvent(new FocusEvent("focus"));
		selectRange(editor.editable.firstChild!, 0, 3);
		editor.applyFormat("bold");

		actionButton("undo")!.click();
		expect(editor.editable.innerHTML).toBe("barbaz");
	});

	it("ignores actions that are not enabled for the editor", () => {
		const editor = makeEditor({ tools: ["bold"], actions: ["undo"], value: "<b>bold</b>" });
		selectAll(editor);

		editor.applyAction("erase"); // не входит в actions

		expect(editor.editable.innerHTML).toBe("<b>bold</b>");
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
