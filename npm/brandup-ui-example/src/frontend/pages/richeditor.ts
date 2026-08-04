import { Page } from "./base";
import html from "./richeditor.html";
import "./richeditor.less";
import RichEditor, {
	ALL_FORMAT_TOOLS,
	parseEditorActions,
	parseFormatTools,
	type FormatMarkers,
	type FormatStorage,
	type RichEditorOptions,
} from "@brandup/ui-richeditor";

export default class RichEditorPage extends Page {
	private __editors = new Map<HTMLElement, RichEditor>();

	get typeName(): string {
		return "RichEditorPage";
	}
	get header(): string {
		return "RichEditor";
	}

	protected async onRenderContent(container: HTMLElement) {
		container.insertAdjacentHTML("beforeend", html);

		container.querySelectorAll<HTMLElement>("[data-richeditor]").forEach((elem) => this.__create(elem));

		// кнопки вызывают методы редактора из того же блока .field
		this.registerCommand("editor-method", (context) => {
			const button = context.target as HTMLElement;
			const elem = button.closest(".field")?.querySelector<HTMLElement>("[data-richeditor]");
			const editor = elem ? this.__editors.get(elem) : null;
			if (!editor) return;

			switch (button.getAttribute("data-method")) {
				case "clear":
					editor.clearFormat();
					break;
				case "clear-all":
					editor.clearAllFormat();
					break;
				case "undo":
					editor.undo();
					break;
				case "redo":
					editor.redo();
					break;
				case "reset":
					editor.setValue("Текст с <b>жирным</b> и <i>курсивом</i>.");
					break;
			}

			editor.focus();
		});
	}

	// Параметры редактора берутся из data-атрибутов — разбор такой же, как делает TextBox.
	private __create(elem: HTMLElement) {
		const format = elem.hasAttribute("data-format");
		const storage: FormatStorage = elem.getAttribute("data-format-storage") === "markdown" ? "markdown" : "html";

		const markers: Partial<FormatMarkers> = {};
		for (const tool of ALL_FORMAT_TOOLS) {
			const marker = elem.getAttribute(`data-md-${tool}`);
			if (marker) markers[tool] = marker;
		}

		const options: RichEditorOptions = {
			format,
			tools: parseFormatTools(elem.getAttribute("data-format-tools")),
			actions: parseEditorActions(elem.getAttribute("data-editor-actions")),
			storage,
			markers,
			multiline: elem.hasAttribute("data-multiline"),
			readonly: elem.hasAttribute("data-readonly"),
			placeholder: elem.getAttribute("data-placeholder"),
			value: elem.getAttribute("data-value") ?? "",
		};

		// панель по умолчанию живёт в body; с контейнером — позиционируется относительно него
		if (elem.hasAttribute("data-toolbar-container")) options.toolbarContainer = elem.parentElement;

		const editor = new RichEditor(elem, options);
		this.__editors.set(elem, editor);

		this.__bindValue(elem, editor);
	}

	// Живое значение под полем: показывает, что уйдёт в хранилище, и состояние истории.
	private __bindValue(elem: HTMLElement, editor: RichEditor) {
		const valueElem = elem.closest(".field")?.querySelector<HTMLElement>(".value");
		if (!valueElem) return;

		const print = () => {
			const value = editor.getValue();
			const undo = editor.canUndo ? "да" : "нет";
			const redo = editor.canRedo ? "да" : "нет";
			valueElem.textContent = `${value || "(пусто)"}\n\nundo: ${undo} · redo: ${redo}`;
		};

		editor.onChange(print);
		print();
	}

	override destroy() {
		this.__editors.forEach((editor) => editor.destroy());
		this.__editors.clear();

		super.destroy();
	}
}
