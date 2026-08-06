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

	return new MessageEditor(input, options);
}

const declared: MessageEditorOptions = { variables: [{ key: "ИМЯ", name: "Имя" }, { key: "ГОРОД" }] };

describe("unknown variables", () => {
	// Опечатка в ключе выглядит как рабочая переменная, а на отправке подставить её нечем —
	// получателю она уйдёт скобками наружу. Без пометки это замечается уже по сообщению.
	it("marks a key that is not in the declared list", () => {
		const editor = setup("Привет, {ИМЯЯ}!", declared);
		const span = editor.editor.editable.querySelector<HTMLElement>("span.variable")!;

		expect(span.classList.contains("unknown")).toBe(true);
		expect(span.getAttribute("title")).toBeTruthy();
		expect(span.textContent).toBe("{ИМЯЯ}"); // текст неприкосновенен — из него собирается значение
		expect(editor.getValue()).toBe("Привет, {ИМЯЯ}!");
	});

	// Объявленная переменная остаётся как была — и с названием, и без него
	it.each([
		["{ИМЯ}", "с названием"],
		["{ГОРОД}", "без названия"],
	])("leaves %s (%s) alone", (value) => {
		const editor = setup(value, declared);
		const span = editor.editor.editable.querySelector<HTMLElement>("span.variable")!;

		expect(span.classList.contains("unknown")).toBe(false);
		expect(editor.unknownVariables).toEqual([]);
	});

	// Пустой список — не «все чужие»: набор может быть ещё не известен (переменные появляются
	// после выбора аудитории), и тогда проверять не по чему.
	it("marks nothing while the declared list is empty", () => {
		const editor = setup("{ЧТО_УГОДНО}", { personalization: true });
		const span = editor.editor.editable.querySelector<HTMLElement>("span.variable")!;

		expect(span.classList.contains("unknown")).toBe(false);
		expect(editor.unknownVariables).toEqual([]);
	});

	// без персонализации `{ИМЯ}` — обычный текст, а не конструкция
	it("marks nothing while personalization is off", () => {
		const editor = setup("{ЧУЖАЯ}", { personalization: false, variables: declared.variables });

		expect(editor.editor.editable.querySelector("span.variable")).toBeNull();
		expect(editor.unknownVariables).toEqual([]);
	});

	it("collects unknown keys in order of appearance, without repeats", () => {
		const editor = setup("{Б} {ИМЯ} {А} {Б}", declared);

		expect(editor.unknownVariables).toEqual(["Б", "А"]);
		expect(editor.editor.editable.querySelectorAll("span.variable.unknown")).toHaveLength(3);
	});

	// Спинтакс разбирается тем же выражением и матчится целиком: скобки внутри него — часть
	// его текста, а не переменные. Иначе `[{А}|{Б}]` дал бы две несуществующие проблемы.
	it("does not look for variables inside a spintax", () => {
		const editor = setup("[{А}|{Б}]", declared);

		expect(editor.editor.editable.querySelectorAll("span.spintax")).toHaveLength(1);
		expect(editor.unknownVariables).toEqual([]);
	});

	// Конструкция не пересекает строку: `{` в конце одной и `}` в начале следующей — не переменная.
	// Проверка обходит текстовые узлы по отдельности как раз ради этого — по textContent всего
	// элемента строки склеились бы и дали ложную проблему.
	it("does not join a construct across lines", () => {
		const editor = setup("раз {\nБ} два", declared);

		expect(editor.unknownVariables).toEqual([]);
		expect(editor.editor.editable.querySelector("span.variable")).toBeNull();
	});

	// Подставить переменную нечем — это ошибка значения, а не оформления: отправку она обязана
	// остановить так же, как нативные ограничения поля.
	it("makes the value invalid and explains why", () => {
		const editor = setup("{ЧУЖАЯ}", declared);
		const valueElem = editor.element.querySelector("textarea")!;

		expect(editor.validate()).toBe(false);
		expect(editor.element.classList.contains("invalid")).toBe(true);
		expect(valueElem.validity.customError).toBe(true);
		expect(valueElem.validationMessage).toContain("{ЧУЖАЯ}");
	});

	it("clears the error once the key is fixed", () => {
		const editor = setup("{ЧУЖАЯ}", declared);
		const valueElem = editor.element.querySelector("textarea")!;

		expect(editor.validate()).toBe(false);

		editor.setValue("{ИМЯ}");

		expect(editor.validate()).toBe(true);
		expect(valueElem.validity.customError).toBe(false);
		expect(editor.element.classList.contains("invalid")).toBe(false);
	});

	// Иначе поле вернулось бы в форму обычным, но навсегда невалидным — и понять почему было бы
	// нечем: ни плашки, ни подсветки уже нет, а форма молча не отправляется.
	it("takes its custom validity away on destroy", () => {
		const editor = setup("{ЧУЖАЯ}", declared);
		const valueElem = editor.element.querySelector("textarea")!;
		const form = valueElem.form!;

		expect(editor.validate()).toBe(false);

		editor.destroy();

		expect(valueElem.validity.customError).toBe(false);
		expect(form.checkValidity()).toBe(true);
	});

	// Проверять не по чему — значит и подпись не наша: приложение могло выставить свою через
	// setCustomValidity, и пустая строка стёрла бы её.
	it("keeps a host-set custom validity when there is nothing to check", () => {
		const editor = setup("{ЧТО_УГОДНО}", { personalization: true });
		const valueElem = editor.element.querySelector("textarea")!;

		valueElem.setCustomValidity("Своя проверка приложения.");

		expect(editor.validate()).toBe(false);
		expect(valueElem.validationMessage).toBe("Своя проверка приложения.");
	});
});
