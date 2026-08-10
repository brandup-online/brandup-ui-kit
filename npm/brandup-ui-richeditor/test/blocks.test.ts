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

	// ограда с меткой языка открывает блок так же, а метка отбрасывается: значение её не хранит
	it("parses a fence with a language tag, dropping the tag", () => {
		expect(toHtml("```text\na *b*\n```")).toBe("<pre>a *b*</pre>");
	});

	// остаток с символом ограды меткой не считается: ```` — не ограда с меткой `
	it("does not take a fence character for a language tag", () => {
		expect(toHtml("````\na\n```")).not.toContain("<pre>");
	});

	// закрывает блок только голая ограда: та же строка с меткой внутри — содержимое
	it("does not close a fence with a language tag", () => {
		expect(toHtml("```\na\n```text\nb\n```")).toBe("<pre>a<br>```text<br>b</pre>");
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

	// спойлер был спрятан в HIDDEN_TOOLS (см. ./toolbar) — кнопка не должна пропасть снова
	it("shows the spoiler button", () => {
		const editor = makeEditor({ value: "a" });
		focus(editor);

		expect(document.querySelector(`.${TOOLBAR_CLASS} .format-button[data-format-tool="spoiler"]`)).not.toBeNull();
	});

	// поле ограничивают явным пустым списком: цитаты и код нужны не везде
	it("has no buttons when the block types are restricted", () => {
		const editor = makeEditor({ blocks: [], value: "a" });
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

	// одна кнопка на оба вида: отдельной кнопки блока кода в панели нет
	it("is the only code control in the toolbar", () => {
		const editor = makeEditor({ value: "a" });
		focus(editor);

		expect(codeButton()).not.toBeNull();
		expect(codeButton()!.title).toBe("Код");
		expect(document.querySelector(`.${TOOLBAR_CLASS} .block-button[data-block-type="code"]`)).toBeNull();
	});

	// без моноширинного сводить нечего — у блока остаётся своя кнопка
	it("keeps its own block button when the monospace tool is off", () => {
		const editor = makeEditor({ value: "a", tools: ["bold"] });
		focus(editor);

		expect(document.querySelector(`.${TOOLBAR_CLASS} .block-button[data-block-type="code"]`)).not.toBeNull();
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
		const lines = Array.from(editor.editable.children);
		selectRange(lines[0].firstChild!, 0, lines[1].firstChild!, 3);

		editor.applyCode();
		expect(editor.getValue()).toBe("```\nраз\nдва\n```\nтри");
	});

	it("makes the line under the caret a code block", () => {
		const editor = makeEditor({ value: "раз\nдва", paragraph: "break" });
		caretAt(editor.editable.children[1].firstChild!, 1);

		editor.applyCode();
		expect(editor.getValue()).toBe("раз\n```\nдва\n```");
	});

	// Пустая строка перед выделенной остаётся: в границу блоков уходит перенос-разделитель,
	// а не она. Без заполнителя её хвостовой перенос читался бы заполнителем — и строка
	// пропадала бы и с экрана, и из значения.
	it("keeps the empty line above the new code block", () => {
		const editor = makeEditor({ value: "раз\n\nдва", paragraph: "break" });
		caretAt(editor.editable.children[2].firstChild!, 1); // «два» — за пустой строкой

		editor.applyCode();
		expect(editor.getValue()).toBe("раз\n\n```\nдва\n```");
	});

	// Та же пустая строка в конце выделения: вынос хвоста забирает разделитель у самого
	// блока, и без заполнителя она пропадала бы уже из блока кода.
	it("keeps the empty line at the end of the selection inside the code block", () => {
		const editor = makeEditor({ value: "раз\nдва\n\nтри", paragraph: "break" });
		const lines = Array.from(editor.editable.children);
		// конец выделения — на пустой строке (это отдельный пустой абзац)
		selectRange(lines[1].firstChild!, 0, lines[2], 0);

		editor.applyCode();
		expect(editor.getValue()).toBe("раз\n```\nдва\n\n```\nтри");
	});

	// Перенос внутри инлайнового тега — тоже перенос: пустая строка после жирного текста
	// не должна пропадать из-за того, что её разделитель спрятан в <b>. Такой DOM делает
	// Shift+Enter внутри жирного: мягкий перенос не разрезает инлайновый тег.
	it("keeps the empty line hidden inside an inline tag", () => {
		const editor = makeEditor({ value: "x", paragraph: "break" });
		const paragraph = editor.editable.firstChild as HTMLElement;
		paragraph.innerHTML = "<b>жирный<br><br>два</b>";
		const bold = paragraph.firstChild!;
		caretAt(bold.childNodes[3], 1); // каретка в «два»

		editor.applyCode();
		expect(editor.getValue()).toBe("**жирный**\n\n```\nдва\n```");
	});

	// Заполнитель, спрятанный внутри инлайнового тега (Shift+Enter в конце жирного кладёт
	// переносы внутрь <b>), — тоже заполнитель: резать по нему нельзя.
	it("does not cut on a trailing pad hidden inside an inline tag", () => {
		const editor = makeEditor({ value: "x", paragraph: "break" });
		const paragraph = editor.editable.firstChild as HTMLElement;
		paragraph.innerHTML = "<b>жирный<br><br></b>";
		caretAt(paragraph, paragraph.childNodes.length); // за заполнителем

		editor.applyCode();

		// кодом стала пустая последняя строка; кусок «до» — без фантомной пустой строки
		expect(editor.editable.querySelectorAll("pre").length).toBe(1);
		expect(editor.editable.firstElementChild!.innerHTML).toBe("<b>жирный</b>");
		expect(editor.getValue()).toBe("**жирный**");
	});

	// Пустая последняя строка кодом становится сама по себе: кусок «до» она за собой не тянет,
	// иначе в значении появлялась бы пустая строка, которой не набирали.
	it("does not invent an empty line when the caret sits on the last empty line", () => {
		const editor = makeEditor({ value: "а", paragraph: "break" });
		caretAt(editor.editable.firstChild!.firstChild!, 1);
		press(editor, "Enter"); // новая пустая строка — отдельным абзацем

		caretAt(editor.editable.lastElementChild!, 0);
		editor.applyCode();

		// кодом стала пустая строка (пустой блок в хвосте значения не виден), а не кусок «до»,
		// и лишней пустой строки перед блоком не появилось
		expect(editor.editable.querySelector("pre")).not.toBeNull();
		expect(editor.getValue()).toBe("а");
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

	it("takes a selection across lines as a code block", () => {
		const editor = makeEditor({ value: "a\nb", paragraph: "break" });
		const [first, second] = Array.from(editor.editable.children);
		selectRange(first.firstChild!, 0, second.firstChild!, 1);

		editor.applyCode();
		expect(editor.currentBlock).toBe("code");
	});

	// Собирается весь охват выделения, а не только строки чужого типа: блок нужного типа посреди
	// него оставался на месте, а собранный вставал перед ним — строки менялись местами.
	it("keeps the order when a block of the same type sits in the middle", () => {
		const editor = makeEditor({ value: "раз\n```\nдва\n```\nтри", paragraph: "break" });
		const lines = Array.from(editor.editable.children);
		selectRange(lines[0].firstChild!, 0, lines[2].firstChild!, 3);

		editor.applyCode();
		expect(editor.getValue()).toBe("```\nраз\nдва\nтри\n```");
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

	// этим и подсвечивается объединённая кнопка
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

	it("takes all the block types without the option", () => {
		const editor = makeEditor({ value: "a", blocks: undefined });
		expect(editor.blockTypes).toEqual(ALL);
	});

	it("keeps only the default type when the list is empty", () => {
		const editor = makeEditor({ value: "a", blocks: [] });
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

	// каретка в опустевшем блоке стоит за <br>-заполнителем, и без этого выйти было нельзя
	it.each([
		["at the very start", 0],
		["behind the filler", 1],
	])("returns an empty block to plain text on Backspace %s", (_case, offset) => {
		const editor = makeEditor({ value: "> a" });
		const block = editor.editable.firstElementChild!;
		block.innerHTML = "<br>"; // текст стёрли, остался заполнитель
		caretAt(block, offset);

		expect(press(editor, "Backspace")).toBe(false);
		expect(editor.currentBlock).toBe("paragraph");
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

			// абзац здесь — строка, поэтому пустая строка это пустой абзац
			expect(editor.editable.innerHTML).toBe("<p>a</p><p><br></p><p>b</p><blockquote>q</blockquote>");
			expect(editor.getValue()).toBe("a\n\nb\n> q");
		});

		it("round-trips a code block", () => {
			const editor = breakEditor("a\n```\nx\n```\nb");

			expect(editor.getValue()).toBe("a\n```\nx\n```\nb");
		});

		it("keeps the quote marker as text when the types are restricted", () => {
			const editor = makeEditor({ paragraph: "break", blocks: [], value: "a\n> q" });

			expect(editor.editable.innerHTML).toBe("<p>a</p><p>&gt; q</p>");
		});
	});

	it("collapses spaces in a quote as in plain text", () => {
		const editor = makeEditor({ value: "> a  b" });
		editor.editable.dispatchEvent(new FocusEvent("blur"));

		expect(editor.getValue()).toBe("> a b");
	});
});

// Из блока выходят, чтобы писать дальше. Пустой абзац за ним — единственное место, где каретка
// стоит снаружи: убрав его, нормализация запирала бы правку внутри цитаты.
describe("paragraph after a block", () => {
	const blur = (editor: RichEditor) => editor.editable.dispatchEvent(new FocusEvent("blur"));

	it("survives the normalization", () => {
		const editor = makeEditor({ value: "> цитата" });
		caretAt(editor.editable.firstChild!.firstChild!, 6);

		press(editor, "Enter"); // выходим из цитаты
		expect(editor.editable.lastElementChild!.tagName).toBe("P");

		blur(editor);

		expect(editor.editable.lastElementChild!.tagName).toBe("P");
		expect(editor.getValue()).toBe("> цитата"); // пустая строка в конце значения не нужна
	});

	// пустой абзац в середине не удержать: в значении ему места нет, и при загрузке он пропал бы
	it("is removed in the middle", () => {
		const editor = makeEditor({ value: "раз\n\nдва" });
		editor.editable.firstElementChild!.after(document.createElement("p"));

		blur(editor);

		expect(editor.editable.children).toHaveLength(2);
	});
});

// Перенос на новую строку не должен схлопываться потом — ни в обычном тексте, ни после блока.
describe("the line stays after Enter", () => {
	const blur = (editor: RichEditor) => editor.editable.dispatchEvent(new FocusEvent("blur"));

	const enterAtEnd = (editor: RichEditor, block: Element) => {
		const selection = window.getSelection()!;
		const range = document.createRange();
		range.selectNodeContents(block);
		range.collapse(false);
		selection.removeAllRanges();
		selection.addRange(range);

		press(editor, "Enter");
	};

	it.each([
		["after a quote", "> цитата", "> цитата"],
		["after a code block", "```\nкод\n```", "```\nкод\n```"],
		["after an ordinary paragraph", "раз", "раз"],
	])("keeps the line %s", (_case, value, expected) => {
		const editor = makeEditor({ value, paragraph: "block" });
		enterAtEnd(editor, editor.editable.lastElementChild!);

		expect(editor.editable.lastElementChild!.tagName).toBe("P");

		blur(editor);

		expect(editor.editable.lastElementChild!.tagName).toBe("P");
		expect((editor.editable.lastElementChild!.textContent ?? "").length).toBe(0);
		expect(editor.getValue()).toBe(expected); // в значение пустая строка не идёт
	});

	// одно нажатие — одна строка: за блоком уже может стоять абзац, заведённый под каретку
	it("does not add a second empty paragraph", () => {
		const editor = makeEditor({ value: "> цитата" });
		enterAtEnd(editor, editor.editable.firstElementChild!);
		blur(editor);

		enterAtEnd(editor, editor.editable.firstElementChild!);

		expect(editor.editable.children).toHaveLength(2);
	});
});

// Подряд идущие строки с маркером — одна цитата: значение пишет их подряд, а разбор собирает
// в один блок. Два блока в поле показывали бы то, чего в сообщении не будет.
describe("adjacent quotes", () => {
	const blur = (editor: RichEditor) => editor.editable.dispatchEvent(new FocusEvent("blur"));

	it("merges on normalization", () => {
		const editor = makeEditor({ paragraph: "break" });
		editor.editable.innerHTML = "<blockquote>раз</blockquote><blockquote>два</blockquote>";

		blur(editor);

		expect(editor.editable.children).toHaveLength(1);
		expect(editor.editable.innerHTML).toBe("<blockquote>раз<br>два</blockquote>");
		expect(editor.getValue()).toBe("> раз\n> два");
	});

	it("merges right after the button", () => {
		const editor = makeEditor({ paragraph: "break", value: "> раз\nдва" });
		caretAt(editor.editable.lastElementChild!.firstChild!, 1);

		editor.applyBlock("quote");

		expect(editor.editable.children).toHaveLength(1);
		expect(editor.getValue()).toBe("> раз\n> два");
	});

	// в режиме абзацев соседние цитаты разделяет пустая строка — они различимы и остаются двумя
	it("stays apart in the paragraph mode", () => {
		const editor = makeEditor({ paragraph: "block" });
		editor.editable.innerHTML = "<blockquote>раз</blockquote><blockquote>два</blockquote>";

		blur(editor);

		expect(editor.editable.children).toHaveLength(2);
		expect(editor.getValue()).toBe("> раз\n\n> два");
	});

	// у блока кода есть свои границы: два подряд разбираются ровно как два
	it("does not merge code blocks", () => {
		const editor = makeEditor({ paragraph: "break" });
		editor.editable.innerHTML = "<pre>раз</pre><pre>два</pre>";

		blur(editor);

		expect(editor.editable.children).toHaveLength(2);
	});
});

/**
 * В режиме мягких переносов абзацных блоков в содержимом быть не должно: их граница уходит
 * в значение пустой строкой, которой на экране нет. Блоки там появляются побочно — правкой
 * блочного типа, — и нормализация обязана их сводить.
 */
describe("adjacent paragraphs in the break mode", () => {
	const blur = (editor: RichEditor) => editor.editable.dispatchEvent(new FocusEvent("blur"));

	// абзац здесь — строка: соседние остаются собой, а чужой мягкий перенос приводится к ним же
	it("keeps them apart and splits soft breaks into lines", () => {
		const editor = makeEditor({ paragraph: "break" });
		editor.editable.innerHTML = "<p>раз</p><p>два<br>три</p>";

		blur(editor);

		expect(editor.editable.innerHTML).toBe("<p>раз</p><p>два</p><p>три</p>");
		expect(editor.getValue()).toBe("раз\nдва\nтри");
	});

	// набранная руками пустая строка живёт внутри абзаца и остаётся
	it("keeps the empty line typed inside", () => {
		const editor = makeEditor({ paragraph: "break" });
		editor.editable.innerHTML = "<p>раз<br><br>два</p>";

		blur(editor);

		expect(editor.getValue()).toBe("раз\n\nдва");
	});

	// Каретку возвращают по текстовым смещениям, а разбиение абзаца живой Range не переживает:
	// пока строки разводились после возврата, каретка после снятия блока падала в начало поля.
	it("keeps the caret when a multi-line block goes back to plain text", () => {
		const editor = makeEditor({ paragraph: "break", value: "> раз\n> два" });
		const quote = editor.editable.firstElementChild!;
		caretAt(quote.lastChild!, 1); // внутри «два»

		editor.applyBlock("quote"); // снимаем цитату

		expect(editor.editable.innerHTML).toBe("<p>раз</p><p>два</p>");

		const selection = window.getSelection()!;
		expect(selection.anchorNode!.textContent).toBe("два");
		expect(selection.anchorOffset).toBe(1);
	});

	// пустое поле должно оставаться пустым, иначе не покажется заглушка
	it("clears the field made of empty lines only", () => {
		const editor = makeEditor({ paragraph: "break" });
		editor.editable.innerHTML = "<p><br></p><p><br></p>";

		blur(editor);

		expect(editor.editable.innerHTML).toBe("");
		expect(editor.getValue()).toBe("");
	});

	// пустая строка после блока остаётся своим абзацем, когда печатают в следующую
	it("keeps the empty line while typing into the next one", () => {
		const editor = makeEditor({ paragraph: "break", value: "```\nкод\n```" });
		const selection = window.getSelection()!;
		const range = document.createRange();
		range.selectNodeContents(editor.editable.firstElementChild!);
		range.collapse(false);
		selection.removeAllRanges();
		selection.addRange(range);

		press(editor, "Enter"); // выходим из блока
		press(editor, "Enter"); // пустая строка

		editor.insertText("текст");
		editor.editable.dispatchEvent(new Event("input", { bubbles: true }));

		expect(editor.editable.lastElementChild!.innerHTML).toBe("текст");
		expect(editor.editable.lastElementChild!.previousElementSibling!.innerHTML).toBe("<br>");
		expect(editor.getValue()).toBe("```\nкод\n```\n\nтекст");
	});
});

// Пустой абзац внутри содержимого — осознанная пустая строка (за цитатой его держит
// и normalizeParagraphs). serializeParagraphs работает в обе стороны — этой же функцией
// значение и читается, поэтому фильтровать пустые блоки здесь нельзя: терялись бы
// пустые строки уже сохранённых значений при первой же загрузке.
describe("interior empty paragraph", () => {
	it("survives loading a stored html value", () => {
		expect(toHtmlStorage("<blockquote>q</blockquote><p></p><p>b</p>")).toBe(
			"<blockquote>q</blockquote><p><br></p><p>b</p>"
		);
	});

	it("survives html serialization", () => {
		expect(
			serialize(
				makeRoot("<p>a</p><p><br></p><p>b</p>"),
				"html",
				ALL_FORMAT_TOOLS,
				defaultFormatMarkers(),
				true,
				ALL
			)
		).toBe("<p>a</p><p></p><p>b</p>");
	});

	// пустые цитата и код осмысленны сами по себе — тоже остаются
	it("keeps an interior empty quote", () => {
		expect(toMarkdown("<p>a</p><blockquote><br></blockquote><p>b</p>")).toBe("a\n\n>\n\nb");
	});
});

const toHtmlStorage = (value: string) =>
	deserialize(value, "html", ALL_FORMAT_TOOLS, defaultFormatMarkers(), true, ALL);
