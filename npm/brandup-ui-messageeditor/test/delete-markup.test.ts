/**
 * @jest-environment jsdom
 */
import MessageEditor, { type MessageEditorOptions } from "../source/messageeditor";

function setup(value: string, options: MessageEditorOptions = {}) {
	document.body.innerHTML = "";
	const form = document.createElement("form");
	const input = document.createElement("textarea");
	input.value = value;
	form.appendChild(input);
	document.body.appendChild(form);

	const editor = new MessageEditor(input, { variables: [{ key: "ИМЯ" }], ...options });
	editor.editor.editable.tabIndex = 0; // jsdom не отдаёт фокус голому contenteditable

	return { editor, input, editable: editor.editor.editable };
}

function caretAt(node: Node, offset: number) {
	const selection = window.getSelection()!;
	const range = document.createRange();
	range.setStart(node, offset);
	range.collapse(true);
	selection.removeAllRanges();
	selection.addRange(range);
}

function press(editor: MessageEditor, key: string, modifier?: KeyboardEventInit) {
	const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...modifier });
	editor.editor.editable.dispatchEvent(event);

	return event;
}

/** Каретка сразу за конструкцией — там, куда её ставит подсветка (в опоре за ней). */
function caretBehind(editable: HTMLElement, selector = "span.variable") {
	const span = editable.querySelector<HTMLElement>(selector)!;
	const next = span.nextSibling!;

	caretAt(next, 0);

	return span;
}

// Конструкция неделима: стереть в ней символ нельзя, а нативное удаление рядом с
// нередактируемым элементом браузеры делают по-разному. Вдобавок за конструкцией в конце строки
// стоит невидимая опора каретки — нажатие уходило бы на неё, а её тут же возвращает подсветка:
// набранную с клавиатуры переменную не удавалось стереть вовсе.
describe("deleting a construct with the keyboard", () => {
	it("removes a variable that ends the line, with its caret anchor", () => {
		const { editor, input, editable } = setup("Привет, {ИМЯ}");
		caretBehind(editable);

		expect(press(editor, "Backspace").defaultPrevented).toBe(true);

		expect(editable.querySelector("span.variable")).toBeNull();
		expect(editable.textContent).toBe("Привет, "); // опора ушла вместе с конструкцией
		expect(editor.getValue()).toBe("Привет,"); // нормализация срезает краевой пробел значения
		expect(input.value).toBe("Привет,");
	});

	// Опора невидима, и каретка стоит то перед ней, то за ней — стирать конструкцию обязаны обе
	// позиции: иначе нажатие уходит впустую, а пользователь видит, что клавиша не работает.
	it("removes it from behind the caret anchor too", () => {
		const { editor, editable } = setup("{ИМЯ}");
		const span = editable.querySelector<HTMLElement>("span.variable")!;
		const anchor = span.nextSibling as Text;
		caretAt(anchor, anchor.data.length);

		press(editor, "Backspace");

		expect(editable.querySelector("span.variable")).toBeNull();
		expect(editor.getValue()).toBe("");
	});

	it("removes a variable in the middle of the text", () => {
		const { editor, editable } = setup("Привет, {ИМЯ} и всё");
		const span = editable.querySelector<HTMLElement>("span.variable")!;
		caretAt(span.nextSibling!, 0);

		press(editor, "Backspace");

		expect(editable.querySelector("span.variable")).toBeNull();
		expect(editor.getValue()).toBe("Привет,  и всё");
	});

	// Позиция каретки выражается двояко: узлом текста и местом в родителе. Второе даёт
	// и клик мимо текста, и возврат каретки по смещениям в конец строки.
	it("removes it when the caret is a position in the line, not in a text node", () => {
		const { editor, editable } = setup("{ИМЯ}");
		const line = editable.querySelector("p")!;
		caretAt(line, line.childNodes.length); // конец строки: за конструкцией и её опорой

		press(editor, "Backspace");

		expect(editable.querySelector("span.variable")).toBeNull();
		expect(editor.getValue()).toBe("");
	});

	it("removes a spintax the same way", () => {
		const { editor, editable } = setup("Дарим [скидку|подарок]");
		caretBehind(editable, "span.spintax");

		press(editor, "Backspace");

		expect(editable.querySelector("span.spintax")).toBeNull();
		expect(editor.getValue()).toBe("Дарим");
	});

	// Delete — то же самое с другой стороны: каретка перед конструкцией
	it("removes the construct in front of the caret on Delete", () => {
		const { editor, editable } = setup("Привет, {ИМЯ}!");
		const span = editable.querySelector<HTMLElement>("span.variable")!;
		caretAt(span.previousSibling!, "Привет, ".length);

		expect(press(editor, "Delete").defaultPrevented).toBe(true);

		expect(editable.querySelector("span.variable")).toBeNull();
		expect(editor.getValue()).toBe("Привет, !");
	});

	// каретка внутри конструкции бывает после клика по ней: стирается она целиком, по частям её
	// не правят
	it("removes the construct the caret stands in", () => {
		const { editor, editable } = setup("{ИМЯ}!");
		const span = editable.querySelector<HTMLElement>("span.variable")!;
		caretAt(span.childNodes[1], 2); // первый узел конструкции — обёртка скобки, за ней ключ

		press(editor, "Backspace");

		expect(editable.querySelector("span.variable")).toBeNull();
		expect(editor.getValue()).toBe("!");
	});

	// Конструкция может лежать внутри оформления: опустевший тег обязан уйти вместе с ней,
	// иначе в значение уедут его маркеры без единого символа между ними.
	it("removes the emptied formatting around it", () => {
		const { editor, editable } = setup("**{ИМЯ}**");
		expect(editable.querySelector("b span.variable")).not.toBeNull();

		caretBehind(editable);
		press(editor, "Backspace");

		expect(editable.querySelector("b")).toBeNull();
		expect(editor.getValue()).toBe("");
	});

	// удаление можно отменить — правка проходит через историю редактора, как своя
	it("puts the construct back on undo", () => {
		const { editor, editable } = setup("Привет, {ИМЯ}");
		caretBehind(editable);

		press(editor, "Backspace");
		editor.editor.undo();

		expect(editable.querySelector("span.variable")).not.toBeNull();
		expect(editor.getValue()).toBe("Привет, {ИМЯ}");
	});

	// между кареткой и конструкцией есть набранное — его и стирает браузер, как обычно
	it("leaves an ordinary deletion to the browser", () => {
		const { editor, editable } = setup("Привет, {ИМЯ} и всё");
		const span = editable.querySelector<HTMLElement>("span.variable")!;
		caretAt(span.nextSibling!, 2);

		expect(press(editor, "Backspace").defaultPrevented).toBe(false);
		expect(editable.querySelector("span.variable")).not.toBeNull();
	});

	// удаление словами и строками — правка текста вокруг, а не самой конструкции
	it.each([[{ ctrlKey: true }], [{ altKey: true }], [{ metaKey: true }]])("leaves %j deletion alone", (modifier) => {
		const { editor, editable } = setup("Привет, {ИМЯ}");
		caretBehind(editable);

		expect(press(editor, "Backspace", modifier).defaultPrevented).toBe(false);
		expect(editable.querySelector("span.variable")).not.toBeNull();
	});

	it.each([["readonly"], ["disabled"]])("changes nothing in %s", (state) => {
		document.body.innerHTML = "";
		const form = document.createElement("form");
		const input = document.createElement("textarea");
		input.value = "{ИМЯ}";
		input.setAttribute(state, state);
		form.appendChild(input);
		document.body.appendChild(form);

		const editor = new MessageEditor(input, { variables: [{ key: "ИМЯ" }] });
		const span = editor.editor.editable.querySelector<HTMLElement>("span.variable")!;
		caretAt(span.nextSibling ?? span.parentNode!, 0);

		press(editor, "Backspace");

		expect(editor.editor.editable.querySelector("span.variable")).not.toBeNull();
		expect(editor.getValue()).toBe("{ИМЯ}");
	});

	// стёрли последнее, что было в поле, — заглушка обязана вернуться, а поле остаться рабочим:
	// каретке после очистки места нет нигде, кроме самого корня
	it("brings the placeholder back when the construct was all there was", () => {
		const { editor, editable } = setup("{ИМЯ}");
		caretBehind(editable);

		press(editor, "Backspace");

		expect(editable.textContent).toBe("");
		expect(editable.children).toHaveLength(0);
		expect(editor.getValue()).toBe("");

		// набранное следом ложится в абзац, а не мимо абзацной модели
		editor.editor.insertText("привет");

		expect(editable.querySelectorAll("p")).toHaveLength(1);
		expect(editor.getValue()).toBe("привет");
	});

	// подпись невалидности снимается той же правкой: неизвестной переменной в поле больше нет
	it("clears the unknown variable error", () => {
		const { editor, editable, input } = setup("{ЧУЖАЯ}");
		expect(editor.validate()).toBe(false);

		caretBehind(editable);
		press(editor, "Backspace");

		expect(editor.unknownVariables).toEqual([]);
		expect(editor.validate()).toBe(true);
		expect(input.validity.customError).toBe(false);
	});
});
