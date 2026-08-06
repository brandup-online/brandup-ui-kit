/**
 * @jest-environment jsdom
 */
import { PopupManager } from "@brandup/ui-kit";
import RichEditor, { ROOT_CLASS, TOOLBAR_CLASS } from "../source/richeditor";
import { EMOJI_PICKER_CLASS } from "../source/emoji";
import { EMOJIS, EMOJI_GROUPS } from "../source/emoji";
import { ALL_FORMAT_TOOLS } from "../source/format-config";
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
// инструменты, у которых есть кнопка: спойлер пока скрыт (см. HIDDEN_TOOLS в ../source/toolbar)
const VISIBLE_TOOLS = ALL_FORMAT_TOOLS.length - 1;
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
		expect(editor.formatTools).toEqual(ALL_FORMAT_TOOLS);
		// часть кнопок временно скрыта (см. HIDDEN_TOOLS в ../source/toolbar)
		expect(toolbarButtons()).toHaveLength(VISIBLE_TOOLS);
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

	// Правила разбора markdown строгие (граница слова, без пробелов по краям), поэтому то,
	// что редактор сохранил, обязано разобраться обратно — иначе значение теряет форматирование
	// при следующем открытии.
	it.each([
		["один два три", 5, 8, "**два**"],
		["один два три", 0, 4, "**один**"],
		["один два три", 9, 12, "**три**"],
		["слово, ещё", 0, 5, "**слово,**"],
		["(в скобках)", 1, 3, "**(в скобках)**"],
		["цена 100 руб", 5, 8, "**100**"],
		["из-за угла", 0, 5, "**из-за**"],
	])("markdown round-trips formatting of %j", (text, from, to, expected) => {
		const editor = makeEditor({ storage: "markdown", value: text });
		selectRange(editor.editable.firstChild!, from as number, to as number);
		editor.applyFormat("bold");

		const html = editor.editable.innerHTML;
		const markdown = editor.getValue();
		expect(markdown).toContain(expected);

		const reopened = makeEditor({ storage: "markdown", value: markdown });
		expect(reopened.editable.innerHTML).toBe(html);
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

		// последний остаётся местом для каретки, но в значение не идёт
		expect(editor.editable.innerHTML).toBe("<p>a</p><p>b</p><p><br></p>");
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

describe("RichEditor selection access", () => {
	it("exposes the selection only while it sits inside the editor", () => {
		const editor = makeEditor({ value: "abc" });
		caretAt(editor.editable.firstChild!, 1);
		expect(editor.selection).not.toBeNull();

		// выделение ушло за пределы редактора — для хоста его как будто нет
		const outside = document.createElement("div");
		outside.textContent = "снаружи";
		document.body.appendChild(outside);
		caretAt(outside.firstChild!, 1);

		expect(editor.selection).toBeNull();
	});

	// хост показывает своё окно, выделение за это время может уйти — узел никуда не делся
	it("selectNode() selects a node regardless of where the selection was", () => {
		const editor = makeEditor({ tools: ["bold"], value: "раз <b>два</b> три" });
		const bold = editor.editable.querySelector("b")!;

		const outside = document.createElement("div");
		outside.textContent = "снаружи";
		document.body.appendChild(outside);
		caretAt(outside.firstChild!, 1);

		editor.selectNode(bold);

		expect(editor.selection!.toString()).toBe("два");

		// следующая вставка заменяет выделенное целиком
		editor.insertText("ДВА");
		expect(editor.editable.textContent).toBe("раз ДВА три");
	});

	it("selectNode() ignores a node outside the editor", () => {
		const editor = makeEditor({ value: "abc" });
		const outside = document.createElement("div");
		outside.textContent = "снаружи";
		document.body.appendChild(outside);

		editor.selectNode(outside);

		expect(editor.selection).toBeNull();
	});
});

describe("RichEditor host buttons", () => {
	const hostButton = () =>
		document.querySelector<HTMLButtonElement>(`.${TOOLBAR_CLASS} [data-toolbar-button="ping"]`);

	// кнопки хоста не про форматирование — панель нужна и когда своих инструментов нет вовсе
	it("shows the toolbar for host buttons alone, without formatting", () => {
		const run = jest.fn();
		const editor = makeEditor({ format: false, buttons: [{ name: "ping", title: "Ping", icon: "<svg/>", run }] });

		editor.editable.dispatchEvent(new FocusEvent("focus"));

		expect(document.querySelector(`.${TOOLBAR_CLASS}.visible`)).not.toBeNull();
		expect(editor.formatTools).toHaveLength(0);

		hostButton()!.click();
		expect(run).toHaveBeenCalled();
	});

	it("keeps host buttons out of a readonly editor", () => {
		const editor = makeEditor({
			readonly: true,
			buttons: [{ name: "ping", title: "Ping", icon: "<svg/>", run: jest.fn() }],
		});

		editor.editable.dispatchEvent(new FocusEvent("focus"));

		expect(editor.toolbarButtons).toHaveLength(0);
		expect(document.querySelector(`.${TOOLBAR_CLASS}.visible`)).toBeNull();
	});
});

describe("RichEditor toolbar actions", () => {
	it("adds no action buttons by default", () => {
		const editor = makeEditor();
		editor.editable.dispatchEvent(new FocusEvent("focus"));

		expect(editor.editorActions).toHaveLength(0);
		expect(actionButtons()).toHaveLength(0);
		expect(toolbarButtons()).toHaveLength(VISIBLE_TOOLS);
	});

	// инструменты, блоки и действия — одна группа: всё это правка оформления
	it("renders requested action buttons without a separator", () => {
		const editor = makeEditor({ tools: ["bold"], actions: ["erase", "undo", "redo"] });
		editor.editable.dispatchEvent(new FocusEvent("focus"));

		expect(actionButtons()).toHaveLength(3);
		expect(document.querySelector(`.${TOOLBAR_CLASS} .split`)).toBeNull();
	});

	// а кнопки хоста — про другое: их отбивает разделитель
	it("separates the host buttons", () => {
		const editor = makeEditor({
			tools: ["bold"],
			actions: ["erase"],
			buttons: [{ name: "own", title: "Своя", icon: "", run: () => undefined }],
		});
		editor.editable.dispatchEvent(new FocusEvent("focus"));

		const split = document.querySelector(`.${TOOLBAR_CLASS} .split`);

		expect(split).not.toBeNull();
		expect(split!.nextElementSibling).toBe(document.querySelector(`.${TOOLBAR_CLASS} .host-button`));
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

	// disabled-кнопка событий не получает, и клик по ней приходит на сам тулбар (там же
	// оказывается клик по фону между кнопками). Не погасить его — редактор потеряет фокус,
	// а blur спрячет панель прямо под курсором.
	it("does not take focus when the click lands on the toolbar itself", () => {
		const editor = makeEditor({ tools: ["bold"], actions: ["erase", "undo"], value: "barbaz" });
		editor.editable.dispatchEvent(new FocusEvent("focus"));
		caretAt(editor.editable.firstChild!, 0);

		expect(actionButton("undo")!.disabled).toBe(true);

		const toolbar = document.querySelector<HTMLElement>(`.${TOOLBAR_CLASS}`)!;
		const e = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
		toolbar.dispatchEvent(e);

		expect(e.defaultPrevented).toBe(true);
	});

	it("ignores actions that are not enabled for the editor", () => {
		const editor = makeEditor({ tools: ["bold"], actions: ["undo"], value: "<b>bold</b>" });
		selectAll(editor);

		editor.applyAction("erase"); // не входит в actions

		expect(editor.editable.innerHTML).toBe("<b>bold</b>");
	});
});

describe("RichEditor paragraph mode", () => {
	const pressEnter = (editor: RichEditor, offset: number, shift = false) => {
		const paragraph = editor.editable.querySelector("p")!;
		caretAt(paragraph.firstChild!, offset);
		editor.editable.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Enter", shiftKey: shift, bubbles: true, cancelable: true })
		);
	};

	it("block (default): Enter starts a new paragraph", () => {
		const editor = makeEditor({ multiline: true, storage: "markdown", value: "раз" });
		expect(editor.paragraph).toBe("block");

		pressEnter(editor, 3);
		editor.insertText("два");

		expect(editor.editable.querySelectorAll("p")).toHaveLength(2);
		expect(editor.getValue()).toBe("раз\n\nдва");
	});

	// в мессенджерах Enter переносит строку, а абзац набирается двумя переносами
	it("break: Enter makes a soft line break", () => {
		const editor = makeEditor({ multiline: true, storage: "markdown", paragraph: "break", value: "раз" });

		pressEnter(editor, 3);
		editor.insertText("два");

		expect(editor.editable.querySelectorAll("p")).toHaveLength(1);
		expect(editor.getValue()).toBe("раз\nдва");
	});

	// Модификатор в этом режиме ничего не меняет: отдельный абзац дал бы в значении ту же пустую
	// строку, что и второй перенос, — только она получалась бы с одного нажатия.
	it("break: the modifier breaks the line too", () => {
		const editor = makeEditor({ multiline: true, storage: "markdown", paragraph: "break", value: "раз" });

		pressEnter(editor, 3, true);
		editor.insertText("два");

		expect(editor.editable.querySelectorAll("p")).toHaveLength(1);
		expect(editor.getValue()).toBe("раз\nдва");
	});

	it("break: an empty line takes two presses", () => {
		const editor = makeEditor({ multiline: true, storage: "markdown", paragraph: "break", value: "раз" });

		pressEnter(editor, 3);
		// второе нажатие — с того места, где осталась каретка
		editor.editable.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
		editor.insertText("два");

		expect(editor.getValue()).toBe("раз\n\nдва");
	});
});

describe("RichEditor emoji picker", () => {
	const picker = () => document.querySelector<HTMLElement>(`.${EMOJI_PICKER_CLASS}`);
	const emojiButtons = () => document.querySelectorAll<HTMLButtonElement>(`.${EMOJI_PICKER_CLASS} .emoji`);

	afterEach(() => PopupManager.close());

	it("adds an emoji action button and builds the picker on first open", () => {
		const editor = makeEditor({ tools: ["bold"], actions: ["emoji"], value: "abc" });
		editor.editable.dispatchEvent(new FocusEvent("focus"));

		expect(actionButton("emoji")).not.toBeNull();
		expect(picker()).toBeNull(); // ~700 кнопок собираются только при первом открытии

		actionButton("emoji")!.click();

		expect(picker()).not.toBeNull();
		expect(emojiButtons().length).toBe(EMOJIS.length);

		// оформление полосы прокрутки — общий класс кита, а не своё правило
		expect(picker()!.querySelector(".emoji-list")!.classList.contains("ui-scrollable")).toBe(true);

		// смайлики разложены по группам: каждая отбивается линией и рисуется по мере прокрутки
		const groups = document.querySelectorAll(`.${EMOJI_PICKER_CLASS} .emoji-group`);
		expect(groups).toHaveLength(EMOJI_GROUPS.length);
		expect(Array.from(groups).map((g) => g.querySelectorAll(".emoji").length)).toEqual(
			EMOJI_GROUPS.map((group) => group.emojis.length)
		);
	});

	// набор перекладывали по группам скриптом — символы не должны потеряться или задвоиться
	it("keeps every emoji exactly once across the groups", () => {
		const fromGroups = EMOJI_GROUPS.flatMap((group) => group.emojis);

		expect(fromGroups).toEqual(EMOJIS);
		expect(new Set(EMOJIS).size).toBe(EMOJIS.length);
		expect(EMOJI_GROUPS.every((group) => group.title && group.emojis.length)).toBe(true);
	});

	// PopupManager вешает слушатель закрытия на body внутри open(), то есть во время того же
	// клика: без остановки всплытия он получил бы его и сразу закрыл панель.
	it("stays open after the click that opened it", () => {
		const editor = makeEditor({ tools: ["bold"], actions: ["emoji"], value: "abc" });
		editor.editable.dispatchEvent(new FocusEvent("focus"));

		actionButton("emoji")!.click();

		expect(picker()!.classList.contains("opened")).toBe(true);
	});

	it("closes on a second click of the same button", () => {
		const editor = makeEditor({ tools: ["bold"], actions: ["emoji"], value: "abc" });
		editor.editable.dispatchEvent(new FocusEvent("focus"));

		actionButton("emoji")!.click();
		actionButton("emoji")!.click();

		expect(picker()!.classList.contains("opened")).toBe(false);
	});

	it("inserts the picked emoji at the caret and closes", () => {
		const editor = makeEditor({ tools: ["bold"], actions: ["emoji"], value: "abc" });
		editor.editable.dispatchEvent(new FocusEvent("focus"));
		caretAt(editor.editable.firstChild!, 1);

		actionButton("emoji")!.click();
		emojiButtons()[0].click();

		expect(editor.editable.textContent).toBe(`a${EMOJIS[0]}bc`);
		expect(picker()!.classList.contains("opened")).toBe(false);
	});

	// вставка кнопкой — тот же ввод, что и с клавиатуры: хост ограничивает его через filterChar
	// (в TextBox это maxlength и тип поля), иначе панель обходит эти ограничения
	it("respects filterChar and reports a rejected insert", () => {
		const onReject = jest.fn();
		const editor = makeEditor({
			tools: ["bold"],
			actions: ["emoji"],
			value: "abc",
			filterChar: () => false, // как при достигнутом лимите длины
			onReject,
		});
		editor.editable.dispatchEvent(new FocusEvent("focus"));
		caretAt(editor.editable.firstChild!, 3);

		actionButton("emoji")!.click();
		emojiButtons()[0].click();

		expect(editor.editable.textContent).toBe("abc");
		expect(onReject).toHaveBeenCalled();
	});

	it("keeps the editor focus: the button and the picker suppress mousedown", () => {
		const editor = makeEditor({ tools: ["bold"], actions: ["emoji"], value: "abc" });
		editor.editable.dispatchEvent(new FocusEvent("focus"));
		actionButton("emoji")!.click();

		const onButton = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
		actionButton("emoji")!.dispatchEvent(onButton);
		const onEmoji = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
		emojiButtons()[0].dispatchEvent(onEmoji);

		expect(onButton.defaultPrevented).toBe(true);
		expect(onEmoji.defaultPrevented).toBe(true);
	});

	// тулбар прячется на blur, вместе с ним пропадает и панель — состояние попапа должно совпасть
	it("closes when the toolbar detaches", () => {
		const editor = makeEditor({ tools: ["bold"], actions: ["emoji"], value: "abc" });
		editor.editable.dispatchEvent(new FocusEvent("focus"));
		actionButton("emoji")!.click();
		expect(picker()!.classList.contains("opened")).toBe(true);

		editor.editable.dispatchEvent(new FocusEvent("blur"));

		expect(picker()!.classList.contains("opened")).toBe(false);
		expect(PopupManager.isOpened()).toBe(false);
	});

	it("survives a toolbar rebuild for another editor", () => {
		const first = makeEditor({ tools: ["bold"], actions: ["emoji"], value: "abc" });
		first.editable.dispatchEvent(new FocusEvent("focus"));
		first.editable.dispatchEvent(new FocusEvent("blur"));

		// другой состав кнопок — тулбар пересобирается, панель не должна потеряться
		const second = makeEditor({ tools: ["bold", "italic"], actions: ["emoji", "undo"], value: "abc" });
		second.editable.dispatchEvent(new FocusEvent("focus"));
		caretAt(second.editable.firstChild!, 3);

		actionButton("emoji")!.click();

		expect(picker()!.parentElement).toBe(document.querySelector(`.${TOOLBAR_CLASS}`));
		expect(emojiButtons().length).toBe(EMOJIS.length);
	});

	// панель одна на все редакторы и живёт до конца страницы: пока она помнит уничтоженный
	// редактор, тот не собирается сборщиком мусора, а выбранный символ уходит в мёртвое поле
	it("forgets a destroyed editor instead of inserting into it", () => {
		const editor = makeEditor({ tools: ["bold"], actions: ["emoji"], value: "abc" });
		editor.editable.dispatchEvent(new FocusEvent("focus"));
		caretAt(editor.editable.firstChild!, 3);
		actionButton("emoji")!.click();

		editor.destroy();
		emojiButtons()[0].click();

		expect(editor.editable.textContent).toBe("abc");
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

	// Переключать разметку нечем — кнопок нет. Но объявленный набор остаётся: им разбирается
	// и сохраняется значение, а показывать разметку редактор обязан и здесь.
	it("offers no tools and no toolbar in readonly", () => {
		const editor = makeEditor({ readonly: true });
		editor.editable.dispatchEvent(new FocusEvent("focus"));

		expect(editor.formatTools).toHaveLength(0);
		expect(editor.formatTypes).toEqual(ALL_FORMAT_TOOLS);
		expect(document.querySelector(`.${TOOLBAR_CLASS}.visible`)).toBeNull();
	});

	// Иначе редактор для чтения показывал бы вместо жирного сырые звёздочки — то есть не то,
	// что увидит читатель сообщения.
	it.each([
		["markdown", "**жирный** текст"],
		["html", "<b>жирный</b> текст"],
	])("shows the formatting of the value in readonly (%s)", (storage, value) => {
		const editor = makeEditor({ readonly: true, storage: storage as "markdown" | "html", value });

		expect(editor.editable.querySelector("b")).not.toBeNull();
		expect(editor.editable.textContent).toBe("жирный текст");
		expect(editor.getValue()).toBe(value); // и обратно ровно тем же
	});

	// Ограничение набора действует и в readonly: разбирается объявленное, остальное — текст
	it("keeps the declared set narrow in readonly", () => {
		const editor = makeEditor({
			readonly: true,
			tools: ["bold"],
			storage: "markdown",
			value: "**жирный** и _курсив_",
		});

		expect(editor.formatTypes).toEqual(["bold"]);
		expect(editor.editable.querySelector("b")).not.toBeNull();
		expect(editor.editable.querySelector("i")).toBeNull();
		expect(editor.getValue()).toBe("**жирный** и _курсив_");
	});

	// без форматирования вовсе разбирать нечего — значение остаётся текстом
	it("parses no formatting without format", () => {
		const editor = makeEditor({ format: false, readonly: true, storage: "markdown", value: "**жирный**" });

		expect(editor.formatTypes).toHaveLength(0);
		expect(editor.editable.querySelector("b")).toBeNull();
		expect(editor.getValue()).toBe("**жирный**");
	});

	it("stays selectable/copyable (contenteditable remains)", () => {
		const editor = makeEditor({ readonly: true, value: "abc" });
		expect(editor.editable.contentEditable).toBe("true");
		expect(editor.editable.classList.contains("readonly")).toBe(true);
	});

	it("does not add a paragraph on Enter (block mode)", () => {
		const editor = makeEditor({ readonly: true, multiline: true, value: "hello" });
		caretAt(editor.editable.querySelector("p")!.firstChild!, 5);

		editor.editable.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

		expect(editor.editable.innerHTML).toBe("<p>hello</p>");
		expect(editor.getValue()).toBe("<p>hello</p>");
	});

	it("does not add a soft break on Enter (break mode)", () => {
		const editor = makeEditor({
			readonly: true,
			multiline: true,
			paragraph: "break",
			storage: "markdown",
			value: "hi",
		});
		caretAt(editor.editable.querySelector("p")!.firstChild!, 2);

		editor.editable.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

		expect(editor.editable.innerHTML).toBe("<p>hi</p>");
		expect(editor.getValue()).toBe("hi");
	});
});

describe("RichEditor change notification", () => {
	beforeEach(() => jest.useFakeTimers());
	afterEach(() => jest.useRealTimers());

	const type = (editor: RichEditor, text: string) => {
		editor.editable.textContent = text;
		editor.editable.dispatchEvent(new Event("input", { bubbles: true }));
	};

	it("defers the event while typing but keeps getValue() accurate", () => {
		const editor = makeEditor({ value: "a" });
		const handler = jest.fn();
		editor.onChange(handler);

		type(editor, "ab");

		expect(handler).not.toHaveBeenCalled();
		expect(editor.getValue()).toBe("ab"); // значение считается по DOM и точно всегда

		jest.advanceTimersByTime(150);
		expect(handler).toHaveBeenCalledTimes(1);
		expect(handler).toHaveBeenCalledWith(expect.objectContaining({ value: "ab" }));
	});

	// троттлинг, а не debounce: непрерывный набор не откладывает доставку до паузы
	it("collapses a burst of input into one notification per window", () => {
		const editor = makeEditor({ value: "" });
		const handler = jest.fn();
		editor.onChange(handler);

		type(editor, "a");
		type(editor, "ab");
		type(editor, "abc");
		expect(handler).not.toHaveBeenCalled();

		jest.advanceTimersByTime(150);
		expect(handler).toHaveBeenCalledTimes(1);
		expect(handler).toHaveBeenCalledWith(expect.objectContaining({ value: "abc" }));
	});

	it("flushChange() delivers at once and leaves nothing to fire later", () => {
		const editor = makeEditor({ value: "" });
		const handler = jest.fn();
		editor.onChange(handler);

		type(editor, "abc");
		editor.flushChange();

		expect(handler).toHaveBeenCalledTimes(1);

		jest.advanceTimersByTime(500);
		expect(handler).toHaveBeenCalledTimes(1); // повторного события нет
	});

	it("flushChange() does nothing when there is nothing deferred", () => {
		const editor = makeEditor({ value: "abc" });
		const handler = jest.fn();
		editor.onChange(handler);

		editor.flushChange();

		expect(handler).not.toHaveBeenCalled();
	});

	it("flushes on blur without waiting for the timer", () => {
		const editor = makeEditor({ value: "" });
		const handler = jest.fn();
		editor.onChange(handler);

		type(editor, "abc");
		editor.editable.dispatchEvent(new FocusEvent("blur"));

		expect(handler).toHaveBeenCalledTimes(1);
		expect(handler).toHaveBeenCalledWith(expect.objectContaining({ value: "abc" }));
	});

	it("flushes on destroy", () => {
		const editor = makeEditor({ value: "" });
		const handler = jest.fn();
		editor.onChange(handler);

		type(editor, "abc");
		editor.destroy();

		expect(handler).toHaveBeenCalledWith(expect.objectContaining({ value: "abc" }));
	});

	// разовые правки не посимвольные — их откладывать незачем
	it("reports discrete edits synchronously", () => {
		const editor = makeEditor({ value: "слово" });
		const handler = jest.fn();
		editor.onChange(handler);

		selectAll(editor);
		editor.applyFormat("bold");
		expect(handler).toHaveBeenCalledTimes(1);

		editor.undo();
		expect(handler).toHaveBeenCalledTimes(2);

		editor.setValue("другое");
		expect(handler).toHaveBeenCalledTimes(3);
	});
});

describe("RichEditor paste (plain text)", () => {
	const pastePlain = (editor: RichEditor, plain: string) => {
		const e = new Event("paste", { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown };
		e.clipboardData = { getData: (type: string) => (type === "text/plain" ? plain : "") };
		editor.editable.dispatchEvent(e);
	};

	it("multiline: wraps pasted text into paragraphs, never leaves bare text in the root", () => {
		const editor = makeEditor({ multiline: true, storage: "markdown" });
		caretAt(editor.editable, 0);

		pastePlain(editor, "one\n\ntwo");

		// каждая строка внутри <p> — модель абзацев не должна ломаться на простой вставке
		expect(editor.editable.innerHTML).toBe("<p>one</p><p>two</p>");
		expect(editor.getValue()).toBe("one\n\ntwo");
	});

	it("multiline: a single line break stays a soft break inside one paragraph", () => {
		const editor = makeEditor({ multiline: true, storage: "markdown" });
		caretAt(editor.editable, 0);

		pastePlain(editor, "one\ntwo");

		expect(editor.editable.innerHTML).toBe("<p>one<br>two</p>");
		expect(editor.getValue()).toBe("one\ntwo");
	});

	it("break mode: every line break is soft, paragraphs are not created", () => {
		const editor = makeEditor({ multiline: true, paragraph: "break", storage: "markdown" });
		caretAt(editor.editable, 0);

		pastePlain(editor, "one\n\ntwo");

		expect(editor.editable.innerHTML).toBe("<p>one<br><br>two</p>");
		expect(editor.getValue()).toBe("one\n\ntwo");
	});

	it("multiline: splits the current paragraph and keeps the tail after the pasted text", () => {
		const editor = makeEditor({ multiline: true, storage: "markdown", value: "foobar" });
		caretAt(editor.editable.querySelector("p")!.firstChild!, 3);

		pastePlain(editor, "A\n\nB");

		expect(editor.editable.innerHTML).toBe("<p>fooA</p><p>Bbar</p>");
	});

	// в block-режиме одни переносы не дают ни одного абзаца — вставлять нечего, и тогда
	// нельзя ни удалять выделение, ни писать шаг истории
	it("multiline: leaves content untouched when there is nothing to insert", () => {
		const editor = makeEditor({ multiline: true, storage: "markdown", value: "abcdef" });
		const handler = jest.fn();
		editor.onChange(handler);

		const text = editor.editable.querySelector("p")!.firstChild!;
		const sel = window.getSelection()!;
		sel.removeAllRanges();
		const r = document.createRange();
		r.setStart(text, 1);
		r.setEnd(text, 4);
		sel.addRange(r);

		pastePlain(editor, "\n\n");

		expect(editor.editable.innerHTML).toBe("<p>abcdef</p>");
		expect(handler).not.toHaveBeenCalled();
		expect(editor.canUndo).toBe(false);
	});

	it("single-line: joins lines with spaces and leaves the caret after the pasted text", () => {
		const editor = makeEditor({ value: "foobar" });
		caretAt(editor.editable.firstChild!, 3);

		pastePlain(editor, "A\nB");

		expect(editor.editable.textContent).toBe("fooA Bbar");
		expect(selectionCharBounds(editor.editable, window.getSelection()!.getRangeAt(0))).toEqual([6, 6]);
	});
});

describe("RichEditor host character filter", () => {
	it("rejects composition/replacement input that bypasses keydown", () => {
		const rejected: string[] = [];
		const editor = makeEditor({
			filterChar: (char) => /[0-9]/.test(char),
			onReject: () => rejected.push("x"),
			value: "12",
		});
		caretAt(editor.editable.firstChild!, 2);

		for (const inputType of ["insertCompositionText", "insertReplacementText"]) {
			const e = new InputEvent("beforeinput", { inputType, data: "ab", cancelable: true, bubbles: true });
			editor.editable.dispatchEvent(e);

			expect(e.defaultPrevented).toBe(true);
		}

		expect(rejected).toHaveLength(2);
		expect(editor.getValue()).toBe("12");
	});

	it("lets allowed characters through the same path", () => {
		const editor = makeEditor({ filterChar: (char) => /[0-9]/.test(char), value: "12" });
		caretAt(editor.editable.firstChild!, 2);

		const e = new InputEvent("beforeinput", {
			inputType: "insertReplacementText",
			data: "34",
			cancelable: true,
			bubbles: true,
		});
		editor.editable.dispatchEvent(e);

		expect(e.defaultPrevented).toBe(false);
	});
});

// Протяжка по странице не должна затягивать содержимое редактора. Правится выделяемость,
// а не само выделение: оно в документе одно, и когда протяжка идёт мимо редактора, оба её конца
// снаружи — середину из одного диапазона не вырезать. jsdom про user-select ничего не знает,
// поэтому проверяем то, чем управляем: класс на время чужой протяжки.
describe("RichEditor selection isolation", () => {
	function withNeighbour() {
		document.body.innerHTML = "";
		const outside = document.createElement("p");
		outside.textContent = "текст страницы";
		const div = document.createElement("div");
		div.tabIndex = 0; // иначе jsdom не отдаёт фокус голому div, а он нужен одному из случаев
		document.body.append(outside, div);

		return { editor: new RichEditor(div, { format: true, multiline: true, value: "внутри" }), outside };
	}

	const unselectable = (editor: RichEditor) => editor.editable.classList.contains("unselectable");
	const press = (target: Node) => target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

	const release = () => document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

	it("makes the content unselectable while a drag started outside is going on", () => {
		const { editor, outside } = withNeighbour();

		press(outside);
		expect(unselectable(editor)).toBe(true);

		release();
		expect(unselectable(editor)).toBe(false);
	});

	// Диапазон остаётся протянутым через редактор и после отпускания кнопки: вернуть содержимому
	// выделяемость — значит тут же его выделить, будто запрета и не было.
	it("keeps the hold while the finished selection still runs across the editor", () => {
		const { editor, outside } = withNeighbour();
		const after = document.createElement("p");
		after.textContent = "текст ниже";
		document.body.appendChild(after);

		press(outside);
		const selection = window.getSelection()!;
		selection.removeAllRanges();
		selection.setBaseAndExtent(outside.firstChild!, 0, after.firstChild!, 10);

		release();
		expect(unselectable(editor)).toBe(true);

		// следующая протяжка мимо редактора — держать больше нечего
		press(outside);
		selection.collapse(after.firstChild!, 0);
		release();
		expect(unselectable(editor)).toBe(false);
	});

	// запрет держится до следующего нажатия, но в поле заходят и клавишей, и из кода —
	// иначе оно осталось бы нередактируемым
	it("drops the hold as soon as the editor takes the focus", () => {
		const { editor, outside } = withNeighbour();

		press(outside);
		expect(unselectable(editor)).toBe(true);

		editor.editable.dispatchEvent(new FocusEvent("focus"));

		expect(unselectable(editor)).toBe(false);
	});

	// нажатие по панели или кнопке хоста приходит мимо редактора, но выделение страницы тут ни при чём:
	// запрет лишил бы поле редактируемости до следующего клика внутрь
	it("does not hold while the editor itself is at work", () => {
		const { editor, outside } = withNeighbour();
		editor.editable.focus();

		press(outside);

		expect(unselectable(editor)).toBe(false);
	});

	// Слово по двойному нажатию браузер выделяет прямо на жесте, а мышиные события приходят уже
	// после него — у долгого нажатия не приходят вовсе. Запрет, снятый по ним, жест бы не дождался
	// и выделять отказался: содержимое к этому моменту невыделяемо.
	it("drops the hold on a touch inside, before any mouse event", () => {
		const { editor, outside } = withNeighbour();

		press(outside);
		expect(unselectable(editor)).toBe(true);

		editor.editable.querySelector("p")!.firstChild!.dispatchEvent(new Event("touchstart", { bubbles: true }));

		expect(unselectable(editor)).toBe(false);
	});

	// Протяжки выделения через страницу на касании нет — там его ведут за собственные ручки,
	// поэтому по касанию мимо редактора запрет не ставится
	it("does not hold on a touch outside", () => {
		const { editor, outside } = withNeighbour();

		outside.dispatchEvent(new Event("touchstart", { bubbles: true }));

		expect(unselectable(editor)).toBe(false);
	});

	it("keeps its own content selectable when the drag starts inside", () => {
		const { editor } = withNeighbour();

		press(editor.editable.querySelector("p")!.firstChild!);
		expect(unselectable(editor)).toBe(false);
	});

	// протяжка снаружи, следом клик внутрь — состояние не должно залипнуть
	it("clears the hold when the next press lands inside", () => {
		const { editor, outside } = withNeighbour();

		press(outside);
		press(editor.editable);

		expect(unselectable(editor)).toBe(false);
	});

	it("leaves nothing on the element after destroy", () => {
		const { editor, outside } = withNeighbour();
		const editable = editor.editable;

		press(outside);
		editor.destroy();

		expect(editable.classList.contains("unselectable")).toBe(false);
		press(outside); // слушатели сняты — состояние не возвращается
		expect(editable.classList.contains("unselectable")).toBe(false);
	});
});

// Спойлер и моноширинный — из словаря сообщений (docs/feature-message-formatting.md).
describe("RichEditor spoiler and code", () => {
	const parse = (value: string) =>
		makeEditor({ storage: "markdown", multiline: true, value }).editable.querySelector("p")!.innerHTML;

	it.each([
		["||секрет||", "<spoiler>секрет</spoiler>"],
		["`a + b`", "<code>a + b</code>"],
		["до ||секрет|| после", "до <spoiler>секрет</spoiler> после"],
	])("parses %j", (value, html) => {
		expect(parse(value)).toBe(html);
	});

	// Содержимое кода — буквальный текст: маркеры внутри него разметкой не считаются,
	// иначе написанное дословно уезжало бы получателю форматированным.
	it("leaves markers inside code as text", () => {
		expect(parse("`**не жирный**`")).toBe("<code>**не жирный**</code>");
		expect(parse("`a` и **жирный**")).toBe("<code>a</code> и <b>жирный</b>");
	});

	// Значение обязано вернуться таким же: иначе открыть и сохранить сообщение уже меняет его.
	it.each([["||секрет||"], ["`a + b`"], ["`**text**` и **жирный**"], ["||раз|| и `код`"]])(
		"round-trips %j",
		(value) => {
			const editor = makeEditor({ storage: "markdown", multiline: true, value });

			expect(editor.getValue()).toBe(value);
		}
	);

	// Внутри кода разметки нет, поэтому вложенное форматирование при сохранении отбрасывается —
	// иначе поле показывало бы жирный, которого в значении не будет.
	it("drops formatting nested in code", () => {
		const editor = makeEditor({ storage: "markdown", multiline: true });
		editor.editable.innerHTML = "<p><code>a <b>b</b> c</code></p>";

		expect(editor.getValue()).toBe("`a b c`");
	});
});

// Снятие формата с нескольких строк схлопывало их в одну: тег, оставшийся без текста, но
// с переносом внутри, удалялся вместе с переносом.
describe("RichEditor formatting keeps the lines", () => {
	const removeAll = (editor: RichEditor, tool: "bold" | "italic") => {
		const selection = window.getSelection()!;
		const range = document.createRange();
		range.selectNodeContents(editor.editable);
		selection.removeAllRanges();
		selection.addRange(range);

		editor.applyFormat(tool);
	};

	it.each([
		["one tag over the lines", "<p><b>раз<br>два</b></p>"],
		["a tag per line", "<p><b>раз</b><br><b>два</b></p>"],
		["an empty line between", "<p><b>раз<br><br>два</b></p>"],
	])("removes the format of %s", (_case, html) => {
		const editor = makeEditor({ storage: "markdown", multiline: true, paragraph: "break" });
		editor.editable.innerHTML = html;

		const breaks = editor.editable.querySelectorAll("br").length;
		removeAll(editor, "bold");

		expect(editor.editable.querySelector("b")).toBeNull();
		expect(editor.editable.querySelectorAll("br")).toHaveLength(breaks);
		expect(editor.editable.textContent).toBe("раздва");
	});

	it("keeps the paragraphs when the format is removed", () => {
		const editor = makeEditor({ storage: "markdown", multiline: true, value: "**раз**\n\n**два**" });

		removeAll(editor, "bold");

		expect(editor.getValue()).toBe("раз\n\nдва");
	});
});

/**
 * Фокус на время своего слоя (панель смайликов, окно хоста). На сенсорном устройстве поле его
 * отдаёт: иначе экранная клавиатура закрывает собой и слой, и половину текста. Устройство под
 * тестами считается сенсорным, поэтому обе ветки задаются опцией явно.
 */
describe("RichEditor released focus", () => {
	// панель одна на все редакторы: открытая от прошлого случая закрылась бы повторным открытием
	afterEach(() => PopupManager.close());

	const focused = (editor: RichEditor) => document.activeElement === editor.editable;

	// jsdom фокусирует только то, что считает фокусируемым: contenteditable сам по себе таким
	// не считается, поэтому в тестах даём элементу tabindex — хосты пакета его и ставят.
	const take = (editor: RichEditor) => {
		editor.editable.tabIndex = 0;
		editor.editable.focus();

		return editor;
	};

	// окно хоста забирает правку себе — каретка под ним только сбивает с толку
	it("gives the focus up", () => {
		const editor = take(makeEditor({ keepFocus: true, value: "раз" }));

		editor.releaseFocus();

		expect(focused(editor)).toBe(false);
	});

	// а панель смайликов — слой над полем: там каретку видно, и видно, куда встанет символ
	it.each([
		["keeps the focus with the picker", true, true],
		["gives it up on a touch device", false, false],
	])("%s", (_case, keepFocus, expected) => {
		const editor = take(makeEditor({ keepFocus, actions: ["emoji"], value: "раз" }));
		editor.editable.dispatchEvent(new FocusEvent("focus"));

		// через кнопку панели: попап приносит она, редактору остаётся своё — фокус и каретка
		document.querySelector<HTMLButtonElement>(`.${TOOLBAR_CLASS} [data-editor-action="emoji"]`)!.click();

		expect(focused(editor)).toBe(expected);
	});

	// вставка из панели идёт без фокуса — каретку она возвращает сама
	it("inserts at the remembered caret", () => {
		const editor = take(makeEditor({ keepFocus: false, value: "раз два" }));
		caretAt(editor.editable.firstChild!, 3);

		editor.releaseFocus();
		editor.insertText("!");

		expect(editor.getValue()).toBe("раз! два");
		expect(focused(editor)).toBe(false); // вставка фокус не возвращает
	});

	it("inserts into an empty field", () => {
		const editor = take(makeEditor({ keepFocus: false }));

		editor.releaseFocus();
		editor.insertText("раз");

		expect(editor.getValue()).toBe("раз");
	});

	it("returns the caret together with the focus", () => {
		const editor = take(makeEditor({ keepFocus: false, value: "раз два" }));
		caretAt(editor.editable.firstChild!, 3);

		editor.releaseFocus();
		editor.focus();

		expect(focused(editor)).toBe(true);
		editor.insertText("!");
		expect(editor.getValue()).toBe("раз! два");
	});

	// снятие фокуса — не конец ввода: нормализация обрезала бы пробел у каретки
	it("does not normalize while the focus is released", () => {
		const editor = take(makeEditor({ keepFocus: false, value: "раз" }));
		editor.editable.firstChild!.textContent = "раз  ";

		const release = editor.holdEditing();
		editor.releaseFocus();

		expect(editor.editable.textContent).toBe("раз  ");
		release();
		expect(editor.editable.textContent).toBe("раз");
	});
});

// Повторное нажатие по кнопке смайликов панель закрывает, и придерживать правку больше нечем:
// удержание, взятое без панели, никто бы не снял — редактор перестал бы нормализоваться совсем.
describe("RichEditor emoji picker holds", () => {
	it("releases the hold when the second press closes the picker", () => {
		const editor = makeEditor({ tools: ["bold"], actions: ["emoji"], value: "раз" });
		editor.editable.dispatchEvent(new FocusEvent("focus"));

		const button = document.querySelector<HTMLButtonElement>(`.${TOOLBAR_CLASS} [data-editor-action="emoji"]`)!;

		button.click();
		button.click(); // закрыли

		editor.editable.firstChild!.textContent = "раз  ";
		editor.editable.dispatchEvent(new FocusEvent("blur"));

		// правка не придержана — нормализация на blur прошла
		expect(editor.editable.textContent).toBe("раз");
	});
});

/**
 * Пустая строка в конце блока. Хвостовой перенос бывает двух видов: заполнитель, без которого
 * последняя строка не видна, и набранная руками пустая строка. Отличаются они числом: один —
 * заполнитель, два и больше — строки плюс он же.
 */
describe("RichEditor trailing empty line", () => {
	const enterAtEnd = (editor: RichEditor, block: Element) => {
		const selection = window.getSelection()!;
		const range = document.createRange();
		range.selectNodeContents(block);
		range.collapse(false);
		selection.removeAllRanges();
		selection.addRange(range);

		editor.editable.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
	};

	it("keeps the line typed before another block", () => {
		const editor = makeEditor({
			multiline: true,
			storage: "markdown",
			paragraph: "break",
			blocks: ["quote"],
			value: "текст\n> цитата",
		});

		enterAtEnd(editor, editor.editable.firstElementChild!);

		expect(editor.getValue()).toBe("текст\n\n> цитата");
	});

	it("shows the line back when the value is loaded", () => {
		const editor = makeEditor({
			multiline: true,
			storage: "markdown",
			paragraph: "break",
			blocks: ["quote"],
			value: "текст\n\n> цитата",
		});

		expect(editor.editable.firstElementChild!.querySelectorAll("br")).toHaveLength(2);
		expect(editor.getValue()).toBe("текст\n\n> цитата");
	});

	// в самом конце содержимого пустой строке взяться неоткуда — её убирает trim значения
	it("drops the line at the very end", () => {
		const editor = makeEditor({ multiline: true, storage: "markdown", paragraph: "break", value: "текст" });

		enterAtEnd(editor, editor.editable.firstElementChild!);

		expect(editor.getValue()).toBe("текст");
	});
});

/**
 * Слово стёрли, а тег остался: браузер держит каретку внутри, и печать продолжается оформленной.
 * Панель обязана это видеть, а кнопка — снимать именно этот тег.
 */
describe("RichEditor caret inside an emptied tag", () => {
	const emptied = (tool: "code" | "bold") => {
		const editor = makeEditor({ multiline: true, storage: "markdown", value: "слово текст" });
		const text = editor.editable.querySelector("p")!.firstChild!;

		selectRange(text, 0, 5);
		editor.applyFormat(tool);

		// стираем содержимое тега, как это делает удаление выделенного слова
		const wrapper = editor.editable.querySelector(tool === "code" ? "code" : "b")!;
		wrapper.textContent = "";
		caretAt(wrapper, 0);

		return { editor, wrapper };
	};

	it.each([["code"], ["bold"]] as Array<["code" | "bold"]>)("reports %s as active", (tool) => {
		const { editor } = emptied(tool);

		expect(editor.isToolActive(tool)).toBe(true);
		expect(editor.activeTools().has(tool)).toBe(true);
	});

	it("removes the emptied tag by the button", () => {
		const { editor, wrapper } = emptied("code");

		editor.applyFormat("code");

		expect(wrapper.isConnected).toBe(false);
		expect(editor.isToolActive("code")).toBe(false);
	});

	// печать после этого идёт обычным текстом
	it("types plain text after the tag is removed", () => {
		const { editor } = emptied("code");

		editor.applyFormat("code");
		editor.insertText("новое");

		expect(editor.getValue()).toBe("новое текст");
	});
});

/**
 * Перенос строки внутри моноширинного: значение берёт оттуда голый текст, и строка пропала бы —
 * поле показывало бы две, а получатель увидел одну. Перенос разрезает тег.
 */
describe("RichEditor soft break inside monospace", () => {
	const editorWith = (value: string) =>
		makeEditor({ multiline: true, storage: "markdown", paragraph: "break", value });

	const enter = (editor: RichEditor) =>
		editor.editable.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));

	it("ends the format at the end of the run", () => {
		const editor = editorWith("`код` дальше");
		const code = editor.editable.querySelector("code")!;
		caretAt(code.firstChild!, 3);

		enter(editor);
		editor.insertText("текст");

		expect(editor.editable.querySelectorAll("code")).toHaveLength(1);
		expect(editor.getValue()).toBe("`код`\nтекст дальше");
	});

	// разрез в середине оставляет обе половины моноширинными: их так и набирали
	it("splits the run in the middle", () => {
		const editor = editorWith("`раздва`");
		caretAt(editor.editable.querySelector("code")!.firstChild!, 3);

		enter(editor);

		expect(editor.editable.innerHTML).toBe("<p><code>раз</code><br><code>два</code></p>");
		expect(editor.getValue()).toBe("`раз`\n`два`");
	});

	it("leaves no empty run behind", () => {
		const editor = editorWith("`код`");
		caretAt(editor.editable.querySelector("code")!.firstChild!, 0);

		enter(editor);

		expect(editor.editable.querySelectorAll("code")).toHaveLength(1);
	});
});
