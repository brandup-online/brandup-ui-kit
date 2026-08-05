/**
 * @jest-environment jsdom
 */
import MessageEditor, { ROOT_CLASS, INPUT_CLASS, EMOJI_CLASS, EMOJI_HOLDER_CLASS } from "../source/messageeditor";

function setup(
	opts: { value?: string; placeholder?: string; required?: boolean; readonly?: boolean; disabled?: boolean } = {}
) {
	document.body.innerHTML = "";
	const form = document.createElement("form");
	const input = document.createElement("textarea");
	if (opts.value !== undefined) input.value = opts.value;
	if (opts.placeholder) input.setAttribute("placeholder", opts.placeholder);
	if (opts.required) input.required = true;
	if (opts.readonly) input.setAttribute("readonly", "readonly");
	if (opts.disabled) input.disabled = true;
	form.appendChild(input);
	document.body.appendChild(form);
	return { input, form };
}

function caretAt(node: Node, offset: number) {
	const selection = window.getSelection()!;
	const range = document.createRange();
	range.setStart(node, offset);
	range.collapse(true);
	selection.removeAllRanges();
	selection.addRange(range);
}

// Каретка сразу за конструкцией — снаружи обёртки, а не в конце её текста: обёртка
// не редактируется, и внутри неё браузер каретку не рисует. Выражается позиция двояко:
// началом соседнего текста, если он есть, иначе местом в родителе.
function caretRightAfter(span: Element) {
	const selection = window.getSelection()!;
	const next = span.nextSibling;

	expect(span.contains(selection.anchorNode)).toBe(false);

	if (next?.nodeType === Node.TEXT_NODE) {
		expect(selection.anchorNode).toBe(next);
		expect(selection.anchorOffset).toBe(0);
		return;
	}

	const parent = span.parentNode!;
	expect(selection.anchorNode).toBe(parent);
	expect(selection.anchorOffset).toBe(Array.from(parent.childNodes).indexOf(span) + 1);
}

// Окно правки забирает фокус — редактор теряет его, хотя ввод не закончен.
function openVariables(editor: MessageEditor) {
	document.querySelector<HTMLButtonElement>('.ui-richeditor-toolbar [data-toolbar-button="variable"]')!.click();
	editor.editor.editable.blur();
}

describe("MessageEditor", () => {
	it("wraps the value element in a bubble container", () => {
		const { input } = setup();
		new MessageEditor(input);

		const container = input.parentElement!;
		expect(container.classList.contains(ROOT_CLASS)).toBe(true);
		expect(container.querySelector(".bubble")).not.toBeNull();
		// редактор поднят внутри плашки, носитель значения остался в форме
		expect(container.querySelector(".ui-richeditor")).not.toBeNull();
		expect(input.classList.contains(INPUT_CLASS)).toBe(true);
		expect(input.form).not.toBeNull();
	});

	// оформление полосы прокрутки живёт в ките и цепляется классом: без него текст сообщения
	// прокручивался бы системной полосой
	it("marks the scrolling text as scrollable", () => {
		const { input } = setup();
		const editor = new MessageEditor(input);

		expect(editor.editor.editable.classList.contains("ui-scrollable")).toBe(true);
	});

	it("passes the placeholder through to the editor", () => {
		const { input } = setup({ placeholder: "Напишите сообщение" });
		const editor = new MessageEditor(input);

		expect(editor.placeholder).toBe("Напишите сообщение");
		expect(editor.editor.editable.getAttribute("data-placeholder")).toBe("Напишите сообщение");
	});

	it("keeps the value element in sync and reports changes", () => {
		const { input } = setup();
		const editor = new MessageEditor(input);
		const handler = jest.fn();
		editor.onChange(handler);

		editor.setValue("привет");

		expect(editor.getValue()).toBe("привет");
		expect(input.value).toBe("привет");
		expect(handler).toHaveBeenCalledWith(expect.objectContaining({ value: "привет" }));
	});

	it("takes the initial value from the value element", () => {
		const { input } = setup({ value: "уже написано" });
		const editor = new MessageEditor(input);

		expect(editor.getValue()).toBe("уже написано");
		expect(editor.editor.editable.textContent).toBe("уже написано");
	});

	// Enter переносит строку, а не отправляет форму и не создаёт абзац: иначе каждое
	// нажатие уходило бы в значение пустой строкой
	it("is multiline: Enter breaks the line instead of submitting", () => {
		const { input, form } = setup({ value: "строка" });
		const editor = new MessageEditor(input);
		const submit = jest.fn((e: Event) => e.preventDefault());
		form.addEventListener("submit", submit);

		const editable = editor.editor.editable;
		const paragraph = editable.querySelector("p")!;
		const selection = window.getSelection()!;
		const range = document.createRange();
		range.setStart(paragraph.firstChild!, 6); // конец строки
		range.collapse(true);
		selection.removeAllRanges();
		selection.addRange(range);

		editable.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));

		expect(editor.editor.multiline).toBe(true);
		expect(editable.querySelectorAll("p")).toHaveLength(1); // абзац один, внутри мягкий перенос
		expect(editable.querySelector("br")).not.toBeNull();
		expect(submit).not.toHaveBeenCalled();
	});

	// один Enter — один перенос в значении, а не пустая строка
	it("exports a single line break per Enter", () => {
		const { input } = setup({ value: "строка" });
		const editor = new MessageEditor(input);

		const editable = editor.editor.editable;
		const paragraph = editable.querySelector("p")!;
		const selection = window.getSelection()!;
		const range = document.createRange();
		range.setStart(paragraph.firstChild!, 6);
		range.collapse(true);
		selection.removeAllRanges();
		selection.addRange(range);

		editable.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
		editor.editor.insertText("вторая");

		expect(editor.getValue()).toBe("строка\nвторая");
	});

	it("shows the format toolbar over the bubble, without the emoji action", () => {
		const { input } = setup({ value: "текст" });
		const editor = new MessageEditor(input);

		editor.editor.editable.dispatchEvent(new FocusEvent("focus"));

		const toolbar = editor.element.querySelector(".ui-richeditor-toolbar")!;
		expect(toolbar).not.toBeNull(); // панель внутри компонента, а не в document.body
		expect(toolbar.classList.contains("in-container")).toBe(true);
		expect(toolbar.querySelectorAll(".format-button")).toHaveLength(4); // словарь сообщений без скрытых спойлера и кода
		// действие одно — очистка формата; смайлики вынесены в собственную кнопку компонента
		expect(toolbar.querySelectorAll(".action-button")).toHaveLength(1);
		expect(toolbar.querySelector('[data-editor-action="erase"]')).not.toBeNull();
		expect(toolbar.querySelector('[data-editor-action="emoji"]')).toBeNull();
	});

	// кнопка живёт внутри плашки справа от текста и доступна сразу, не дожидаясь фокуса
	it("puts its own emoji button inside the bubble", () => {
		const { input } = setup();
		const editor = new MessageEditor(input);

		const button = editor.element.querySelector(`.${EMOJI_CLASS}`)!;
		expect(button).not.toBeNull();

		// собственная коробка кнопки — от неё раскрывается панель смайликов
		const holder = button.parentElement!;
		expect(holder.classList.contains(EMOJI_HOLDER_CLASS)).toBe(true);
		expect(holder.parentElement!.classList.contains("bubble")).toBe(true);
		expect(holder.previousElementSibling!.classList.contains("ui-richeditor")).toBe(true);
		expect(document.querySelector(".ui-richeditor-toolbar.visible")).toBeNull(); // фокуса ещё не было
	});

	// панель одна на всю страницу, как и тулбар: она переезжает к той кнопке, что её открыла
	it("shares a single emoji picker between editors", () => {
		const first = new MessageEditor(setup({ value: "раз" }).input);
		const form = document.createElement("form");
		const second = document.createElement("textarea");
		form.appendChild(second);
		document.body.appendChild(form);
		const other = new MessageEditor(second);

		first.element.querySelector<HTMLButtonElement>(`.${EMOJI_CLASS}`)!.click();
		expect(first.element.querySelector(".ui-richeditor-emoji.opened")).not.toBeNull();

		// Открытие у соседа само переводит туда фокус, и уход фокуса из первого приходит уже после:
		// панель к тому времени принадлежит соседу. Закрытие её здесь стоило бы второго нажатия.
		other.element.querySelector<HTMLButtonElement>(`.${EMOJI_CLASS}`)!.click();

		expect(document.querySelectorAll(".ui-richeditor-emoji")).toHaveLength(1);
		expect(other.element.querySelector(".ui-richeditor-emoji.opened")).not.toBeNull();
		expect(first.element.querySelector(".ui-richeditor-emoji")).toBeNull();

		// панель раскрывается от кнопки: её коробка и есть позиционированный предок
		const picker = document.querySelector(".ui-richeditor-emoji")!;
		expect(picker.parentElement!.classList.contains(EMOJI_HOLDER_CLASS)).toBe(true);

		// повторное нажатие по той же кнопке закрывает
		other.element.querySelector<HTMLButtonElement>(`.${EMOJI_CLASS}`)!.click();
		expect(document.querySelector(".ui-richeditor-emoji.opened")).toBeNull();
	});

	it("has no emoji button when disabled", () => {
		const { input } = setup({ disabled: true });
		const editor = new MessageEditor(input);

		expect(editor.element.querySelector(`.${EMOJI_CLASS}`)).toBeNull();
	});

	// в disabled панели не должно быть даже в разметке: без инструментов и действий
	// RichEditor её не собирает и не показывает, даже если фокус попал в плашку
	it("builds no toolbar at all when disabled", () => {
		const { input } = setup({ value: "текст", disabled: true });
		const editor = new MessageEditor(input);

		editor.editor.editable.dispatchEvent(new FocusEvent("focus"));

		expect(editor.editor.formatTools).toHaveLength(0);
		expect(editor.editor.editorActions).toHaveLength(0);
		expect(document.querySelector(".ui-richeditor-toolbar")).toBeNull();
		expect(editor.editor.editable.contentEditable).toBe("false");
	});

	it("opens the picker from its own button and inserts into the caret", () => {
		const { input } = setup({ value: "привет" });
		const editor = new MessageEditor(input);
		editor.editor.editable.dispatchEvent(new FocusEvent("focus"));

		const paragraph = editor.editor.editable.querySelector("p")!;
		const selection = window.getSelection()!;
		const range = document.createRange();
		range.setStart(paragraph.firstChild!, 6);
		range.collapse(true);
		selection.removeAllRanges();
		selection.addRange(range);

		editor.element.querySelector<HTMLButtonElement>(`.${EMOJI_CLASS}`)!.click();

		// панель переезжает к кнопке, а не остаётся в тулбаре
		const picker = editor.element.querySelector<HTMLElement>(".ui-richeditor-emoji")!;
		expect(picker).not.toBeNull();
		expect(picker.classList.contains("opened")).toBe(true);

		picker.querySelector<HTMLButtonElement>(".emoji")!.click();

		expect(editor.getValue().startsWith("привет")).toBe(true);
		expect(editor.getValue().length).toBeGreaterThan("привет".length);
		expect(picker.classList.contains("opened")).toBe(false);
	});

	// Кнопка смайлика доступна без фокуса, и клик по ней должен поднимать один слой, а не два:
	// панель сама переводит фокус в поле, поэтому тулбар придерживается до её закрытия.
	it("opens only the picker when the field was not focused", () => {
		const { input } = setup({ value: "привет" });
		const editor = new MessageEditor(input);

		editor.element.querySelector<HTMLButtonElement>(`.${EMOJI_CLASS}`)!.click();

		const picker = editor.element.querySelector<HTMLElement>(".ui-richeditor-emoji")!;
		expect(picker.classList.contains("opened")).toBe(true);
		expect(document.querySelector(".ui-richeditor-toolbar.visible")).toBeNull();
		// каретка всё же поставлена — иначе вставлять символ было бы некуда
		expect(document.activeElement).toBe(editor.editor.editable);

		picker.querySelector<HTMLButtonElement>(".emoji")!.click();

		// панель закрылась, поле осталось в фокусе — тулбар показывается, как при обычном входе
		expect(picker.classList.contains("opened")).toBe(false);
		expect(editor.getValue().startsWith("привет")).toBe(true);
		expect(document.querySelector(".ui-richeditor-toolbar.visible")).not.toBeNull();
	});

	// Персонализация нужна не всякому сообщению: без неё нет ни кнопки, ни подсветки,
	// а `{ИМЯ}` остаётся обычным текстом, который правится как есть.
	it("keeps personalization off until it is asked for", () => {
		const { input } = setup({ value: "Привет, {ИМЯ}!" });
		const editor = new MessageEditor(input);

		expect(editor.personalization).toBe(false);
		expect(editor.editor.editable.querySelector("span.variable")).toBeNull();

		editor.editor.editable.focus();
		expect(document.querySelector('[data-toolbar-button="variable"]')).toBeNull();
		// рандомизация от этого не зависит
		expect(document.querySelector('[data-toolbar-button="randomize"]')).not.toBeNull();
	});

	it.each([
		["атрибутом", (input: HTMLTextAreaElement) => input.setAttribute("data-personalization", "")],
		["объявленным списком", (input: HTMLTextAreaElement) => input.setAttribute("data-variables", "ИМЯ")],
		["текстом пустого списка", (input: HTMLTextAreaElement) => input.setAttribute("data-variables-empty", "Позже")],
	])("turns personalization on %s", (_, declare) => {
		const { input } = setup({ value: "Привет, {ИМЯ}!" });
		declare(input);
		const editor = new MessageEditor(input);

		expect(editor.personalization).toBe(true);
		expect(editor.editor.editable.querySelector("span.variable")).not.toBeNull();

		editor.editor.editable.focus();
		expect(document.querySelector('[data-toolbar-button="variable"]')).not.toBeNull();
	});

	// Разметку может отдавать сервер — тогда передать список в опциях неоткуда.
	it("takes the variables from the data-variables attribute", () => {
		const { input } = setup();
		input.setAttribute("data-variables", '[{"key":"ИМЯ","name":"Имя подписчика"},"ГОРОД"]');
		const editor = new MessageEditor(input);

		expect(editor.variables).toEqual([{ key: "ИМЯ", name: "Имя подписчика" }, { key: "ГОРОД" }]);
	});

	it("prefers the variables passed in options over the attribute", () => {
		const { input } = setup();
		input.setAttribute("data-variables", "ИЗ_РАЗМЕТКИ");
		const editor = new MessageEditor(input, { variables: [{ key: "ИЗ_КОДА" }] });

		expect(editor.variables).toEqual([{ key: "ИЗ_КОДА" }]);
	});

	// список из атрибута должен доходить до окна выбора, а не оставаться полем компонента
	it("shows the attribute variables in the picker window", () => {
		const { input } = setup();
		input.setAttribute("data-variables", "ИМЯ, ГОРОД");
		const editor = new MessageEditor(input);

		editor.editor.editable.focus();
		document.querySelector<HTMLButtonElement>('.ui-richeditor-toolbar [data-toolbar-button="variable"]')!.click();

		const buttons = document.querySelectorAll(".messageeditor-variables .variables .variable");
		expect(Array.from(buttons).map((b) => b.querySelector(".preview")!.textContent)).toEqual(["{ИМЯ}", "{ГОРОД}"]);

		document.querySelector<HTMLButtonElement>(".ui-modal .modal-close")!.click();
	});

	// Пустой список — не ошибка: переменные могут появиться позже, и объяснить это должно приложение.
	it("shows its own empty text in the picker window", () => {
		const { input } = setup();
		input.setAttribute("data-variables-empty", "Переменные появятся после выбора аудитории.");
		const editor = new MessageEditor(input);

		expect(editor.variables).toEqual([]);

		editor.editor.editable.focus();
		document.querySelector<HTMLButtonElement>('.ui-richeditor-toolbar [data-toolbar-button="variable"]')!.click();

		expect(document.querySelector(".messageeditor-variables .variables .empty")!.textContent).toBe(
			"Переменные появятся после выбора аудитории."
		);

		document.querySelector<HTMLButtonElement>(".ui-modal .modal-close")!.click();
	});

	it("prefers the empty text passed in options over the attribute", () => {
		const { input } = setup();
		input.setAttribute("data-variables-empty", "Из разметки");
		const editor = new MessageEditor(input, { variablesEmpty: "Из кода" });

		expect(editor.variablesEmpty).toBe("Из кода");
	});

	// Пока открыто окно, содержимое трогать нельзя: нормализация срезает краевые пробелы как
	// лишние, а пересчёт смещений уводит каретку — вставленное вставало вплотную к слову.
	it("keeps the space at the caret and returns the focus after the inserted variable", () => {
		const { input } = setup({ value: "Привет," });
		input.setAttribute("data-variables", "ИМЯ");
		const editor = new MessageEditor(input);

		editor.editor.editable.focus();
		caretAt(editor.editor.editable.querySelector("p")!.firstChild!, 7);
		editor.editor.insertText(" ");

		openVariables(editor);
		document.querySelector<HTMLButtonElement>(".messageeditor-variables .variable")!.click();

		expect(editor.getValue()).toBe("Привет, {ИМЯ}");

		// каретка сразу за вставленным, фокус вернулся в поле — правку продолжают там же
		caretRightAfter(editor.editor.editable.querySelector("span.variable")!);
		expect(document.activeElement).toBe(editor.editor.editable);
	});

	// обрезка краевого пробела сдвигала смещения, и вставка уходила на предыдущую строку
	it("inserts on the right line when the caret is at the start of one", () => {
		const { input } = setup({ value: "раз\nдва" });
		input.setAttribute("data-variables", "ИМЯ");
		const editor = new MessageEditor(input);

		editor.editor.editable.focus();
		caretAt(editor.editor.editable.querySelector("p")!.lastChild!, 0);
		editor.editor.insertText(" ");

		openVariables(editor);
		document.querySelector<HTMLButtonElement>(".messageeditor-variables .variable")!.click();

		expect(editor.getValue()).toBe("раз\n {ИМЯ}два");
	});

	// Замена не должна сбрасывать оформление заменяемого: физически вставка оказывается снаружи
	// тега (границы восстанавливаются по смещениям, а опустевший тег убирается), поэтому формат
	// переносится на неё явно.
	it("keeps the formatting of the text the spintax replaces", () => {
		const { input } = setup({ value: "Дарим **скидку** сегодня" });
		const editor = new MessageEditor(input);

		editor.editor.editable.focus();
		const selection = window.getSelection()!;
		const range = document.createRange();
		range.selectNodeContents(editor.editor.editable.querySelector("b")!);
		selection.removeAllRanges();
		selection.addRange(range);

		document.querySelector<HTMLButtonElement>('.ui-richeditor-toolbar [data-toolbar-button="randomize"]')!.click();
		editor.editor.editable.blur();

		// второй вариант набирают в пустом, который окно предложило само
		document.querySelectorAll<HTMLElement>(".messageeditor-randomizer .editable")[1].textContent = "подарок";
		document.querySelector<HTMLButtonElement>(".messageeditor-randomizer .apply")!.click();

		expect(editor.getValue()).toBe("Дарим **[скидку|подарок]** сегодня");
		expect(editor.editor.editable.querySelector("b span.spintax")).not.toBeNull();
	});

	// Окно правки открывают кликом по самой конструкции — каретка при этом внутри неё, а там
	// браузер её не рисует: поле выглядит расфокусированным, хотя фокус есть.
	it("leaves the caret outside the construct after closing its window", () => {
		const { input } = setup({ value: "Привет, {ИМЯ} и всё" });
		input.setAttribute("data-variables", "ИМЯ");
		const editor = new MessageEditor(input);

		const span = editor.editor.editable.querySelector<HTMLElement>("span.variable")!;
		editor.editor.editable.focus();
		caretAt(span.firstChild!, 2); // клик пришёлся внутрь конструкции
		span.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		editor.editor.editable.blur();

		expect(document.querySelector(".messageeditor-variables")).not.toBeNull();
		document.querySelector<HTMLButtonElement>(".ui-modal .modal-close")!.click();

		expect(document.activeElement).toBe(editor.editor.editable);
		caretRightAfter(span);
	});

	// то же самое без всякого окна: закрывающая скобка дописана руками, и конструкция
	// собирается прямо под кареткой
	it("moves the caret out of a construct completed by typing", () => {
		const { input } = setup({ value: "Привет, {ИМЯ" });
		const editor = new MessageEditor(input, { personalization: true });

		editor.editor.editable.focus();
		const text = editor.editor.editable.querySelector("p")!.firstChild!;
		caretAt(text, text.textContent!.length);
		editor.editor.insertText("}");

		caretRightAfter(editor.editor.editable.querySelector("span.variable")!);
	});

	// у окна рандомизации есть свои поля ввода: выделение документа уезжает в них, и вернуть
	// правку по нему уже нельзя — место запоминается до открытия
	it("replaces the selected text with the spintax and leaves the caret after it", () => {
		const { input } = setup({ value: "Дарим скидку" });
		const editor = new MessageEditor(input);

		editor.editor.editable.focus();
		const text = editor.editor.editable.querySelector("p")!.firstChild!;
		const selection = window.getSelection()!;
		const range = document.createRange();
		range.setStart(text, 6);
		range.setEnd(text, 12);
		selection.removeAllRanges();
		selection.addRange(range);

		document.querySelector<HTMLButtonElement>('.ui-richeditor-toolbar [data-toolbar-button="randomize"]')!.click();
		editor.editor.editable.blur();

		const variants = document.querySelectorAll<HTMLElement>(".messageeditor-randomizer .editable");
		variants[0].focus(); // правка идёт в поле окна
		variants[1].textContent = "подарок";

		document.querySelector<HTMLButtonElement>(".messageeditor-randomizer .apply")!.click();

		expect(editor.getValue()).toBe("Дарим [скидку|подарок]");
		expect(document.activeElement).toBe(editor.editor.editable);
		caretRightAfter(editor.editor.editable.querySelector("span.spintax")!);
	});

	// окно могли закрыть и ничего не выбрав — правку продолжают там же, где прервали
	it("returns the focus and the caret when the window is closed without applying", () => {
		const { input } = setup({ value: "Привет, мир" });
		input.setAttribute("data-variables", "ИМЯ");
		const editor = new MessageEditor(input);

		editor.editor.editable.focus();
		caretAt(editor.editor.editable.querySelector("p")!.firstChild!, 8);

		openVariables(editor);
		expect(document.activeElement).not.toBe(editor.editor.editable);

		document.querySelector<HTMLButtonElement>(".ui-modal .modal-close")!.click();

		expect(document.activeElement).toBe(editor.editor.editable);
		const selection = window.getSelection()!;
		expect(selection.anchorNode!.nodeValue).toBe("Привет, мир");
		expect(selection.anchorOffset).toBe(8);
	});

	// В пустом поле абзацев ещё нет, и вставка из кода легко ложится мимо них: значение выходит
	// верным, а следующий Enter правит текст вне <p>.
	it("keeps the paragraph model when inserting into an empty field", () => {
		const { input } = setup();
		const editor = new MessageEditor(input);

		editor.element.querySelector<HTMLButtonElement>(`.${EMOJI_CLASS}`)!.click();
		editor.element.querySelector<HTMLButtonElement>(".ui-richeditor-emoji .emoji")!.click();

		const paragraphs = editor.editor.editable.querySelectorAll("p");
		expect(paragraphs).toHaveLength(1);
		expect(editor.editor.editable.firstElementChild).toBe(paragraphs[0]);
		expect(editor.getValue()).toBe(paragraphs[0].textContent);

		// набранное следом остаётся в том же абзаце
		editor.editor.insertText("а");
		expect(editor.editor.editable.querySelectorAll("p")).toHaveLength(1);
		expect(editor.getValue().endsWith("а")).toBe(true);
	});

	// Тулбар и панель смайликов — два всплывающих слоя над одним полем: вместе они не показываются
	// ни при каком порядке действий. Пришли из поля — тулбар уходит на время работы панели.
	it("hides the already shown toolbar while the picker is open", () => {
		const { input } = setup({ value: "привет" });
		const editor = new MessageEditor(input);

		editor.editor.editable.focus();
		expect(document.querySelector(".ui-richeditor-toolbar.visible")).not.toBeNull();

		editor.element.querySelector<HTMLButtonElement>(`.${EMOJI_CLASS}`)!.click();

		const picker = editor.element.querySelector<HTMLElement>(".ui-richeditor-emoji")!;
		expect(picker.classList.contains("opened")).toBe(true);
		expect(document.querySelector(".ui-richeditor-toolbar.visible")).toBeNull();

		picker.querySelector<HTMLButtonElement>(".emoji")!.click();

		// панель закрылась, поле осталось в фокусе — тулбар возвращается сам
		expect(picker.classList.contains("opened")).toBe(false);
		expect(document.querySelector(".ui-richeditor-toolbar.visible")).not.toBeNull();
	});

	// Значение не должно расходиться с тем, что видно: каждый \n — ровно один перенос на экране.
	// Абзацными блоками `a\n\nb` рисовалось бы двумя <p>, а без отступов между ними это
	// неотличимо от одного переноса.
	it.each([["раз\nдва"], ["раз\n\nдва"], ["раз\n\n\nдва"], ["одна строка"]])(
		"renders %j as the same number of breaks and gives it back unchanged",
		(value) => {
			const { input } = setup({ value });
			const editor = new MessageEditor(input);

			expect(editor.editor.editable.querySelectorAll("p")).toHaveLength(1);
			expect(editor.editor.editable.querySelectorAll("br")).toHaveLength(value.split("\n").length - 1);
			expect(editor.getValue()).toBe(value);
		}
	);

	it("stores the value as messenger markup, not HTML", () => {
		const { input } = setup();
		const editor = new MessageEditor(input);

		editor.setValue("**жирный** текст");

		expect(editor.editor.editable.querySelector("b")).not.toBeNull();
		expect(editor.getValue()).toBe("**жирный** текст");
	});

	it("marks the control invalid when required and empty", () => {
		const { input } = setup({ required: true });
		const editor = new MessageEditor(input);

		expect(editor.validate()).toBe(false);
		expect(editor.element.classList.contains("invalid")).toBe(true);

		editor.setValue("текст");

		expect(editor.validate()).toBe(true);
		expect(editor.element.classList.contains("invalid")).toBe(false);
	});

	it("toggles the focused class with the editable", () => {
		const { input } = setup();
		const editor = new MessageEditor(input);
		const editable = editor.editor.editable;

		editable.dispatchEvent(new FocusEvent("focus"));
		expect(editor.element.classList.contains("focused")).toBe(true);

		editable.dispatchEvent(new FocusEvent("blur"));
		expect(editor.element.classList.contains("focused")).toBe(false);
	});

	describe("value sync (change is throttled while typing)", () => {
		beforeEach(() => jest.useFakeTimers());
		afterEach(() => jest.useRealTimers());

		const type = (editor: MessageEditor, text: string) => {
			const editable = editor.editor.editable;
			editable.textContent = text;
			editable.dispatchEvent(new Event("input", { bubbles: true }));
		};

		// самое важное: отправка формы не должна унести устаревшее значение
		it("syncs the value before submit even when validation is disabled", () => {
			const { input, form } = setup({ value: "привет" });
			form.noValidate = true;
			const editor = new MessageEditor(input);

			type(editor, "привет всем");
			expect(input.value).toBe("привет");

			form.dispatchEvent(new SubmitEvent("submit", { cancelable: true }));

			expect(input.value).toBe("привет всем");
		});

		it("getValue() sees the pending edit", () => {
			const { input } = setup({ value: "привет" });
			const editor = new MessageEditor(input);

			type(editor, "привет всем");

			expect(editor.getValue()).toBe("привет всем");
		});

		it("delivers messageeditor-change after the throttle window", () => {
			const { input } = setup();
			const editor = new MessageEditor(input);
			const handler = jest.fn();
			editor.onChange(handler);

			type(editor, "текст");
			expect(handler).not.toHaveBeenCalled();

			jest.advanceTimersByTime(150);
			expect(handler).toHaveBeenCalledWith(expect.objectContaining({ value: "текст" }));
		});
	});

	it("puts the value element back on destroy", () => {
		const { input, form } = setup({ value: "текст" });
		const editor = new MessageEditor(input);
		expect(form.querySelector(`.${ROOT_CLASS}`)).not.toBeNull();

		editor.destroy();

		expect(form.querySelector(`.${ROOT_CLASS}`)).toBeNull();
		expect(input.parentElement).toBe(form);
	});

	// класс уводит поле с экрана (position/opacity/visibility), а tabindex подменяется на -1 —
	// без снятия того и другого после destroy поле остаётся невидимым и недоступным с клавиатуры
	it("restores the value element to its original state on destroy", () => {
		const { input } = setup({ value: "текст" });
		new MessageEditor(input).destroy();

		expect(input.classList.contains(INPUT_CLASS)).toBe(false);
		expect(input.hasAttribute("tabindex")).toBe(false);
	});

	it("restores an explicit tabindex, including for a disabled field", () => {
		const { input } = setup({ disabled: true });
		input.setAttribute("tabindex", "3");

		new MessageEditor(input).destroy();

		expect(input.getAttribute("tabindex")).toBe("3");
	});
});

// Enter в конце строки с конструкцией: подсветка перестраивает разметку и возвращает каретку
// по текстовым смещениям. Пока конец строки и начало следующей были неразличимы, каретка
// возвращалась на строку выше — новая строка появлялась, а печать шла в прежнюю.
describe("caret after a line with markup", () => {
	const pressEnter = (editor: MessageEditor) =>
		editor.editor.editable.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Enter", cancelable: true, bubbles: true })
		);

	it("stays on the new line", () => {
		const { input } = setup({ value: "Привет, {ИМЯ}" });
		const editor = new MessageEditor(input, { personalization: true });
		const block = editor.editor.editable.firstElementChild!;

		caretAt(block, block.childNodes.length); // конец строки, сразу за конструкцией
		pressEnter(editor);

		const selection = window.getSelection()!;
		const breaks = block.querySelectorAll("br");
		expect(breaks).toHaveLength(2); // сам перенос и заполнитель новой строки

		// каретка между переносом и заполнителем — это и есть новая строка
		expect(selection.anchorNode).toBe(block);
		expect(selection.anchorOffset).toBe(Array.from(block.childNodes).indexOf(breaks[0]) + 1);
	});

	it("keeps typing on the new line", () => {
		const { input } = setup({ value: "[раз|два]" });
		const editor = new MessageEditor(input);

		const block = editor.editor.editable.firstElementChild!;
		caretAt(block, block.childNodes.length);
		pressEnter(editor);

		editor.editor.insertText("x");
		expect(editor.getValue()).toBe("[раз|два]\nx");
	});
});

// Снять разметку разом нужнее всего там, где текст приносят вставкой.
describe("clear format action", () => {
	const eraseButton = () =>
		document.querySelector<HTMLButtonElement>('.ui-richeditor-toolbar [data-editor-action="erase"]')!;

	it("clears the formatting of the selection", () => {
		const { input } = setup({ value: "**раз** два" });
		const editor = new MessageEditor(input);
		editor.editor.editable.dispatchEvent(new FocusEvent("focus"));

		const bold = editor.editor.editable.querySelector("b")!.firstChild!;
		const selection = window.getSelection()!;
		const range = document.createRange();
		range.setStart(bold, 0);
		range.setEnd(bold, 3);
		selection.removeAllRanges();
		selection.addRange(range);

		eraseButton().dispatchEvent(new MouseEvent("click", { bubbles: true }));

		expect(editor.getValue()).toBe("раз два");
	});

	it("is disabled while there is nothing to clear", () => {
		const { input } = setup({ value: "раз два" });
		const editor = new MessageEditor(input);
		editor.editor.editable.dispatchEvent(new FocusEvent("focus"));

		expect(eraseButton().disabled).toBe(true);
	});
});
