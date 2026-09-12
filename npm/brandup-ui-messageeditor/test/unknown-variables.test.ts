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
	// Опечатка в ключе выглядит как рабочее свойство, а на отправке подставить его нечем —
	// получателю оно уйдёт скобками наружу. Без пометки это замечается уже по сообщению.
	it("marks a key that is not in the declared list", () => {
		const editor = setup("Привет, {ИМЯЯ}!", declared);
		const span = editor.editor.editable.querySelector<HTMLElement>("span.variable")!;

		expect(span.classList.contains("unknown")).toBe(true);
		expect(span.getAttribute("title")).toBeTruthy();
		expect(span.textContent).toBe("{ИМЯЯ}"); // текст неприкосновенен — из него собирается значение
		expect(editor.getValue()).toBe("Привет, {ИМЯЯ}!");
	});

	// Объявленное свойство остаётся как было — и с названием, и без него
	it.each([
		["{ИМЯ}", "с названием"],
		["{ГОРОД}", "без названия"],
	])("leaves %s (%s) alone", (value) => {
		const editor = setup(value, declared);
		const span = editor.editor.editable.querySelector<HTMLElement>("span.variable")!;

		expect(span.classList.contains("unknown")).toBe(false);
		expect(editor.unknownVariables).toEqual([]);
	});

	// Пустой список — это «не объявлено ничего», а не «набор пока не известен»: подставить
	// свойство нечем ни в том, ни в другом случае. Приложение, которому набор ещё предстоит
	// узнать (свойства появляются после выбора аудитории), включает персонализацию тогда же,
	// когда узнаёт набор.
	it("marks every key while the declared list is empty", () => {
		const editor = setup("{ЧТО_УГОДНО}", { personalization: true });
		const span = editor.editor.editable.querySelector<HTMLElement>("span.variable")!;
		const valueElem = editor.element.querySelector("textarea")!;

		expect(span.classList.contains("unknown")).toBe(true);
		expect(editor.unknownVariables).toEqual(["ЧТО_УГОДНО"]);
		expect(valueElem.validity.customError).toBe(true);
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
	// его текста, а не свойства. Иначе `[{А}|{Б}]` дал бы две несуществующие проблемы.
	it("does not look for variables inside a spintax", () => {
		const editor = setup("[{А}|{Б}]", declared);

		expect(editor.editor.editable.querySelectorAll("span.spintax")).toHaveLength(1);
		expect(editor.unknownVariables).toEqual([]);
	});

	// Конструкция не пересекает строку: `{` в конце одной и `}` в начале следующей — не свойство.
	// Проверка обходит текстовые узлы по отдельности как раз ради этого — по textContent всего
	// элемента строки склеились бы и дали ложную проблему.
	it("does not join a construct across lines", () => {
		const editor = setup("раз {\nБ} два", declared);

		expect(editor.unknownVariables).toEqual([]);
		expect(editor.editor.editable.querySelector("span.variable")).toBeNull();
	});

	// Подставить свойство нечем — это ошибка значения, а не оформления: отправку она обязана
	// остановить так же, как нативные ограничения поля.
	it("makes the value invalid and explains why", () => {
		const editor = setup("{ЧУЖАЯ}", declared);
		const valueElem = editor.element.querySelector("textarea")!;

		expect(editor.validate()).toBe(false);
		expect(editor.element.classList.contains("invalid")).toBe(true);
		expect(valueElem.validity.customError).toBe(true);
		expect(valueElem.validationMessage).toContain("{ЧУЖАЯ}");
	});

	// Ключ может содержать `$`, а в строке замены `$&` и `$'` — это узоры: подставленный наивно,
	// такой ключ съел бы сам себя, и в сообщении оказалось бы `{A{keys}B}`.
	it("puts a key with a dollar sign into the message as it is", () => {
		const editor = setup("{A$&B}", declared);
		const valueElem = editor.element.querySelector("textarea")!;

		expect(editor.validate()).toBe(false);
		expect(valueElem.validationMessage).toContain("{A$&B}");
		expect(valueElem.validationMessage).not.toContain("{keys}");
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

	// Снять компонент могут дважды: своим destroy это делает хост, а следом — авто-уничтожение
	// по удалению элемента из DOM (или наоборот). Второй проход не должен ни падать, ни оставлять
	// полю снятую подпись: поле вернулось бы в форму навсегда невалидным.
	it("survives a second destroy", () => {
		const editor = setup("{ЧУЖАЯ}", declared);
		const valueElem = editor.element.querySelector("textarea")!;
		const form = valueElem.form!;

		expect(editor.validate()).toBe(false);

		editor.destroy();
		expect(() => editor.destroy()).not.toThrow();

		expect(valueElem.validity.customError).toBe(false);
		expect(form.checkValidity()).toBe(true);
	});

	// Проверять не по чему — значит и подпись не наша: приложение могло выставить свою через
	// setCustomValidity, и пустая строка стёрла бы её. Без персонализации свойств в поле нет
	// вовсе, и проверять правда нечего.
	it("keeps a host-set custom validity when there is nothing to check", () => {
		const editor = setup("{ЧТО_УГОДНО}", { personalization: false });
		const valueElem = editor.element.querySelector("textarea")!;

		valueElem.setCustomValidity("Своя проверка приложения.");

		expect(editor.validate()).toBe(false);
		expect(valueElem.validationMessage).toBe("Своя проверка приложения.");
		expect(editor.unknownVariables).toEqual([]);
	});
});

// Ограничение объявляется полю-носителю, а нативная проверка ограничений идёт до события submit:
// не проверив начальное значение, поле пропустило бы первую отправку. Разметку с чужим свойством
// отдаёт сервер, и до первой правки события изменения не случается вовсе.
describe("initial value", () => {
	it("makes the field invalid before any interaction", () => {
		const editor = setup("{ЧУЖАЯ}", declared);
		const valueElem = editor.element.querySelector("textarea")!;

		expect(valueElem.validity.customError).toBe(true);
		expect(valueElem.form!.checkValidity()).toBe(false);
	});

	it("stops the first submit", () => {
		const editor = setup("{ЧУЖАЯ}", declared);
		const form = editor.element.querySelector("textarea")!.form!;
		let submitted = false;
		form.addEventListener("submit", (e) => {
			e.preventDefault();
			submitted = true;
		});

		form.requestSubmit();

		expect(submitted).toBe(false);
		expect(editor.element.classList.contains("invalid")).toBe(true);
	});

	it("leaves a declared one alone", () => {
		const editor = setup("{ИМЯ}", declared);
		const valueElem = editor.element.querySelector("textarea")!;

		expect(valueElem.validity.customError).toBe(false);
		expect(valueElem.form!.checkValidity()).toBe(true);
	});
});
