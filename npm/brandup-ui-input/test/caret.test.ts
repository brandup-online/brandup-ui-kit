/**
 * @jest-environment jsdom
 */
import { EditorInputControl, parseFocusCaret, type FocusCaret, type ValueEditor } from "../source/index";

const CHANGE_EVENT = "test-change";

/** Редактор-заглушка: запоминает, о какой каретке его просили. */
class FakeEditor implements ValueEditor {
	readonly editable = document.createElement("div");
	atEnd?: boolean;

	constructor() {
		this.editable.tabIndex = 0; // иначе jsdom фокус в div не поставит
		this.editable.textContent = "написанный текст";
	}

	setValue(): void {}
	flushChange(): void {}

	focus(atEnd?: boolean): void {
		this.atEnd = atEnd;
		this.editable.focus();
	}

	destroy(): void {}
}

class TestControl extends EditorInputControl<FakeEditor, string> {
	constructor(valueElem: HTMLInputElement, caret?: FocusCaret, legacy?: { focusAtEnd?: boolean }) {
		const container = document.createElement("div");
		valueElem.insertAdjacentElement("afterend", container);
		container.insertAdjacentElement("afterbegin", valueElem);

		super("Test.EditorControl", container, valueElem, undefined, {
			changeEvent: CHANGE_EVENT,
			caret,
			...legacy,
		});

		const editor = new FakeEditor();
		container.insertAdjacentElement("beforeend", editor.editable);
		this.__attachEditor(editor);
	}

	get testEditor(): FakeEditor {
		return this.__editor;
	}
}

function setup(caret?: FocusCaret): TestControl {
	document.body.innerHTML = "";
	const form = document.createElement("form");
	const input = document.createElement("input");
	input.type = "text";
	form.appendChild(input);
	document.body.appendChild(form);
	return new TestControl(input, caret);
}

describe("parseFocusCaret", () => {
	it("reads the declared modes", () => {
		expect(parseFocusCaret("start")).toBe("start");
		expect(parseFocusCaret("all")).toBe("all");
		expect(parseFocusCaret("end")).toBe("end");
	});

	// режим по умолчанию: фокус получают, чтобы продолжать писать
	it("falls back to the end for anything else", () => {
		expect(parseFocusCaret(null)).toBe("end");
		expect(parseFocusCaret(undefined)).toBe("end");
		expect(parseFocusCaret("")).toBe("end");
		expect(parseFocusCaret("middle")).toBe("end");
	});
});

describe("EditorInputControl focus caret", () => {
	it("puts the caret at the end by default", () => {
		const control = setup();

		expect(control.caret).toBe("end");

		control.focus();

		expect(control.testEditor.atEnd).toBe(true);
	});

	it("puts the caret at the start when asked", () => {
		const control = setup("start");

		expect(control.caret).toBe("start");

		control.focus();

		expect(control.testEditor.atEnd).toBe(false);
	});

	// «в начало» ставим сами: редактор без просьбы о конце каретку никуда не двигает
	it("collapses the selection to the start when asked", () => {
		const control = setup("start");

		control.focus();

		const selection = window.getSelection();
		expect(selection?.isCollapsed).toBe(true);
		expect(selection?.anchorOffset).toBe(0);
		expect(control.testEditor.editable.contains(selection?.anchorNode ?? null)).toBe(true);
	});

	// устаревший флаг, пока его ещё передают
	it("still understands the deprecated focusAtEnd", () => {
		document.body.innerHTML = "";
		const input = document.createElement("input");
		document.body.appendChild(input);

		expect(new TestControl(input, undefined, { focusAtEnd: false }).caret).toBe("start");
		expect(new TestControl(input, undefined, { focusAtEnd: true }).caret).toBe("end");
	});

	// весь текст выделяют, чтобы следующий ввод его заменил
	it("selects the whole text when asked", () => {
		const control = setup("all");

		expect(control.caret).toBe("all");

		control.focus();

		const editable = control.testEditor.editable;
		expect(document.activeElement).toBe(editable);
		const selection = window.getSelection();
		expect(selection?.toString()).toBe(editable.textContent);
	});
});
