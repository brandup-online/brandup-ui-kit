/**
 * @jest-environment jsdom
 */
import { formatToolbar, selectionCharBounds } from "@brandup/ui-richeditor";
import MessageEditor from "../source/messageeditor";
import { buildSpintax, parseSpintax } from "../source/randomizer";
import { buildVariable } from "../source/variables";

function setup(value = "") {
	document.body.innerHTML = "";
	const form = document.createElement("form");
	const input = document.createElement("textarea");
	input.value = value;
	form.appendChild(input);
	document.body.appendChild(form);
	return new MessageEditor(input);
}

describe("MessageEditor highlighting", () => {
	// Обёртки подсветки — обычные <span>, редактор их не знает и отбрасывает при сериализации.
	// Если это сломается, разметка полезет в отправляемое сообщение.
	it.each([
		["Привет, {ИМЯ}!", 1, 0],
		["Скидка [10|15] процентов", 0, 1],
		["{А} и [раз|два] вместе", 1, 1],
		["обычный текст", 0, 0],
		["[без разделителя]", 0, 0], // спинтакс без | вариантов не содержит
		["{нельзя\nчерез строку}", 0, 0],
	])("wraps %j without touching the value", (value, variables, spintax) => {
		const editor = setup(value as string);

		expect(editor.editor.editable.querySelectorAll("span.variable")).toHaveLength(variables as number);
		expect(editor.editor.editable.querySelectorAll("span.spintax")).toHaveLength(spintax as number);
		expect(editor.getValue()).toBe(value);
	});

	// В тексте показывается название переменной, но ключ обязан остаться: из него собирается
	// значение. Поэтому название рисуется оформлением, а ключ лишь прячется.
	it("shows the title of a variable while keeping its key in the text", () => {
		document.body.innerHTML = "";
		const form = document.createElement("form");
		const input = document.createElement("textarea");
		input.value = "Привет, {ИМЯ} и {ГОРОД}!";
		form.appendChild(input);
		document.body.appendChild(form);

		const editor = new MessageEditor(input, {
			variables: [{ key: "ИМЯ", name: "Имя подписчика" }, { key: "ГОРОД" }],
		});

		const spans = editor.editor.editable.querySelectorAll<HTMLElement>("span.variable");
		expect(spans).toHaveLength(2);

		// с названием: на экран уходит оно — в скобках, как и ключ, — а ключ спрятан в обёртке
		expect(spans[0].getAttribute("data-label")).toBe("{Имя подписчика}");
		expect(spans[0].querySelector(".key")!.textContent).toBe("{ИМЯ}");
		expect(spans[0].textContent).toBe("{ИМЯ}");

		// без названия — как было, ключ прямо в обёртке
		expect(spans[1].getAttribute("data-label")).toBeNull();
		expect(spans[1].querySelector(".key")).toBeNull();

		expect(editor.getValue()).toBe("Привет, {ИМЯ} и {ГОРОД}!");
	});

	// перестройка подсветки разворачивает прежние обёртки — вложенный ключ не должен остаться узлом
	it("rebuilds a titled variable without leaving its key wrapper behind", () => {
		document.body.innerHTML = "";
		const form = document.createElement("form");
		const input = document.createElement("textarea");
		input.value = "{ИМЯ}";
		form.appendChild(input);
		document.body.appendChild(form);

		const editor = new MessageEditor(input, { variables: [{ key: "ИМЯ", name: "Имя" }] });
		const editable = editor.editor.editable;

		const text = editable.querySelector("p")!;
		const selection = window.getSelection()!;
		const range = document.createRange();
		range.selectNodeContents(text);
		range.collapse(false);
		selection.removeAllRanges();
		selection.addRange(range);

		editor.editor.insertText("!");

		expect(editable.querySelectorAll("span.variable")).toHaveLength(1);
		expect(editable.querySelectorAll(".key")).toHaveLength(1);
		expect(editor.getValue()).toBe("{ИМЯ}!");
	});

	// Каретку выносит из конструкции наружу — с того края, с которого она в неё попала.
	// У переменной с названием текст лежит глубже, в обёртке ключа, и край легко перепутать:
	// тогда каретка перед конструкцией перепрыгивала бы её.
	it.each([
		[{ key: "ИМЯ", name: "Имя клиента" }],
		[{ key: "ИМЯ" }],
	])("keeps the caret on the left side of %j", (variable) => {
		document.body.innerHTML = "";
		const form = document.createElement("form");
		const input = document.createElement("textarea");
		input.value = "{ИМЯ} дальше"; // конструкция первая — слева от неё текста нет
		form.appendChild(input);
		document.body.appendChild(form);

		const editor = new MessageEditor(input, { variables: [variable] });
		const editable = editor.editor.editable;

		let first: Node = editable.querySelector("span.variable")!;
		while (first.firstChild) first = first.firstChild;

		const selection = window.getSelection()!;
		const range = document.createRange();
		range.setStart(first, 0);
		range.collapse(true);
		selection.removeAllRanges();
		selection.addRange(range);

		editable.dispatchEvent(new Event("input", { bubbles: true })); // перестройка выносит каретку

		const span = editable.querySelector("span.variable")!; // узлы пересобраны
		expect(span.contains(window.getSelection()!.anchorNode)).toBe(false);
		expect(selectionCharBounds(editable, window.getSelection()!.getRangeAt(0))).toEqual([0, 0]);
	});

	// Текст от подсветки не меняется, поэтому смещения каретки совпадают точно
	it("keeps the caret when a construct becomes complete", () => {
		const editor = setup("Привет, {ИМЯ");
		const editable = editor.editor.editable;
		const text = editable.querySelector("p")!.lastChild as Text;

		const selection = window.getSelection()!;
		const range = document.createRange();
		range.setStart(text, text.data.length);
		range.collapse(true);
		selection.removeAllRanges();
		selection.addRange(range);

		editor.editor.insertText("}");

		expect(editable.querySelectorAll("span.variable")).toHaveLength(1);
		expect(selectionCharBounds(editable, selection.getRangeAt(0))).toEqual([13, 13]);
	});

	// событие изменения при печати троттлится, а подсветка ждать не должна:
	// конструкция обязана подсветиться сразу, как дописана закрывающая скобка
	it("highlights on typing without waiting for the change event", () => {
		jest.useFakeTimers();
		try {
			const editor = setup("");
			const editable = editor.editor.editable;

			editable.textContent = "Привет, {ИМЯ}!";
			editable.dispatchEvent(new Event("input", { bubbles: true }));

			expect(editable.querySelectorAll("span.variable")).toHaveLength(1);
		} finally {
			jest.useRealTimers();
		}
	});

	// Обёртки строятся заново из новых текстовых узлов, поэтому прежнее выделение на них
	// уже не указывает. Подсветка повторяется и без правки текста (ввод и отложенное change),
	// и каретка обязана пережить такую перестройку.
	it("keeps the caret when the markup is rebuilt unchanged", () => {
		const editor = setup("Привет, {ИМЯ}!");
		const editable = editor.editor.editable;

		const selection = window.getSelection()!;
		const range = document.createRange();
		range.setStart(editable.querySelector("span.variable")!.previousSibling!, 3);
		range.collapse(true);
		selection.removeAllRanges();
		selection.addRange(range);

		editable.dispatchEvent(new Event("input", { bubbles: true })); // текст тот же

		expect(editable.contains(window.getSelection()!.anchorNode)).toBe(true);
		expect(selectionCharBounds(editable, window.getSelection()!.getRangeAt(0))).toEqual([3, 3]);
	});

	it("rebuilds the markup when the text stops matching", () => {
		const editor = setup("{ИМЯ}");
		expect(editor.editor.editable.querySelectorAll("span.variable")).toHaveLength(1);

		editor.setValue("ИМЯ");

		expect(editor.editor.editable.querySelector("span")).toBeNull();
		expect(editor.getValue()).toBe("ИМЯ");
	});
});

describe("MessageEditor markup helpers", () => {
	it("builds spintax only when there is a choice", () => {
		expect(buildSpintax(["раз", "два"])).toBe("[раз|два]");
		expect(buildSpintax(["раз"])).toBe("раз");
	});

	it("parses an existing spintax back into variants", () => {
		expect(parseSpintax("[раз|два]")).toEqual(["раз", "два"]);
		expect(parseSpintax("слово")).toEqual(["слово"]);
		expect(parseSpintax("[без разделителя]")).toEqual(["[без разделителя]"]);
		expect(parseSpintax("  ")).toEqual([]);
	});

	it("wraps a variable name", () => {
		expect(buildVariable("ИМЯ")).toBe("{ИМЯ}");
	});
});

describe("MessageEditor markup is atomic", () => {
	const setupEditor = (value: string) => {
		document.body.innerHTML = "";
		const form = document.createElement("form");
		const input = document.createElement("textarea");
		input.value = value;
		form.appendChild(input);
		document.body.appendChild(form);
		return new MessageEditor(input, { variables: [{ key: "ИМЯ" }] });
	};

	const caretInside = (editor: MessageEditor, selector: string) => {
		const span = editor.editor.editable.querySelector(selector)!;
		const selection = window.getSelection()!;
		const range = document.createRange();
		range.setStart(span.firstChild!, 1);
		range.collapse(true);
		selection.removeAllRanges();
		selection.addRange(range);
	};

	// текст конструкции не правится в поле — только через своё окно
	it.each([["span.variable"], ["span.spintax"]])("marks %s as not editable", (selector) => {
		const editor = setupEditor("{ИМЯ} и [раз|два]");

		expect(editor.editor.editable.querySelector(selector)!.getAttribute("contenteditable")).toBe("false");
	});

	// вкладывать конструкции друг в друга нельзя — кнопки панели гаснут
	it("disables the toolbar buttons while the caret is inside a construct", () => {
		const editor = setupEditor("{ИМЯ} снаружи");
		editor.editor.editable.dispatchEvent(new FocusEvent("focus"));

		const button = (name: string) =>
			editor.element.querySelector<HTMLButtonElement>(`[data-toolbar-button="${name}"]`)!;

		caretInside(editor, "span.variable");
		formatToolbar.refresh(); // как по движению каретки; правкой обновлять нельзя — она выносит каретку наружу
		expect(button("variable").disabled).toBe(true);
		expect(button("randomize").disabled).toBe(true);
	});
});
