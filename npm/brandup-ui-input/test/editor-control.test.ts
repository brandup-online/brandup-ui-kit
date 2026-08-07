/**
 * @jest-environment jsdom
 */
import { EditorInputControl, type ValueEditor } from "../source/index";

const CHANGE_EVENT = "test-change";

/** Минимальный редактор под структурный контракт {@link ValueEditor} — без richeditor. */
class FakeEditor implements ValueEditor {
	readonly editable = document.createElement("div");
	value = "";
	destroyed = false;
	flushes = 0;

	constructor(private readonly onSet: (value: string) => void) {
		this.editable.tabIndex = 0; // иначе jsdom фокус в div не поставит
	}

	setValue(value: string): void {
		this.value = value;
		this.onSet(value);
	}

	flushChange(): void {
		this.flushes++;
	}

	focus(): void {
		this.editable.focus();
	}

	destroy(): void {
		this.destroyed = true;
	}
}

class TestControl extends EditorInputControl<FakeEditor, string> {
	/** Ссылка на последний созданный контрол — включая тот, чей конструктор упал после `super(...)`. */
	static last?: TestControl;

	constructor(valueElem: HTMLInputElement, failAfterSuper = false) {
		const container = document.createElement("div");
		valueElem.insertAdjacentElement("afterend", container);
		container.insertAdjacentElement("afterbegin", valueElem);

		super("Test.EditorControl", container, valueElem, undefined, { changeEvent: CHANGE_EVENT });

		TestControl.last = this;

		// падение наследника после super(): базовый класс уже привязал элемент и повесил
		// слушатели формы, а редактора у него так и не будет
		if (failAfterSuper) throw new Error("ctor failed after super()");

		const editor = new FakeEditor((value) => (this.__valueElem.value = value));
		container.insertAdjacentElement("beforeend", editor.editable);

		this.__attachEditor(editor);
		editor.value = this.__valueElem.value;
	}

	get testEditor(): FakeEditor {
		return this.__editor;
	}
}

function setup(): { input: HTMLInputElement; form: HTMLFormElement } {
	document.body.innerHTML = "";
	const form = document.createElement("form");
	const input = document.createElement("input");
	input.type = "text";
	form.appendChild(input);
	document.body.appendChild(form);
	return { input, form };
}

const afterEventLoop = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("EditorInputControl focus", () => {
	// выключенное поле фокус не принимает — нативный disabled input игнорирует focus() сам,
	// а редактируемый элемент контрола программный фокус принял бы и увёл к себе прокрутку
	it("focus() does not move focus into a disabled control", () => {
		const { input } = setup();
		input.disabled = true;
		const control = new TestControl(input);

		const outside = document.createElement("button");
		document.body.appendChild(outside);
		outside.focus();

		control.focus();

		expect(document.activeElement).toBe(outside);
	});

	// поле только для чтения фокусируется нативно: текст читают, выделяют и копируют
	it("focus() still works on a readonly control", () => {
		const { input } = setup();
		input.readOnly = true;
		const control = new TestControl(input);

		control.focus();

		expect(document.activeElement).toBe(control.testEditor.editable);
	});
});

// form.reset() возвращает поле-носитель к defaultValue, а редактор об этом сам не узнал бы —
// следующая синхронизация перезаписала бы сброс обратно. Механика общая для всех контролов
// на редакторе, поэтому живёт в базовом классе, а не в отдельном наследнике.
describe("EditorInputControl form reset", () => {
	it("realigns the editor with the default value after form.reset()", async () => {
		const { input, form } = setup();
		input.defaultValue = "initial";
		const control = new TestControl(input);

		control.setValue("edited");
		expect(input.value).toBe("edited");

		form.reset();
		await afterEventLoop(); // сброс применяется после события

		expect(control.testEditor.value).toBe("initial");
		expect(control.getValue()).toBe("initial");
	});

	it("leaves the editor untouched when the reset was cancelled", async () => {
		const { input, form } = setup();
		input.defaultValue = "initial";
		const control = new TestControl(input);
		form.addEventListener("reset", (e) => e.preventDefault());

		control.setValue("edited");
		form.reset();
		await afterEventLoop();

		expect(control.testEditor.value).toBe("edited");
	});

	it("does not touch a control destroyed before the reset was applied", async () => {
		const { input, form } = setup();
		input.defaultValue = "initial";
		const control = new TestControl(input);
		const editor = control.testEditor;

		control.setValue("edited");
		form.reset();
		control.destroy(); // сброс ещё не применён — доводить его уже некуда
		await afterEventLoop();

		expect(editor.value).toBe("edited");
	});
});

// Конструктор наследника может упасть после super() — например, редактор не принял значение
// из разметки. Базовый класс к этому моменту уже привязал элемент, повесил слушатель submit
// на форму и слушатель в фазе перехвата на документе, а редактора у контрола нет и не будет.
describe("EditorInputControl without an attached editor", () => {
	const construct = () => {
		const { input, form } = setup();
		TestControl.last = undefined;
		expect(() => new TestControl(input, true)).toThrow("ctor failed after super()");
		return { input, form, control: TestControl.last! };
	};

	it("keeps the base methods harmless", () => {
		const { control } = construct();

		expect(() => control.focus()).not.toThrow();
		expect(() => control.setValue("x")).not.toThrow();
		expect(control.getValue()).toBe("");
		expect(control.hasValue()).toBe(false);
	});

	// иначе TypeError из обработчика ломал бы отправку любой формы страницы
	it("does not throw from the form submit listeners", () => {
		const { form } = construct();

		const errors: unknown[] = [];
		const onError = (e: ErrorEvent) => errors.push(e.error);
		window.addEventListener("error", onError);
		try {
			form.dispatchEvent(new SubmitEvent("submit", { cancelable: true, bubbles: true }));
		} finally {
			window.removeEventListener("error", onError);
		}

		expect(errors).toEqual([]);
	});

	// destroy() падал на редакторе ДО super.destroy() — слушатель на документе оставался навсегда
	it("destroy() still unwires the base and restores the value element", () => {
		const { input, control } = construct();
		const container = control.element;

		expect(() => control.destroy()).not.toThrow();

		expect(container.isConnected).toBe(false);
		expect(input.isConnected).toBe(true);
	});
});
