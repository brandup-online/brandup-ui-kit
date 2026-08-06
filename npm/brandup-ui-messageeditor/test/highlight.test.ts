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
	// переменные подсвечиваются только при включённой персонализации
	return new MessageEditor(input, { personalization: true });
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
	it.each([[{ key: "ИМЯ", name: "Имя клиента" }], [{ key: "ИМЯ" }]])(
		"keeps the caret on the left side of %j",
		(variable) => {
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
		}
	);

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

// Перестройка разметки пересобирает обёртки всего текста и заставляет возвращать каретку
// по смещениям. Печать рядом с конструкцией давала это на каждый символ.
describe("MessageEditor highlighting is idempotent", () => {
	const editableOf = (editor: MessageEditor) => editor.editor.editable;
	const type = (editor: MessageEditor) => editableOf(editor).dispatchEvent(new Event("input", { bubbles: true }));

	it("keeps the same wrappers when nothing changed", () => {
		const editor = setup("Привет, {ИМЯ} и [раз|два]");
		const before = Array.from(editableOf(editor).querySelectorAll("span"));

		type(editor);

		expect(Array.from(editableOf(editor).querySelectorAll("span"))).toEqual(before);
	});

	it("wraps a construct completed by typing", () => {
		const editor = setup("Привет, {ИМЯ");
		expect(editableOf(editor).querySelector("span.variable")).toBeNull();

		editableOf(editor).firstElementChild!.append("}");
		type(editor);

		expect(editableOf(editor).querySelector("span.variable")!.textContent).toBe("{ИМЯ}");
	});

	// правка вставляет соседние текстовые узлы — конструкция может оказаться разорванной
	it("wraps a construct split across adjacent text nodes", () => {
		const editor = setup("Привет, {ИМ");
		const block = editableOf(editor).firstElementChild!;
		block.appendChild(document.createTextNode("Я}"));

		type(editor);

		expect(block.querySelector("span.variable")!.textContent).toBe("{ИМЯ}");
	});

	it("unwraps a construct broken by an edit", () => {
		const editor = setup("Привет, {ИМЯ}");
		const span = editableOf(editor).querySelector("span.variable")!;
		span.textContent = "{ИМЯ";

		type(editor);

		expect(editableOf(editor).querySelector("span.variable")).toBeNull();
		expect(editor.getValue()).toBe("Привет, {ИМЯ");
	});
});

// Конструкция неделима: разметка обязана оборачивать её целиком, иначе вместо
// **test test {ИМЯ} test** в значение уходит **test test** **{ИМЯ}** **test**.
describe("MessageEditor formatting over constructs", () => {
	const selectAll = (editor: MessageEditor) => {
		const selection = window.getSelection()!;
		const range = document.createRange();
		range.selectNodeContents(editor.editor.editable.firstElementChild!);
		selection.removeAllRanges();
		selection.addRange(range);

		return selection;
	};

	it.each([["test test {ИМЯ} test"], ["test [раз|два] test"]])("wraps %j in one pair of markers", (value) => {
		const editor = setup(value);
		selectAll(editor);

		editor.editor.applyFormat("bold");

		expect(editor.getValue()).toBe(`**${value}**`);
	});

	it("does not put markup inside a construct", () => {
		const editor = setup("test {ИМЯ} test");
		selectAll(editor);

		editor.editor.applyFormat("bold");

		expect(editor.editor.editable.querySelector("span.variable b")).toBeNull();
		expect(editor.editor.editable.querySelectorAll("b")).toHaveLength(1);
	});

	it("removes the format from the construct too", () => {
		const editor = setup("test {ИМЯ} test");
		selectAll(editor);

		editor.editor.applyFormat("bold");
		selectAll(editor);
		editor.editor.applyFormat("bold");

		expect(editor.getValue()).toBe("test {ИМЯ} test");
	});
});

// Конструкция не редактируется, и каретку сразу за ней браузер рисует, только если там есть
// текст. Иначе стоять после неё негде: каретка уезжает в начало строки, и дописать за
// вставленной переменной становится нечем — а вставляют её как раз в пустое поле.
describe("caret behind a construct", () => {
	// Неснятый компонент остаётся подписанным на уход своего элемента из DOM, а разборка
	// jsdom дёргает эту подписку, когда окружения уже нет.
	const alive: MessageEditor[] = [];
	afterEach(() => {
		alive.forEach((editor) => editor.destroy());
		alive.length = 0;
	});

	function empty() {
		document.body.innerHTML = "";
		const form = document.createElement("form");
		const input = document.createElement("textarea");
		form.appendChild(input);
		document.body.appendChild(form);

		const editor = new MessageEditor(input, { variables: [{ key: "ИМЯ" }] });
		editor.editor.editable.tabIndex = 0; // jsdom не отдаёт фокус голому contenteditable
		editor.editor.focus();
		alive.push(editor);

		return { editor, input };
	}

	it("leaves the caret somewhere to stand after a construct that ends the line", () => {
		const { editor } = empty();

		editor.editor.insertText("{ИМЯ}");

		const span = editor.editor.editable.querySelector("span.variable")!;
		expect(span.nextSibling?.nodeType).toBe(Node.TEXT_NODE);

		// каретка вне конструкции — в том самом узле за ней
		const selection = window.getSelection()!;
		expect(span.contains(selection.anchorNode)).toBe(false);
		expect(selection.anchorNode).toBe(span.nextSibling);
	});

	// опору никто не набирал — сообщению она не нужна ни в значении, ни в поле формы
	it("keeps the anchor out of the value", () => {
		const { editor, input } = empty();

		editor.editor.insertText("{ИМЯ}");

		expect(editor.getValue()).toBe("{ИМЯ}");
		expect(input.value).toBe("{ИМЯ}");
	});

	it("lets the text be continued right after the construct", () => {
		const { editor } = empty();

		editor.editor.insertText("{ИМЯ}");
		editor.editor.insertText("!");

		expect(editor.getValue()).toBe("{ИМЯ}!");
	});

	// за конструкцией уже есть текст — второй опоры не нужно
	it("does not add a second anchor on a rebuild", () => {
		const { editor } = empty();
		const editable = editor.editor.editable;

		editor.editor.insertText("{ИМЯ}");
		editable.dispatchEvent(new Event("input", { bubbles: true }));
		editable.dispatchEvent(new Event("input", { bubbles: true }));

		expect(editable.textContent).toBe("{ИМЯ}​");
	});
});
