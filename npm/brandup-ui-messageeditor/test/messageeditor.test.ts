/**
 * @jest-environment jsdom
 */
import MessageEditor, { ROOT_CLASS, INPUT_CLASS, EMOJI_CLASS } from "../source/messageeditor";

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
		expect(toolbar.querySelectorAll(".format-button")).toHaveLength(4);
		// смайлики вынесены в собственную кнопку компонента
		expect(toolbar.querySelector(".action-button")).toBeNull();
	});

	// кнопка живёт внутри плашки справа от текста и доступна сразу, не дожидаясь фокуса
	it("puts its own emoji button inside the bubble", () => {
		const { input } = setup();
		const editor = new MessageEditor(input);

		const button = editor.element.querySelector(`.${EMOJI_CLASS}`)!;
		expect(button).not.toBeNull();
		expect(button.parentElement!.classList.contains("bubble")).toBe(true);
		expect(button.previousElementSibling!.classList.contains("ui-richeditor")).toBe(true);
		expect(document.querySelector(".ui-richeditor-toolbar.visible")).toBeNull(); // фокуса ещё не было
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

	it("puts the value element back on destroy", () => {
		const { input, form } = setup({ value: "текст" });
		const editor = new MessageEditor(input);
		expect(form.querySelector(`.${ROOT_CLASS}`)).not.toBeNull();

		editor.destroy();

		expect(form.querySelector(`.${ROOT_CLASS}`)).toBeNull();
		expect(input.parentElement).toBe(form);
	});
});
