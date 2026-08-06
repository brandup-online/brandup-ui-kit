/**
 * @jest-environment jsdom
 */
import RichEditor, { TOOLBAR_CLASS } from "../source/richeditor";
import { BODY_CLASS, formatToolbar, LINK_EDITING_CLASS, LINK_ROW_CLASS } from "../source/toolbar";
import { deserialize, serialize } from "../source/serialize";
import { cleanupFormatting } from "../source/selection";
import { ALL_FORMAT_TOOLS, defaultFormatMarkers, type FormatTool } from "../source/format-config";

const markers = defaultFormatMarkers();

/** markdown → разметка поля */
const parse = (value: string, tools: FormatTool[] = ALL_FORMAT_TOOLS) => deserialize(value, "markdown", tools, markers);

/** разметка поля → markdown */
function build(html: string, tools: FormatTool[] = ALL_FORMAT_TOOLS): string {
	const holder = document.createElement("div");
	holder.innerHTML = html;

	return serialize(holder, "markdown", tools, markers, false);
}

/** значение → поле → значение: собранное обязано совпасть с исходным */
const roundTrip = (value: string, tools: FormatTool[] = ALL_FORMAT_TOOLS) => build(parse(value, tools), tools);

describe("link markup", () => {
	it.each([
		["простая", "[текст](https://example.com)"],
		["с якорем", "[текст](https://example.com/a#b)"],
		["относительная", "[текст](/page)"],
		["почта", "[письмо](mailto:a@b.c)"],
		// Подчёркивания в адресе — не курсив: адрес прячется от маркеров до их разбора.
		["с подчёркиваниями в адресе", "[вики](https://ru.wikipedia.org/wiki/Что_то)"],
		// Парные скобки в адресе разрешены — иначе половина ссылок на википедию ушла бы в угловые.
		["с парой скобок в адресе", "[вики](https://ru.wikipedia.org/wiki/Ключ_(замок))"],
		["с разметкой в тексте", "[**жирный** текст](https://example.com)"],
		["внутри жирного", "**до [текст](https://example.com) после**"],
		["две подряд", "[раз](https://a.example) и [два](https://b.example)"],
	])("round-trips %s", (_name, value) => {
		expect(roundTrip(value)).toBe(value);
	});

	it("keeps the address out of the text", () => {
		const html = parse("[текст](https://example.com)");
		const holder = document.createElement("div");
		holder.innerHTML = html;

		const link = holder.querySelector("a")!;
		expect(link.getAttribute("href")).toBe("https://example.com");
		expect(holder.textContent).toBe("текст"); // адрес виден только оформлением
	});

	it("parses the markup inside the text of a link", () => {
		const holder = document.createElement("div");
		holder.innerHTML = parse("[**жирный**](https://example.com)");

		expect(holder.querySelector("a > b")).not.toBeNull();
	});

	// Адрес с пробелом обрывается на первом же — markdown берёт такой в угловые скобки
	it("round-trips an address with a space through the angle form", () => {
		const html = parse("[текст](<https://example.com/a b>)");
		const holder = document.createElement("div");
		holder.innerHTML = html;

		expect(holder.querySelector("a")!.getAttribute("href")).toBe("https://example.com/a b");
		expect(build(html)).toBe("[текст](<https://example.com/a b>)");
	});

	// Скобки в тексте разорвали бы разбор, поэтому экранируются — и снимаются обратно
	it("round-trips brackets inside the text", () => {
		expect(roundTrip("[текст \\[в скобках\\]](https://example.com)")).toBe(
			"[текст \\[в скобках\\]](https://example.com)"
		);

		const holder = document.createElement("div");
		holder.innerHTML = parse("[текст \\[в скобках\\]](https://example.com)");
		expect(holder.textContent).toBe("текст [в скобках]"); // на экране скобки обычные
	});

	it.each([
		["без текста", "[](https://example.com)"],
		["без адреса", "[текст]()"],
	])("makes no link %s", (_name, value) => {
		const holder = document.createElement("div");
		holder.innerHTML = parse(value);

		expect(holder.querySelector("a")).toBeNull();
		expect(holder.textContent).toBe(value); // осталось текстом, каким и было
	});

	// Внутри кода разметки нет вовсе — ссылка там такой же текст, как и звёздочки
	it("leaves a link inside code alone", () => {
		const holder = document.createElement("div");
		holder.innerHTML = parse("`[текст](https://example.com)`");

		expect(holder.querySelector("a")).toBeNull();
		expect(holder.querySelector("code")!.textContent).toBe("[текст](https://example.com)");
	});

	// Инструмент не объявлен — разметка остаётся текстом, как у любого снятого инструмента
	it("leaves the markup as text when the tool is not declared", () => {
		const tools: FormatTool[] = ["bold"];
		const holder = document.createElement("div");
		holder.innerHTML = parse("[текст](https://example.com)", tools);

		expect(holder.querySelector("a")).toBeNull();
		expect(holder.textContent).toBe("[текст](https://example.com)");
	});

	it("drops the wrapper of an undeclared link but keeps its text", () => {
		expect(build('<a href="https://example.com">текст</a>', ["bold"])).toBe("текст");
	});

	// Чистка разметки схлопывает соседние одинаковые теги. У ссылки тега мало: склеив соседние
	// с разными адресами, редактор потерял бы второй и ничего бы об этом не сказал.
	it("does not merge neighbouring links with different addresses", () => {
		const holder = document.createElement("div");
		document.body.appendChild(holder);
		holder.innerHTML = parse("[раз](https://a.example)[два](https://b.example)");

		cleanupFormatting(holder);

		const links = holder.querySelectorAll("a");
		expect(links).toHaveLength(2);
		expect(links[0].getAttribute("href")).toBe("https://a.example");
		expect(links[1].getAttribute("href")).toBe("https://b.example");
	});

	it("merges neighbouring links with the same address", () => {
		const holder = document.createElement("div");
		document.body.appendChild(holder);
		holder.innerHTML = '<a href="https://a.example">раз</a><a href="https://a.example">два</a>';

		cleanupFormatting(holder);

		expect(holder.querySelectorAll("a")).toHaveLength(1);
		expect(holder.textContent).toBe("раздва");
	});
});

describe("applying a link", () => {
	function editorWith(value: string) {
		document.body.innerHTML = "";
		const div = document.createElement("div");
		document.body.appendChild(div);

		return new RichEditor(div, { format: true, storage: "markdown", value });
	}

	// первый текстовый узел в глубину: содержимое ссылки лежит внутри её обёртки
	function firstText(root: Node): Text {
		let node: Node = root;
		while (node.firstChild) node = node.firstChild;

		return node as Text;
	}

	function select(editor: RichEditor, start: number, end: number) {
		const text = firstText(editor.editable);
		const selection = window.getSelection()!;
		const range = document.createRange();
		range.setStart(text, start);
		range.setEnd(text, end);
		selection.removeAllRanges();
		selection.addRange(range);
	}

	const caret = (editor: RichEditor, offset: number) => select(editor, offset, offset);

	it("wraps the selection", () => {
		const editor = editorWith("раз два");
		select(editor, 0, 3);

		editor.applyLink("https://example.com");

		expect(editor.getValue()).toBe("[раз](https://example.com) два");
	});

	// Правка ссылки — это смена адреса, а не вторая ссылка внутри первой
	it("changes the address of the link under the caret", () => {
		const editor = editorWith("[раз](https://a.example) два");
		caret(editor, 1);

		expect(editor.currentLink).toBe("https://a.example");
		editor.applyLink("https://b.example");

		expect(editor.getValue()).toBe("[раз](https://b.example) два");
		expect(editor.editable.querySelectorAll("a")).toHaveLength(1);
	});

	it("removes the link on an empty address", () => {
		const editor = editorWith("[раз](https://a.example) два");
		caret(editor, 1);

		editor.applyLink("");

		expect(editor.getValue()).toBe("раз два");
		expect(editor.editable.querySelector("a")).toBeNull();
	});

	// Ссылка — оформление текста, а не вставка: оборачивать нечего — и делать нечего
	it("does nothing when there is nothing to wrap", () => {
		const editor = editorWith("");
		const selection = window.getSelection()!;
		const range = document.createRange();
		range.selectNodeContents(editor.editable);
		range.collapse(false);
		selection.removeAllRanges();
		selection.addRange(range);

		expect(editor.isToolEnabled("link")).toBe(false);
		editor.applyLink("https://example.com");

		expect(editor.getValue()).toBe("");
	});

	// Формат применяется к слову целиком — значит и слово под кареткой есть что делать ссылкой
	it("links the whole word under the caret", () => {
		const editor = editorWith("раз два");
		caret(editor, 1);

		expect(editor.isToolEnabled("link")).toBe(true);
		editor.applyLink("https://example.com");

		expect(editor.getValue()).toBe("[раз](https://example.com) два");
	});

	// Править адрес готовой ссылки нужно той же кнопкой — иначе поменять его было бы нечем
	it("stays available with the caret inside a link", () => {
		const editor = editorWith("[раз](https://a.example) два");
		caret(editor, 1);

		expect(editor.isToolEnabled("link")).toBe(true);
	});

	it("reports no address outside a link", () => {
		const editor = editorWith("раз два");
		caret(editor, 5);

		expect(editor.currentLink).toBe("");
	});

	// applyFormat переключает, а у ссылки есть адрес — задать его переключением нечем
	it("is not applied by applyFormat", () => {
		const editor = editorWith("раз два");
		select(editor, 0, 3);

		editor.applyFormat("link");

		expect(editor.editable.querySelector("a")).toBeNull();
	});

	it("undoes the address change in one step", () => {
		const editor = editorWith("[раз](https://a.example) два");
		caret(editor, 1);

		editor.applyLink("https://b.example");
		expect(editor.canUndo).toBe(true);

		editor.undo();
		expect(editor.getValue()).toBe("[раз](https://a.example) два");
	});
});

describe("link address row", () => {
	// Панель одна на страницу и очистку body не замечает: недоведённая правка адреса осталась бы
	// включённой, и следующее нажатие по кнопке её бы выключило.
	let attached: RichEditor | null = null;
	afterEach(() => {
		if (attached) formatToolbar.detach(attached);
		attached = null;
	});

	// Кнопка доступна только когда есть что делать ссылкой, поэтому редактор сразу с выделением.
	function focusedEditor(value = "раз два", select: [number, number] = [0, 3]) {
		document.body.innerHTML = "";
		const div = document.createElement("div");
		document.body.appendChild(div);
		// jsdom не считает contenteditable фокусируемым — без tabindex поле не станет активным,
		// а вместе с этим не сработают ни releaseFocus, ни blur, на которых всё и ломалось
		div.tabIndex = 0;
		const editor = new RichEditor(div, { format: true, storage: "markdown", value });
		div.focus();

		let node: Node = editor.editable;
		while (node.firstChild) node = node.firstChild;
		const selection = window.getSelection()!;
		const range = document.createRange();
		range.setStart(node, select[0]);
		range.setEnd(node, select[1]);
		selection.removeAllRanges();
		selection.addRange(range);

		editor.editable.dispatchEvent(new FocusEvent("focus"));
		attached = editor;

		return editor;
	}

	const toolbar = () => document.querySelector<HTMLElement>(`.${TOOLBAR_CLASS}`)!;

	const linkButton = () =>
		document.querySelector<HTMLButtonElement>(`.${TOOLBAR_CLASS} .format-button[data-format-tool="link"]`)!;
	const row = () => document.querySelector<HTMLElement>(`.${TOOLBAR_CLASS} .${LINK_ROW_CLASS}`);
	const editing = () => toolbar().classList.contains(LINK_EDITING_CLASS);
	const input = () => row()!.querySelector<HTMLInputElement>(".link-input")!;

	it("has a button in the toolbar", () => {
		focusedEditor();

		expect(linkButton()).not.toBeNull();
		expect(linkButton().disabled).toBe(false);
	});

	// Ссылка — оформление текста: делать нечего — и кнопке гореть не за чем
	it("disables the button when there is nothing to link", () => {
		focusedEditor("", [0, 0]);

		expect(linkButton().disabled).toBe(true);
	});

	it("does not switch to the address from a disabled button", () => {
		focusedEditor("", [0, 0]);

		linkButton().click();

		expect(editing()).toBe(false);
	});

	// Правка адреса занимает место панели: кнопки уходят, поле встаёт на их место, а сама панель
	// остаётся на экране — отпущенный ради поля фокус её не уносит.
	it("shows the address in place of the buttons", () => {
		const editor = focusedEditor();
		expect(editor.editable.ownerDocument.activeElement).toBe(editor.editable);

		linkButton().click();

		expect(editing()).toBe(true);
		expect(toolbar().classList.contains("visible")).toBe(true);
		// строка адреса лежит в коробке панели — она её часть, а не слой над ней
		expect(row()!.parentElement).toBe(toolbar().querySelector(`.${BODY_CLASS}`));
	});

	// повторное нажатие по кнопке возвращает кнопки
	it("switches back to the buttons on a second press", () => {
		focusedEditor();

		linkButton().click();
		expect(editing()).toBe(true);

		linkButton().click();
		expect(editing()).toBe(false);
	});

	// Ушли мимо панели — правку бросили: держаться ей больше не на чем, фокус она отпустила
	// как раз ради этого поля
	it("lets the toolbar go when the focus leaves it", () => {
		focusedEditor();
		linkButton().click();

		input().dispatchEvent(new FocusEvent("blur", { relatedTarget: document.body }));

		expect(editing()).toBe(false);
		expect(toolbar().classList.contains("visible")).toBe(false);
	});

	// Esc — отказ от правки: каретка возвращается туда, где её взяли, панель остаётся
	it("returns the caret on Escape", () => {
		const editor = focusedEditor();

		linkButton().click();
		input().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));

		expect(editing()).toBe(false);
		expect(editor.editable.ownerDocument.activeElement).toBe(editor.editable);
		expect(editor.caretSnapshot()).toEqual([0, 3]);
		expect(toolbar().classList.contains("visible")).toBe(true);
	});

	it("opens on the button with the address of the current link", () => {
		focusedEditor("[раз](https://a.example) два", [1, 1]);

		linkButton().click();

		expect(editing()).toBe(true);
		expect(input().value).toBe("https://a.example");
		// снимать есть что — кнопка на месте
		expect(row()!.querySelector<HTMLElement>(".link-remove")!.hidden).toBe(false);
	});

	it("offers nothing to remove outside a link", () => {
		focusedEditor();
		linkButton().click();

		expect(input().value).toBe("");
		expect(row()!.querySelector<HTMLElement>(".link-remove")!.hidden).toBe(true);
	});

	it("applies the address by Enter", () => {
		const editor = focusedEditor();

		linkButton().click();
		input().value = "https://example.com";
		input().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));

		expect(editor.getValue()).toBe("[раз](https://example.com) два");
		expect(editing()).toBe(false);
	});

	// Панель гасит фокус на всём, иначе редактор терял бы выделение. Поле адреса — исключение:
	// набирать в нём без фокуса негде, а каретка к этому моменту уже снята.
	it("lets only its input take the focus", () => {
		focusedEditor();
		linkButton().click();

		const apply = row()!.querySelector<HTMLElement>(".link-apply")!;
		const onApply = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
		apply.dispatchEvent(onApply);
		expect(onApply.defaultPrevented).toBe(true);

		const onInput = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
		input().dispatchEvent(onInput);
		expect(onInput.defaultPrevented).toBe(false);
	});

	// Фокус ушёл в поле адреса — выделение редактора вместе с ним. Правится по снятой каретке.
	it("applies the address after the editor released the focus", () => {
		const editor = focusedEditor();

		linkButton().click();
		expect(editor.editable.ownerDocument.activeElement).toBe(input()); // фокус в поле адреса

		input().value = "https://example.com";
		row()!.querySelector<HTMLElement>(".link-apply")!.click();

		expect(editor.getValue()).toBe("[раз](https://example.com) два");
	});

	// панель уходит вместе с редактором — и уносит с собой незаконченную правку адреса
	it("ends the editing when the toolbar detaches", () => {
		const editor = focusedEditor();
		linkButton().click();
		expect(editing()).toBe(true);

		formatToolbar.detach(editor);

		expect(editing()).toBe(false);
		expect(toolbar().classList.contains("visible")).toBe(false);
	});
});

// Текст ссылки в разметке — один сплошной кусок: разорванная переносом ссылка ею не выражается
// и с разбора не вернётся. Поэтому перенос из ссылки выводит, а не рвёт её пополам.
describe("a link never spans a line break", () => {
	function pressEnter(mode: "break" | "block", value: string, offset: number) {
		document.body.innerHTML = "";
		const div = document.createElement("div");
		div.tabIndex = 0;
		document.body.appendChild(div);
		const editor = new RichEditor(div, {
			format: true,
			multiline: true,
			paragraph: mode,
			storage: "markdown",
			value,
		});

		const text = editor.editable.querySelector("a")!.firstChild!;
		const selection = window.getSelection()!;
		const range = document.createRange();
		range.setStart(text, offset);
		range.collapse(true);
		selection.removeAllRanges();
		selection.addRange(range);

		editor.editable.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));

		return editor;
	}

	// продолжения на новой строке не оставляем: адрес у ссылки один, и вторая с тем же адресом
	// появилась бы сама собой, хотя её никто не заводил
	it("leaves the link on Enter, keeping the tail as plain text", () => {
		const editor = pressEnter("break", "[раз два](https://a.example)", 3);

		expect(editor.editable.querySelectorAll("a")).toHaveLength(1);
		expect(editor.editable.querySelector("a")!.textContent).toBe("раз");
		expect(editor.editable.querySelector("a br")).toBeNull();
		expect(editor.getValue()).toBe("[раз](https://a.example)\n два");
	});

	it("does the same when Enter starts a new paragraph", () => {
		const editor = pressEnter("block", "[раз два](https://a.example)", 3);

		expect(editor.editable.querySelectorAll("a")).toHaveLength(1);
		expect(editor.getValue()).toBe("[раз](https://a.example)\n\n два");
	});

	// каретка в самом конце ссылки — за перенос уходит уже обычный текст, ссылка не удваивается
	it("does not carry the link past a break made at its end", () => {
		const editor = pressEnter("break", "[раз](https://a.example) хвост", 3);

		expect(editor.editable.querySelectorAll("a")).toHaveLength(1);
		expect(editor.getValue()).toBe("[раз](https://a.example)\n хвост");
	});

	// разбор держит ту же границу, что и маркеры: конструкция не пересекает строку
	it("does not read a link whose text crosses a line", () => {
		const holder = document.createElement("div");
		holder.innerHTML = parse("[раз\nдва](https://a.example)");

		expect(holder.querySelector("a")).toBeNull();
	});

	// перенос мог приехать вставкой чужого HTML — ссылки из него не выйдет, но текст остаётся
	it("drops a link that came with a break inside", () => {
		expect(build('<a href="https://a.example">раз<br>два</a>')).toBe("раз\nдва");
	});
});

describe("link address safety", () => {
	// Адрес исполняемой схемы — это код, приехавший вместе со значением
	it.each([
		["javascript", "javascript:alert(1)"],
		["данные", "data:text/html,<script>alert(1)</script>"],
		["vbscript", "vbscript:msgbox(1)"],
		// пробелы и переводы строк браузер из схемы выбрасывает — проверка обязана делать так же
		["javascript с табом", "java\tscript:alert(1)"],
	])("makes no link for %s", (_name, url) => {
		const holder = document.createElement("div");
		holder.innerHTML = parse(`[текст](${url})`);

		expect(holder.querySelector("a")).toBeNull();
	});

	it("strips an unsafe address that reached the DOM another way", () => {
		expect(build('<a href="javascript:alert(1)">текст</a>')).toBe("текст");
	});

	it("keeps a quote in the address from breaking the attribute", () => {
		const holder = document.createElement("div");
		holder.innerHTML = parse('[текст](https://example.com/?q=")');

		expect(holder.querySelector("a")!.getAttribute("href")).toBe('https://example.com/?q="');
	});
});
