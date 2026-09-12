import { Page } from "./base";
import { pickContent } from "../i18n";
import "./richeditor.less";
import RichEditor, {
	ALL_FORMAT_TOOLS,
	parseBlockTypes,
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
		return this.app.model.texts.t((m) => m.pages.richeditor);
	}

	protected async onRenderContent(container: HTMLElement) {
		container.insertAdjacentHTML(
			"beforeend",
			await pickContent({ ru: () => import("./richeditor.html"), en: () => import("./richeditor.en.html") })
		);

		container.querySelectorAll<HTMLElement>("[data-richeditor]").forEach((elem) => this.__create(elem));

		// кнопки вызывают методы редактора из того же блока .field
		this.registerCommand("editor-method", (context) => {
			const button = context.target as HTMLElement;
			const elem = button.closest(".field")?.querySelector<HTMLElement>("[data-richeditor]");
			const editor = elem ? this.__editors.get(elem) : null;
			if (!editor) return;

			switch (button.dataset.method) {
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
					editor.setValue(this.app.model.texts.t((m) => m.demo.richeditor.reset));
					break;
			}

			editor.focus();
		});
	}

	// Параметры редактора берутся из data-атрибутов — разбор такой же, как делает TextBox.
	private __create(elem: HTMLElement) {
		const format = elem.hasAttribute("data-format");
		const storage: FormatStorage = elem.dataset.formatStorage === "markdown" ? "markdown" : "html";

		const markers: Partial<FormatMarkers> = {};
		for (const tool of ALL_FORMAT_TOOLS) {
			const marker = elem.getAttribute(`data-format-md-${tool}`);
			if (marker) markers[tool] = marker;
		}

		const options: RichEditorOptions = {
			format,
			tools: parseFormatTools(elem.dataset.formatTools ?? null),
			actions: parseEditorActions(elem.dataset.editorActions ?? null),
			storage,
			markers,
			multiline: elem.hasAttribute("data-multiline"),
			blocks: parseBlockTypes(elem.dataset.blocks ?? null),
			readonly: elem.hasAttribute("data-readonly"),
			placeholder: elem.dataset.placeholder,
			value: elem.dataset.value ?? "",
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

		const texts = this.app.model.texts;
		const flag = (value: boolean) =>
			value ? texts.t((m) => m.demo.richeditor.yes) : texts.t((m) => m.demo.richeditor.no);

		const print = () => {
			const value = editor.getValue() || texts.t((m) => m.demo.richeditor.empty);
			valueElem.textContent = `${value}\n\nundo: ${flag(editor.canUndo)} · redo: ${flag(editor.canRedo)}`;
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
