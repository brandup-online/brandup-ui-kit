/**
 * @jest-environment jsdom
 */
import { selectionCharBounds } from "@brandup/ui-richeditor";
import MessageEditor, { type MessageEditorOptions } from "../source/messageeditor";

function setup(value: string, options: MessageEditorOptions = {}) {
	document.body.innerHTML = "";
	const form = document.createElement("form");
	const input = document.createElement("textarea");
	input.value = value;
	form.appendChild(input);
	document.body.appendChild(form);

	return { editor: new MessageEditor(input, options), input };
}

function caretAt(node: Node, offset: number) {
	const selection = window.getSelection()!;
	const range = document.createRange();
	range.setStart(node, offset);
	range.collapse(true);
	selection.removeAllRanges();
	selection.addRange(range);
}

const declared: MessageEditorOptions = { variables: [{ key: "ИМЯ", name: "Имя клиента" }, { key: "ГОРОД" }] };

// Переменную набирают и вставляют с экрана — тем, что видно, а видно название. Само по себе
// оно подставить нечем: в сообщение уходит ключ, и получателю такая переменная ушла бы скобками
// наружу. Поэтому написанное название приводится к ключу — сразу, пока пишущий видит результат.
describe("variables written by name", () => {
	it("maps a name in the initial value", () => {
		const { editor, input } = setup("Привет, {Имя клиента}!", declared);
		const span = editor.editor.editable.querySelector<HTMLElement>("span.variable")!;

		expect(editor.getValue()).toBe("Привет, {ИМЯ}!");
		expect(input.value).toBe("Привет, {ИМЯ}!"); // в форму уходит то же, что и наружу
		expect(span.textContent).toBe("{ИМЯ}");
		// на экране название — оно и было набрано
		expect(span.querySelector<HTMLElement>(".label")!.dataset.label).toBe("Имя клиента");
		expect(span.classList.contains("unknown")).toBe(false);
		expect(editor.unknownVariables).toEqual([]);
	});

	it("maps a name completed by typing and leaves the caret behind the construct", () => {
		const { editor } = setup("Привет, {Имя клиента", declared);
		const editable = editor.editor.editable;
		const text = editable.querySelector("p")!.lastChild as Text;

		editor.editor.focus();
		caretAt(text, text.data.length);
		editor.editor.insertText("}");

		expect(editor.getValue()).toBe("Привет, {ИМЯ}");
		expect(editable.querySelectorAll("span.variable")).toHaveLength(1);

		// каретка за конструкцией: подмена короче написанного, и смещение обязано сдвинуться
		const selection = window.getSelection()!;
		expect(selectionCharBounds(editable, selection.getRangeAt(0))).toEqual([13, 13]);
	});

	// Замен в одном узле бывает несколько, и каждая короче написанного: смещение каретки
	// сдвигается на сумму разниц, иначе она уезжает тем дальше, чем больше подменили до неё.
	it("keeps the caret after several names mapped in one line", () => {
		const { editor } = setup("{Имя клиента} и {Имя клиента}, привет", declared);
		const editable = editor.editor.editable;

		expect(editor.getValue()).toBe("{ИМЯ} и {ИМЯ}, привет");

		// каретка в конце текста переживает подмену на своём месте
		const tail = editable.querySelector("p")!.lastChild as Text;
		caretAt(tail, tail.data.length);
		editor.editor.insertText("!");

		expect(editor.getValue()).toBe("{ИМЯ} и {ИМЯ}, привет!");
	});

	it("maps a pasted name", () => {
		const { editor } = setup("", declared);
		const editable = editor.editor.editable;

		editable.textContent = "Здравствуйте, {Имя клиента}. Ваш город?";
		editable.dispatchEvent(new Event("input", { bubbles: true }));

		expect(editor.getValue()).toBe("Здравствуйте, {ИМЯ}. Ваш город?");
	});

	// название — человеческий текст, а не код: набирают его по памяти, с экрана
	it.each([["{имя клиента}"], ["{ИМЯ КЛИЕНТА}"], ["{Имя   клиента}"]])("maps %s too", (written) => {
		const { editor } = setup(written, declared);

		expect(editor.getValue()).toBe("{ИМЯ}");
	});

	// Ключ важнее названия: `{Имя клиента}` объявлено и ключом другой переменной, и названием
	// первой. Подмени его — набранная переменная превратилась бы в другую.
	it("leaves a declared key alone even when it repeats someone's name", () => {
		const { editor } = setup("{Имя клиента} и {ГОРОД}", {
			variables: [...declared.variables!, { key: "Имя клиента" }],
		});

		expect(editor.getValue()).toBe("{Имя клиента} и {ГОРОД}");
		expect(editor.unknownVariables).toEqual([]);
	});

	it("leaves an unknown name alone and still marks it", () => {
		const { editor } = setup("{Отчество}", declared);
		const span = editor.editor.editable.querySelector<HTMLElement>("span.variable")!;

		expect(editor.getValue()).toBe("{Отчество}");
		expect(span.classList.contains("unknown")).toBe(true);
		expect(editor.unknownVariables).toEqual(["Отчество"]);
	});

	// Спинтакс матчится целиком, и переменных внутри него не ищет ни подсветка, ни проверка:
	// разойдись подмена с ними, поле правило бы то, чего не помечает.
	it("does not look inside a spintax", () => {
		const { editor } = setup("[{Имя клиента}|привет]", declared);

		expect(editor.getValue()).toBe("[{Имя клиента}|привет]");
		expect(editor.editor.editable.querySelectorAll("span.spintax")).toHaveLength(1);
	});

	it("maps a name in the value set by the host", () => {
		const { editor, input } = setup("", declared);

		editor.setValue("Привет, {Имя клиента}!");

		expect(editor.getValue()).toBe("Привет, {ИМЯ}!");
		expect(input.value).toBe("Привет, {ИМЯ}!");
	});

	// изменение хосту сообщается вместе с подменой, а не написанным названием
	it("reports the mapped value to the change handler", () => {
		const { editor } = setup("", declared);
		const handler = jest.fn();
		editor.onChange(handler);

		editor.setValue("{Имя клиента}");

		expect(handler).toHaveBeenCalledWith(expect.objectContaining({ value: "{ИМЯ}" }));
	});

	// без персонализации `{Имя клиента}` — обычный текст, и подменять в нём нечего
	it("maps nothing while personalization is off", () => {
		const { editor } = setup("{Имя клиента}", { personalization: false, variables: declared.variables });

		expect(editor.getValue()).toBe("{Имя клиента}");
	});

	// одно название у двух переменных — дело хоста: на экране они неразличимы, берём первую
	it("takes the first variable of two with the same name", () => {
		const { editor } = setup("{Имя}", {
			variables: [
				{ key: "FIRST", name: "Имя" },
				{ key: "SECOND", name: "Имя" },
			],
		});

		expect(editor.getValue()).toBe("{FIRST}");
	});
});
