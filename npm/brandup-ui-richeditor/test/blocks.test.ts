/**
 * @jest-environment jsdom
 *
 * Блочная модель: цитата и блок кода в разборе, печати и правке. Обычный текст — такой же тип,
 * поэтому здесь же проверяется, что его поведение от появления блоков не изменилось.
 */
import RichEditor, { TOOLBAR_CLASS } from "../source/richeditor";
import { serialize, deserialize, defaultFormatMarkers, ALL_FORMAT_TOOLS, type BlockType } from "../source/format";
import { applyBlocks } from "../source/editing";
import { blocksInRange } from "../source/paragraphs";

const ALL: BlockType[] = ["paragraph", "quote", "code"];

function makeRoot(html: string): HTMLElement {
	document.body.innerHTML = "";
	const root = document.createElement("div");
	root.contentEditable = "true";
	root.innerHTML = html;
	document.body.appendChild(root);
	return root;
}

const toMarkdown = (html: string, types: BlockType[] = ALL) =>
	serialize(makeRoot(html), "markdown", ALL_FORMAT_TOOLS, defaultFormatMarkers(), true, types);

const toHtml = (value: string, types: BlockType[] = ALL) =>
	deserialize(value, "markdown", ALL_FORMAT_TOOLS, defaultFormatMarkers(), true, types);

function makeEditor(opts: ConstructorParameters<typeof RichEditor>[1] = {}) {
	document.body.innerHTML = "";
	const div = document.createElement("div");
	document.body.appendChild(div);

	return new RichEditor(div, { format: true, multiline: true, storage: "markdown", blocks: ALL, ...opts });
}

function caretAt(node: Node, offset: number) {
	const sel = window.getSelection()!;
	sel.removeAllRanges();
	const range = document.createRange();
	range.setStart(node, offset);
	range.collapse(true);
	sel.addRange(range);

	return sel;
}

function selectRange(startNode: Node, start: number, endNode: Node, end: number) {
	const sel = window.getSelection()!;
	sel.removeAllRanges();
	const range = document.createRange();
	range.setStart(startNode, start);
	range.setEnd(endNode, end);
	sel.addRange(range);

	return sel;
}

const press = (editor: RichEditor, key: string, init: KeyboardEventInit = {}) =>
	editor.editable.dispatchEvent(new KeyboardEvent("keydown", { key, cancelable: true, bubbles: true, ...init }));

describe("serialize blocks", () => {
	it("marks every line of a quote", () => {
		expect(toMarkdown("<blockquote>a<br>b</blockquote>")).toBe("> a\n> b");
	});

	it("keeps inline formatting inside a quote", () => {
		expect(toMarkdown("<blockquote><b>a</b> b</blockquote>")).toBe("> **a** b");
	});

	it("fences a code block and leaves its content literal", () => {
		expect(toMarkdown("<pre>a *b*<br>  c</pre>")).toBe("```\na *b*\n  c\n```");
	});

	it("drops formatting inside a code block", () => {
		expect(toMarkdown("<pre><b>a</b></pre>")).toBe("```\na\n```");
	});

	it("separates blocks of different types", () => {
		expect(toMarkdown("<p>a</p><blockquote>b</blockquote><p>c</p>")).toBe("a\n\n> b\n\nc");
	});

	// блок отключённого типа приходит вставкой или чужим значением — текст терять нельзя
	it("saves a disabled block type as plain text", () => {
		expect(toMarkdown("<blockquote>a</blockquote>", ["paragraph"])).toBe("a");
	});

	it("does not mark an empty quote line with a trailing space", () => {
		expect(toMarkdown("<blockquote>a<br><br>b</blockquote>")).toBe("> a\n>\n> b");
	});
});

describe("deserialize blocks", () => {
	it("merges consecutive quote lines into one block", () => {
		expect(toHtml("> a\n> b")).toBe("<blockquote>a<br>b</blockquote>");
	});

	it("splits quotes separated by a blank line", () => {
		expect(toHtml("> a\n\n> b")).toBe("<blockquote>a</blockquote><blockquote>b</blockquote>");
	});

	it("parses a quote marker without the trailing space", () => {
		expect(toHtml("> a\n>\n> b")).toBe("<blockquote>a<br><br>b</blockquote>");
	});

	it("keeps markup inside a quote", () => {
		expect(toHtml("> **a**")).toBe("<blockquote><b>a</b></blockquote>");
	});

	it("takes a fenced block literally", () => {
		expect(toHtml("```\na *b*\n```")).toBe("<pre>a *b*</pre>");
	});

	it("escapes html inside a fenced block", () => {
		expect(toHtml("```\n<b>\n```")).toBe("<pre>&lt;b&gt;</pre>");
	});

	// одна случайная кавычка иначе съедала бы весь остаток сообщения
	it("leaves an unterminated fence outside a block", () => {
		const html = toHtml("```\na");

		expect(html).not.toContain("<pre>");
		expect(html.startsWith("<p>")).toBe(true);
		expect(html.endsWith("a</p>")).toBe(true); // остаток остался в том же блоке
	});

	it("does not parse a disabled block type", () => {
		expect(toHtml("> a", ["paragraph"])).toBe("<p>&gt; a</p>");
	});

	it("still splits plain paragraphs by a blank line", () => {
		expect(toHtml("a\n\nb")).toBe("<p>a</p><p>b</p>");
	});

	it("round-trips a mix of block types", () => {
		const value = "a\n\n> q1\n> q2\n\n```\ncode\n```\n\nb";
		expect(toMarkdown(toHtml(value))).toBe(value);
	});
});

describe("applyBlocks", () => {
	it("changes every block the selection touches", () => {
		const root = makeRoot("<p>a</p><p>b</p><p>c</p>");
		const [first, , third] = Array.from(root.children);
		const sel = selectRange(first.firstChild!, 0, third.firstChild!, 1);

		expect(applyBlocks(root, sel.getRangeAt(0), "quote").changed).toBe(true);
		expect(root.innerHTML).toBe("<blockquote>a</blockquote><blockquote>b</blockquote><blockquote>c</blockquote>");
	});

	it("takes only the block under a collapsed caret", () => {
		const root = makeRoot("<p>a</p><p>b</p>");
		const sel = caretAt(root.children[1].firstChild!, 1);

		applyBlocks(root, sel.getRangeAt(0), "quote");
		expect(root.innerHTML).toBe("<p>a</p><blockquote>b</blockquote>");
	});

	it("reports nothing changed when the type is already applied", () => {
		const root = makeRoot("<blockquote>a</blockquote>");
		const sel = caretAt(root.firstChild!.firstChild!, 1);

		expect(applyBlocks(root, sel.getRangeAt(0), "quote").changed).toBe(false);
	});

	it("keeps formatting when the target type allows markup", () => {
		const root = makeRoot("<p><b>a</b>b</p>");
		const sel = caretAt(root.firstChild!.lastChild!, 1);

		applyBlocks(root, sel.getRangeAt(0), "quote");
		expect(root.innerHTML).toBe("<blockquote><b>a</b>b</blockquote>");
	});

	it("drops formatting when the target type has no markup", () => {
		const root = makeRoot("<p><b>a</b>b</p>");
		const sel = caretAt(root.firstChild!.lastChild!, 1);

		applyBlocks(root, sel.getRangeAt(0), "code");
		expect(root.innerHTML).toBe("<pre>ab</pre>");
	});

	it("keeps soft breaks when the whole block changes", () => {
		const root = makeRoot("<p>a<br>b</p>");
		const sel = selectRange(root.firstChild!.firstChild!, 0, root.firstChild!.lastChild!, 1);

		applyBlocks(root, sel.getRangeAt(0), "code");
		expect(root.innerHTML).toBe("<pre>a<br>b</pre>");
	});

	// иначе в мессенджерском режиме, где всё сообщение это один блок, кодом становился бы весь текст
	it("takes only the touched lines of a block", () => {
		const root = makeRoot("<p>a<br>b<br>c</p>");
		const lines = Array.from(root.firstChild!.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE);
		const sel = selectRange(lines[1], 0, lines[1], 1);

		const { created } = applyBlocks(root, sel.getRangeAt(0), "code");

		expect(root.innerHTML).toBe("<p>a</p><pre>b</pre><p>c</p>");
		expect(created).toBe(root.children[1]);
	});

	it("takes the first lines without leaving an empty block", () => {
		const root = makeRoot("<p>a<br>b<br>c</p>");
		const lines = Array.from(root.firstChild!.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE);
		const sel = selectRange(lines[0], 0, lines[1], 1);

		applyBlocks(root, sel.getRangeAt(0), "quote");
		expect(root.innerHTML).toBe("<blockquote>a<br>b</blockquote><p>c</p>");
	});

	// позиция на уровне редактора — это место ПЕРЕД ребёнком: блок, из которого не выделено
	// ни символа, правке не подлежит
	it("does not take the block the selection only reaches", () => {
		const root = makeRoot("<p>a</p><p>b</p><p>c</p>");
		const range = document.createRange();
		range.setStart(root.firstChild!.firstChild!, 0);
		range.setEnd(root, 2); // до начала третьего блока

		expect(blocksInRange(root, range)).toHaveLength(2);
	});

	it("returns no blocks for a selection outside the content", () => {
		const root = makeRoot("<p>a</p>");
		const outside = document.createElement("div");
		document.body.appendChild(outside);
		outside.textContent = "b";

		const range = document.createRange();
		range.selectNodeContents(outside);

		expect(blocksInRange(root, range)).toEqual([]);
	});
});

describe("toolbar blocks", () => {
	const blockButtons = () => document.querySelectorAll(`.${TOOLBAR_CLASS} .block-button`);
	const blockButton = (type: BlockType) =>
		document.querySelector<HTMLButtonElement>(`.${TOOLBAR_CLASS} .block-button[data-block-type="${type}"]`);

	const focus = (editor: RichEditor) => editor.editable.dispatchEvent(new FocusEvent("focus"));

	// обычный текст не «включается» — он остаётся, когда выключены остальные;
	// блок кода живёт в общей кнопке кода (см. «merged code button»)
	it("has no button for the default type", () => {
		const editor = makeEditor({ value: "a" });
		focus(editor);

		expect(blockButtons()).toHaveLength(1);
		expect(blockButton("paragraph")).toBeNull();
		expect(blockButton("quote")).not.toBeNull();
	});

	// временно скрыты, пока не доведены (см. HIDDEN_TOOLS/HIDDEN_BLOCKS в ./toolbar)
	it("does not show the hidden buttons", () => {
		const editor = makeEditor({ value: "a" });
		focus(editor);

		expect(blockButton("code")).toBeNull();
		expect(document.querySelector(`.${TOOLBAR_CLASS} .format-button[data-format-tool="spoiler"]`)).toBeNull();
	});

	it("has no buttons when no block type is enabled", () => {
		const editor = makeEditor({ blocks: undefined, value: "a" });
		focus(editor);

		expect(blockButtons()).toHaveLength(0);
	});

	it("applies the type by a button click", () => {
		const editor = makeEditor({ value: "a" });
		focus(editor);
		caretAt(editor.editable.firstChild!.firstChild!, 1);

		blockButton("quote")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(editor.getValue()).toBe("> a");
	});

	it("highlights the type under the caret", () => {
		const editor = makeEditor({ value: "> a" });
		caretAt(editor.editable.firstChild!.firstChild!, 1);
		focus(editor);

		expect(blockButton("quote")!.classList.contains("active")).toBe(true);
	});
});

// В мессенджерах моноширинный и блок кода делает одна кнопка, а вид выбирает выделение.
describe("merged code button", () => {
	const codeButton = () =>
		document.querySelector<HTMLButtonElement>(`.${TOOLBAR_CLASS} .format-button[data-format-tool="code"]`);

	const focus = (editor: RichEditor) => editor.editable.dispatchEvent(new FocusEvent("focus"));

	// кнопки кода в панели пока нет вовсе — ни моноширинного, ни блока (см. ./toolbar)
	it("has no code control in the toolbar", () => {
		const editor = makeEditor({ value: "a" });
		focus(editor);

		expect(codeButton()).toBeNull();
		expect(document.querySelector(`.${TOOLBAR_CLASS} .block-button[data-block-type="code"]`)).toBeNull();
	});

	it("makes a part of the line monospace", () => {
		const editor = makeEditor({ value: "раз два" });
		const text = editor.editable.firstChild!.firstChild!;
		selectRange(text, 0, text, 3);

		editor.applyCode();
		expect(editor.getValue()).toBe("`раз` два");
	});

	// одна строка — даже целиком — остаётся куском текста
	it("makes a fully selected single line monospace", () => {
		const editor = makeEditor({ value: "раз два" });
		const text = editor.editable.firstChild!.firstChild!;
		selectRange(text, 0, text, 7);

		editor.applyCode();
		expect(editor.getValue()).toBe("`раз два`");
	});

	// три кавычки — на выделенные строки, а не на всё сообщение
	it("fences only the selected lines", () => {
		const editor = makeEditor({ value: "раз\nдва\nтри", paragraph: "break" });
		const lines = Array.from(editor.editable.firstChild!.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE);
		selectRange(lines[0], 0, lines[1], 3);

		editor.applyCode();
		expect(editor.getValue()).toBe("```\nраз\nдва\n```\nтри");
	});

	it("makes the line under the caret a code block", () => {
		const editor = makeEditor({ value: "раз\nдва", paragraph: "break" });
		const lines = Array.from(editor.editable.firstChild!.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE);
		caretAt(lines[1], 1);

		editor.applyCode();
		expect(editor.getValue()).toBe("раз\n```\nдва\n```");
	});

	// без выделения моноширинным делать нечего, а иначе блок был бы недостижим:
	// в пустом поле не выделить строки, которых ещё нет
	it("makes the block a code block without a selection", () => {
		const editor = makeEditor({ value: "раз два" });
		caretAt(editor.editable.firstChild!.firstChild!, 2);

		editor.applyCode();
		expect(editor.getValue()).toBe("```\nраз два\n```");
	});

	it("makes an empty editor a code block", () => {
		const editor = makeEditor();
		editor.editable.dispatchEvent(new FocusEvent("focus"));
		caretAt(editor.editable, 0);

		editor.applyCode();
		expect(editor.currentBlock).toBe("code");
	});

	// блок выключен — остаётся прежний режим набора моноширинного
	it("starts the typing mode when the block type is off", () => {
		const editor = makeEditor({ blocks: ["quote"] });
		caretAt(editor.editable, 0);

		editor.applyCode();
		editor.insertText("код");

		expect(editor.getValue()).toBe("`код`");
	});

	it("makes a selection across lines a code block", () => {
		const editor = makeEditor({ value: "раз\n\nдва" });
		const [first, second] = Array.from(editor.editable.children);
		selectRange(first.firstChild!, 0, second.firstChild!, 3);

		editor.applyCode();
		expect(editor.getValue()).toBe("```\nраз\n```\n\n```\nдва\n```");
	});

	it("takes a soft break inside the block as lines", () => {
		const editor = makeEditor({ value: "a\nb", paragraph: "break" });
		const block = editor.editable.firstElementChild!;
		selectRange(block.firstChild!, 0, block.lastChild!, 1);

		editor.applyCode();
		expect(editor.currentBlock).toBe("code");
	});

	it("removes monospace by a second press", () => {
		const editor = makeEditor({ value: "`раз` два" });
		const code = editor.editable.querySelector("code")!;
		selectRange(code.firstChild!, 0, code.firstChild!, 3);

		editor.applyCode();
		expect(editor.getValue()).toBe("раз два");
	});

	it("leaves the code block by a second press", () => {
		const editor = makeEditor({ value: "```\nраз\n```" });
		caretAt(editor.editable.firstChild!.firstChild!, 1);

		editor.applyCode();
		expect(editor.getValue()).toBe("раз");
	});

	// подсветка объединённой кнопки берётся отсюда (пока кнопка блока скрыта — только состояние)
	it.each([
		["monospace", "`раз` два"],
		["code block", "```\nраз\n```"],
	])("reports code active in %s", (_kind, value) => {
		const editor = makeEditor({ value });
		const target = (editor.editable.querySelector("code") ?? editor.editable.firstElementChild!).firstChild!;
		caretAt(target, 1);

		expect(editor.isCodeActive()).toBe(true);
	});

	// значение берёт из кода голый текст: разметка внутри до получателя не доедет,
	// и держать её в поле значит показывать то, чего в сообщении не будет
	it("clears formatting inside monospace", () => {
		const editor = makeEditor({ value: "**раз** два" });
		const text = editor.editable.querySelector("b")!.firstChild!;
		selectRange(text, 0, text, 3);

		editor.applyCode();

		expect(editor.editable.querySelector("code b")).toBeNull();
		expect(editor.getValue()).toBe("`раз` два");
	});

	it("clears formatting pasted into monospace", () => {
		const editor = makeEditor({ value: "`раз` два" });
		const code = editor.editable.querySelector("code")!;
		code.innerHTML = "<b>раз</b>";

		editor.editable.dispatchEvent(new FocusEvent("blur")); // нормализация

		expect(editor.editable.querySelector("code b")).toBeNull();
		expect(editor.getValue()).toBe("`раз` два");
	});

	it.each([
		["monospace", "`раз` два"],
		["code block", "```\nраз\n```"],
	])("does not apply other tools inside %s", (_kind, value) => {
		const editor = makeEditor({ value });
		const target = (editor.editable.querySelector("code") ?? editor.editable.firstElementChild!).firstChild!;
		selectRange(target, 0, target, 3);

		expect(editor.isToolEnabled("bold")).toBe(false);
		editor.applyFormat("bold");

		expect(editor.editable.querySelector("b")).toBeNull();
	});

	it("keeps other tools available outside code", () => {
		const editor = makeEditor({ value: "раз два" });
		const text = editor.editable.firstChild!.firstChild!;
		selectRange(text, 0, text, 3);

		expect(editor.isToolEnabled("bold")).toBe(true);
	});

	it("does nothing the editor cannot do", () => {
		const editor = makeEditor({ value: "раз", tools: ["bold"], blocks: ["quote"] });
		const text = editor.editable.firstChild!.firstChild!;
		selectRange(text, 0, text, 3);

		editor.applyCode();
		expect(editor.getValue()).toBe("раз");
	});
});

describe("editor blocks", () => {
	it("applies and toggles back the block type", () => {
		const editor = makeEditor({ value: "a" });
		caretAt(editor.editable.firstChild!.firstChild!, 1);

		editor.applyBlock("quote");
		expect(editor.getValue()).toBe("> a");
		expect(editor.currentBlock).toBe("quote");

		editor.applyBlock("quote");
		expect(editor.getValue()).toBe("a");
		expect(editor.currentBlock).toBe("paragraph");
	});

	it("ignores a block type that is not enabled", () => {
		const editor = makeEditor({ value: "a", blocks: ["quote"] });
		caretAt(editor.editable.firstChild!.firstChild!, 1);

		editor.applyBlock("code");
		expect(editor.getValue()).toBe("a");
	});

	it("has only the default block type without the option", () => {
		const editor = makeEditor({ value: "a", blocks: undefined });
		expect(editor.blockTypes).toEqual(["paragraph"]);
	});

	it("keeps the default block type first however the option is ordered", () => {
		const editor = makeEditor({ blocks: ["code", "quote"] });
		expect(editor.blockTypes).toEqual(["paragraph", "quote", "code"]);
	});

	// Значения блоков: цитата и ограждённый блок кода в одну строку.
	const BLOCK_VALUES: Array<[string, BlockType]> = [
		["> a", "quote"],
		["```\na\n```", "code"],
	];

	// выйти из блока нужно чаще, чем продолжить его: иначе уйти можно только мышью
	it.each(BLOCK_VALUES)("leaves the block on Enter in %j", (value) => {
		const editor = makeEditor({ value });
		caretAt(editor.editable.firstChild!.firstChild!, 1);

		press(editor, "Enter");

		expect(editor.editable.lastElementChild!.tagName).toBe("P");
		expect(editor.currentBlock).toBe("paragraph");
	});

	it.each(BLOCK_VALUES)("breaks the line on Shift+Enter in %j", (value, type) => {
		const editor = makeEditor({ value });
		caretAt(editor.editable.firstChild!.firstChild!, 1);

		press(editor, "Enter", { shiftKey: true });

		expect(editor.editable.children).toHaveLength(1);
		expect(editor.editable.firstElementChild!.querySelectorAll("br")).toHaveLength(2);
		expect(editor.currentBlock).toBe(type);
	});

	it("starts a new paragraph on Enter in plain text", () => {
		const editor = makeEditor({ value: "a" });
		caretAt(editor.editable.firstChild!.firstChild!, 1);

		press(editor, "Enter");
		expect(editor.editable.innerHTML).toBe("<p>a</p><p><br></p>");
	});

	it("returns the block to plain text on Backspace at its start", () => {
		const editor = makeEditor({ value: "> a" });
		caretAt(editor.editable.firstChild!.firstChild!, 0);

		expect(press(editor, "Backspace")).toBe(false); // событие погашено
		expect(editor.getValue()).toBe("a");
	});

	// начало второй строки блока — это перенос, а не тип блока
	it("does not touch the block on Backspace at the start of its second line", () => {
		const editor = makeEditor({ value: "> a\n> b" });
		const block = editor.editable.firstElementChild!;
		caretAt(block, Array.from(block.childNodes).indexOf(block.querySelector("br")!) + 1);

		expect(press(editor, "Backspace")).toBe(true);
		expect(editor.currentBlock).toBe("quote");
	});

	it("does not touch the block on Backspace inside the text", () => {
		const editor = makeEditor({ value: "> ab" });
		caretAt(editor.editable.firstChild!.firstChild!, 1);

		expect(press(editor, "Backspace")).toBe(true); // удаление символа делает браузер
		expect(editor.currentBlock).toBe("quote");
	});

	// разорвать цитату посреди вставки — не то, чего ждут
	it("keeps a multiline paste inside the target block", () => {
		const editor = makeEditor({ value: "> a" });
		caretAt(editor.editable.firstChild!.firstChild!, 1);

		editor.editable.dispatchEvent(
			Object.assign(new Event("paste", { bubbles: true, cancelable: true }), {
				clipboardData: { getData: (type: string) => (type === "text/plain" ? "x\n\ny" : "") },
			})
		);

		expect(editor.editable.querySelectorAll("blockquote").length).toBe(2);
		expect(editor.editable.querySelector("p")).toBeNull();
	});

	it("does not build a block of a disabled type from pasted html", () => {
		const editor = makeEditor({ blocks: undefined, value: "a" });
		caretAt(editor.editable.firstChild!.firstChild!, 1);

		editor.editable.dispatchEvent(
			Object.assign(new Event("paste", { bubbles: true, cancelable: true }), {
				clipboardData: {
					getData: (type: string) => (type === "text/html" ? "<blockquote>q</blockquote>" : "q"),
				},
			})
		);

		expect(editor.editable.querySelector("blockquote")).toBeNull();
		expect(editor.getValue()).toContain("q");
	});

	it("keeps indentation inside a code block on normalization", () => {
		const editor = makeEditor({ value: "```\n    a  b\n```" });
		editor.editable.dispatchEvent(new FocusEvent("blur"));

		expect(editor.getValue()).toBe("```\n    a  b\n```");
	});

	// в режиме мягких переносов пустая строка — это строка сообщения, а не разделитель блоков
	describe("break mode", () => {
		const breakEditor = (value: string) => makeEditor({ paragraph: "break", value });

		it("parses a quote without a blank line before it", () => {
			const editor = breakEditor("a\n> q");

			expect(editor.editable.innerHTML).toBe("<p>a</p><blockquote>q</blockquote>");
			expect(editor.getValue()).toBe("a\n> q");
		});

		it("keeps a blank line inside plain text", () => {
			const editor = breakEditor("a\n\nb\n> q");

			expect(editor.editable.innerHTML).toBe("<p>a<br><br>b</p><blockquote>q</blockquote>");
			expect(editor.getValue()).toBe("a\n\nb\n> q");
		});

		it("round-trips a code block", () => {
			const editor = breakEditor("a\n```\nx\n```\nb");

			expect(editor.getValue()).toBe("a\n```\nx\n```\nb");
		});

		it("keeps plain text in one block without the blocks option", () => {
			const editor = makeEditor({ paragraph: "break", blocks: undefined, value: "a\n> q" });

			expect(editor.editable.innerHTML).toBe("<p>a<br>&gt; q</p>");
		});
	});

	it("collapses spaces in a quote as in plain text", () => {
		const editor = makeEditor({ value: "> a  b" });
		editor.editable.dispatchEvent(new FocusEvent("blur"));

		expect(editor.getValue()).toBe("> a b");
	});
});
