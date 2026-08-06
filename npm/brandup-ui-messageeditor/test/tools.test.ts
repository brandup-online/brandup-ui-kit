/**
 * @jest-environment jsdom
 */
import { ALL_FORMAT_TOOLS, TOOLBAR_CLASS } from "@brandup/ui-richeditor";
import MessageEditor, { type MessageEditorOptions } from "../source/messageeditor";

function setup(options: MessageEditorOptions = {}, attrs: Record<string, string> = {}, value = "") {
	document.body.innerHTML = "";
	const form = document.createElement("form");
	const input = document.createElement("textarea");
	input.value = value;
	for (const name in attrs) input.setAttribute(name, attrs[name]);
	form.appendChild(input);
	document.body.appendChild(form);

	const editor = new MessageEditor(input, options);
	// панель строится по фокусу — до него у неё нет кнопок
	editor.editor.editable.dispatchEvent(new FocusEvent("focus"));

	return editor;
}

const toolButton = (tool: string) =>
	document.querySelector(`.${TOOLBAR_CLASS} .format-button[data-format-tool="${tool}"]`);
const actionButton = (action: string) =>
	document.querySelector(`.${TOOLBAR_CLASS} .action-button[data-editor-action="${action}"]`);
const hostButton = (name: string) => document.querySelector(`.${TOOLBAR_CLASS} [data-toolbar-button="${name}"]`);

describe("format tools of the message", () => {
	it("takes all of them by default", () => {
		expect(setup().tools).toEqual(ALL_FORMAT_TOOLS);
	});

	// Канал понимает не всё: кнопка, разметку которой он не покажет, хуже отсутствующей.
	it.each([
		["bold italic", ["bold", "italic"]],
		["underline bold", ["bold", "underline"]], // порядок объявления, а не написания
		["bold смайлик", ["bold"]], // незнакомое значение молча отбрасывается
		["", []],
	])("reads data-tools=%j", (attr, expected) => {
		expect(setup({}, { "data-tools": attr }).tools).toEqual(expected);
	});

	// как и у переменных с блоками: приложение знает набор точнее, чем разметка от сервера
	it("prefers the option over the attribute", () => {
		expect(setup({ tools: ["code"] }, { "data-tools": "bold italic" }).tools).toEqual(["code"]);
	});

	it("shows a button only for a declared tool", () => {
		setup({ tools: ["bold", "italic"] });

		expect(toolButton("bold")).not.toBeNull();
		expect(toolButton("italic")).not.toBeNull();
		expect(toolButton("strike")).toBeNull();
		expect(toolButton("underline")).toBeNull();
	});

	// снимать нечего, когда не объявлено ни одного инструмента
	it("drops the erase button along with the last tool", () => {
		setup({ tools: ["bold"] });
		expect(actionButton("erase")).not.toBeNull();

		setup({ tools: [] });
		expect(actionButton("erase")).toBeNull();
	});

	// доменные кнопки от разметки не зависят: рандомизация и переменные — не форматирование
	it("keeps the domain buttons with no tools at all", () => {
		setup({ tools: [], personalization: true });

		expect(hostButton("randomize")).not.toBeNull();
		expect(hostButton("variable")).not.toBeNull();
	});

	// Разметку сняли всю — панель остаётся ради рандомизации, но пустой: ни кнопок форматов,
	// ни блоков, ни очистки. Рандомизация не про разметку, её канал не касается.
	it("leaves the toolbar with the domain button alone", () => {
		setup({ tools: [], blocks: [], personalization: false });

		const toolbar = document.querySelector(`.${TOOLBAR_CLASS}.visible`)!;
		expect(toolbar).not.toBeNull();
		expect(toolbar.querySelectorAll(".format-button, .block-button, .action-button")).toHaveLength(0);
		expect(toolbar.querySelectorAll(".host-button")).toHaveLength(1);
		// разделитель отделяет доменные кнопки от штатных — отделять не от чего
		expect(toolbar.querySelector(".split")).toBeNull();
	});

	// Значение важнее панели: разметка снятого инструмента остаётся в тексте как есть и уезжает
	// обратно ровно такой же. Иначе ограничение набора тихо портило бы уже написанное сообщение.
	it("does not touch the markup of a tool it no longer offers", () => {
		const editor = setup({ tools: ["bold"] }, {}, "**жирный** и _курсив_");

		expect(editor.getValue()).toBe("**жирный** и _курсив_");
		expect(editor.editor.editable.querySelector("b")).not.toBeNull(); // объявленный — разметкой
		expect(editor.editor.editable.textContent).toContain("_курсив_"); // снятый — текстом
	});

	// Показ готового сообщения — тот же компонент, только без правки. Разметку он обязан
	// показывать и там: иначе вместо жирного читатель видел бы звёздочки.
	it.each([["readonly"], ["disabled"]])("shows the formatting of the value when %s", (attr) => {
		const editor = setup({}, { [attr]: "" }, "**жирный** текст");

		expect(editor.editor.editable.querySelector("b")).not.toBeNull();
		expect(editor.getValue()).toBe("**жирный** текст");
	});

	// история отмены живёт вместе с форматированием, а нужна и тексту без разметки
	it("keeps undo working with no tools", () => {
		const editor = setup({ tools: [] }, {}, "раз");

		editor.editor.insertText(" два");
		expect(editor.getValue()).toBe("раз два");
		expect(editor.editor.canUndo).toBe(true);

		editor.editor.undo();
		expect(editor.getValue()).toBe("раз");
	});
});
