/**
 * @jest-environment jsdom
 */
import MessageEditor from "../source/messageeditor";
import { messageLength, DEFAULT_VARIABLE_LENGTH } from "../source/highlight";

function setup(
	opts: {
		value?: string;
		personalization?: boolean;
		variableLength?: number;
		variableLengthAttr?: string;
		maxlength?: number;
	} = {}
) {
	document.body.innerHTML = "";
	const form = document.createElement("form");
	const input = document.createElement("textarea");
	if (opts.value !== undefined) input.value = opts.value;
	if (opts.variableLengthAttr !== undefined) input.setAttribute("data-variable-length", opts.variableLengthAttr);
	if (opts.maxlength) input.maxLength = opts.maxlength;
	form.appendChild(input);
	document.body.appendChild(form);

	const editor = new MessageEditor(input, {
		personalization: opts.personalization ?? true,
		variableLength: opts.variableLength,
	});

	return { input, editor };
}

describe("MessageEditor length", () => {
	it("counts the plain text length", () => {
		const { editor } = setup({ value: "привет" });

		expect(editor.messageLength).toBe(6);
	});

	// в отправку уйдёт один из вариантов, и лимит обязан выдержать любой — считается самый длинный
	it("counts a spintax as its longest variant", () => {
		const { editor } = setup({ value: "Скидка [10|1500] процентов" });

		// "Скидка " (7) + "1500" (4) + " процентов" (10)
		expect(editor.messageLength).toBe(21);
	});

	it("counts an empty spintax variant as its length", () => {
		const { editor } = setup({ value: "[|abc]" });

		expect(editor.messageLength).toBe(3);
	});

	// подставленное значение длиннее ключа — переменная считается условной длиной
	it("counts a variable as the default placeholder length", () => {
		const { editor } = setup({ value: "{ИМЯ}!" });

		expect(editor.messageLength).toBe(DEFAULT_VARIABLE_LENGTH + 1);
	});

	it("takes the variable length from the data attribute", () => {
		const { editor } = setup({ value: "{ИМЯ}!", variableLengthAttr: "10" });

		expect(editor.variableLength).toBe(10);
		expect(editor.messageLength).toBe(11);
	});

	// переданная опция знает набор точнее — как и остальные опции компонента
	it("prefers the variableLength option over the attribute", () => {
		const { editor } = setup({ value: "{ИМЯ}", variableLengthAttr: "10", variableLength: 5 });

		expect(editor.messageLength).toBe(5);
	});

	// Number("") даёт 0 — пустой атрибут молча выключал бы поправку, которую никто не выключал;
	// дробная длина не бывает — символы считаются целиком
	it.each(["", " ", "abc", "-5", "10.5"])("falls back to the default on a bad attribute %j", (attr) => {
		const { editor } = setup({ value: "{ИМЯ}", variableLengthAttr: attr as string });

		expect(editor.variableLength).toBe(DEFAULT_VARIABLE_LENGTH);
	});

	// без персонализации {ИМЯ} — обычный текст: считается по буквам, ровно как показывается
	it("counts a variable literally when personalization is off", () => {
		const { editor } = setup({ value: "{ИМЯ}", personalization: false });

		expect(editor.messageLength).toBe(5);
	});

	// вложенных конструкций нет: переменная внутри варианта — часть его текста
	it("counts a variable inside a spintax variant literally", () => {
		const { editor } = setup({ value: "[{ИМЯ}|привет]" });

		expect(editor.messageLength).toBe(6);
	});

	// конструкция не пересекает строку: скобки из соседних строк не склеиваются в переменную
	it("does not join constructs across lines", () => {
		const { editor } = setup({ value: "а{\nБ}" });

		expect(editor.messageLength).toBe(5);
	});

	// опора каретки за конструкцией — служебный символ поля, в длину не входит
	it("does not count caret anchors", () => {
		const { editor } = setup({ value: "{ИМЯ}" });

		expect(editor.messageLength).toBe(DEFAULT_VARIABLE_LENGTH);
	});

	// длина считается на месте: хост читает её на onChange, когда правит свой лимит
	it("follows typing", () => {
		const { editor } = setup({ value: "аб" });

		// дописываем в тот же абзац: отдельный узел в корне редактор завернул бы в новый
		editor.editor.editable.querySelector("p")!.appendChild(document.createTextNode("вгд"));
		editor.editor.editable.dispatchEvent(new Event("input", { bubbles: true }));

		expect(editor.messageLength).toBe(5);
	});

	it("follows setValue", () => {
		const { editor } = setup({ value: "аб" });

		editor.setValue("абвгде");

		expect(editor.messageLength).toBe(6);
	});

	// Оценка с конструкциями форму не держит: остановка отправки по догадке отняла бы у хоста
	// его же решение — свой лимит он проверяет сам.
	it("does not block the form over the maxlength of the value element", () => {
		const { input, editor } = setup({ value: "{ИМЯ}", maxlength: 10 });

		expect(editor.messageLength).toBeGreaterThan(10);
		expect(editor.validate()).toBe(true);
		expect(input.checkValidity()).toBe(true);
	});
});

describe("messageLength", () => {
	function root(html: string): HTMLElement {
		const elem = document.createElement("div");
		elem.innerHTML = html;
		return elem;
	}

	it("counts plain text as is", () => {
		expect(messageLength(root("привет"))).toBe(6);
	});

	it("counts line breaks between paragraphs", () => {
		expect(messageLength(root("<p>аб</p><p>вг</p>"))).toBe(5);
	});

	it("trims the edges like the value", () => {
		expect(messageLength(root("  аб  "))).toBe(2);
	});

	it("counts constructs inside highlight wrappers by their text", () => {
		// готовая обёртка разбирается по textContent — как в самом поле
		expect(
			messageLength(root('а <span class="variable" contenteditable="false">{ИМЯ}</span> б'), {
				variableLength: 10,
			})
		).toBe(2 + 10 + 2);
	});

	it("leaves variables to the literal count when they are not highlighted", () => {
		expect(messageLength(root("{ИМЯ} [а|бв]"), { variables: false })).toBe(5 + 1 + 2);
	});
});
