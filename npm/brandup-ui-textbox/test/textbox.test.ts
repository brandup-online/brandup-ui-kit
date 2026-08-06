/**
 * @jest-environment jsdom
 */
import TextBox, { ROOT_CLASS, INPUT_CLASS, MAX_EMAIL_LENGTH } from "../source/textbox";

function setup(
	opts: { value?: string; required?: boolean; type?: string; maxlength?: number; copyButton?: boolean } = {}
) {
	document.body.innerHTML = "";
	const form = document.createElement("form");
	const input = document.createElement("input");
	input.type = opts.type ?? "text";
	if (opts.value !== undefined) input.value = opts.value;
	if (opts.required) input.required = true;
	if (opts.maxlength) input.maxLength = opts.maxlength;
	if (opts.copyButton) input.setAttribute("data-copybutton", "true");
	form.appendChild(input);
	document.body.appendChild(form);
	return { input, form };
}

describe("TextBox", () => {
	it("wraps the input in a ui-textbox container", () => {
		const { input } = setup();
		new TextBox(input);

		const container = input.parentElement!;
		expect(container.classList.contains(ROOT_CLASS)).toBe(true);
		// the contenteditable .input div exists inside the container
		expect(container.querySelector(".ui-richeditor")).not.toBeNull();
	});

	// оформление из разметки должно применяться к тому, что видно, — то есть к контейнеру,
	// а не к уведённому с экрана полю
	it("moves the author's classes to the container and hides the input", () => {
		const { input } = setup();
		input.className = "wide accent";

		const tb = new TextBox(input);

		expect(tb.element!.classList.contains("wide")).toBe(true);
		expect(tb.element!.classList.contains("accent")).toBe(true);
		expect(tb.element!.classList.contains(ROOT_CLASS)).toBe(true);
		expect(tb.element!.classList.contains(INPUT_CLASS)).toBe(false);
		expect(input.classList.contains(INPUT_CLASS)).toBe(true);
	});

	it("getValue() returns the trimmed underlying value", () => {
		const { input } = setup({ value: "  hello  " });
		const tb = new TextBox(input);
		expect(tb.getValue()).toBe("hello");
	});

	it("allows typing to replace a full selection at maxlength", () => {
		const { input } = setup({ value: "abcde", maxlength: 5 });
		const tb = new TextBox(input);
		const editable = tb.editor.editable;

		// выделяем весь текст — ввод символа заменит его, длина не вырастет
		const sel = window.getSelection()!;
		sel.removeAllRanges();
		const r = document.createRange();
		r.selectNodeContents(editable);
		sel.addRange(r);

		const e = new KeyboardEvent("keydown", { key: "x", cancelable: true, bubbles: true });
		editable.dispatchEvent(e);

		expect(e.defaultPrevented).toBe(false); // не отклонён — выделение будет заменено
	});

	it("declares the copy command via data-command so the click handler finds it", () => {
		const { input } = setup({ value: "text", copyButton: true });
		new TextBox(input);

		const button = input.parentElement!.querySelector("button")!;
		// обработчик @brandup/ui читает dataset.command — атрибут command его не активирует
		expect(button.dataset.command).toBe("copy-text");
	});

	it("setValue() updates the underlying input value", () => {
		const { input } = setup();
		const tb = new TextBox(input);
		tb.setValue("world");
		expect(input.value).toBe("world");
	});

	it("setValue() does not inject HTML (XSS regression)", () => {
		const { input } = setup();
		const tb = new TextBox(input);

		tb.setValue("<img src=x onerror=alert(1)>");

		const editable = tb.element!.querySelector(".ui-richeditor")!;
		expect(editable.querySelector("img")).toBeNull();
		expect(editable.textContent).toBe("<img src=x onerror=alert(1)>");
	});

	it("hasValue() reflects emptiness", () => {
		const { input } = setup();
		const tb = new TextBox(input);
		expect(tb.hasValue()).toBe(false);

		tb.setValue("x");
		expect(tb.hasValue()).toBe(true);
	});

	it("onChange() handler fires on setValue with the new value", () => {
		const { input } = setup();
		const tb = new TextBox(input);
		const handler = jest.fn();
		tb.onChange(handler);

		tb.setValue("typed");

		expect(handler).toHaveBeenCalledWith(expect.objectContaining({ value: "typed" }));
	});

	it("validate() returns true for valid input", () => {
		const { input } = setup({ value: "ok" });
		const tb = new TextBox(input);
		expect(tb.validate()).toBe(true);
		expect(tb.element!.classList.contains("invalid")).toBe(false);
	});

	it("validate() marks invalid class when required field is empty", () => {
		const { input } = setup({ required: true });
		const tb = new TextBox(input);

		expect(tb.validate()).toBe(false);
		expect(tb.element!.classList.contains("invalid")).toBe(true);
	});

	it("blocks input at maxlength and flashes the incorrect state", () => {
		document.body.innerHTML = "";
		const input = document.createElement("input");
		input.type = "text";
		input.maxLength = 3;
		input.value = "abc";
		document.body.appendChild(input);

		const tb = new TextBox(input);
		const editable = tb.element!.querySelector(".ui-richeditor") as HTMLElement;

		const e = new KeyboardEvent("keydown", { key: "x", cancelable: true, bubbles: true });
		editable.dispatchEvent(e);

		expect(e.defaultPrevented).toBe(true); // символ не вставлен
		expect(tb.element!.classList.contains("incorrect")).toBe(true);
	});

	it("double-click word selection trims whitespace at word boundaries", () => {
		const { input } = setup({ value: "foo bar baz" });
		const tb = new TextBox(input);
		const editor = tb.element!.querySelector(".ui-richeditor")! as HTMLElement;
		const textNode = editor.firstChild!;

		// имитируем выделение " bar " с пробелами по краям
		const range = document.createRange();
		range.setStart(textNode, 3);
		range.setEnd(textNode, 8);
		const sel = window.getSelection()!;
		sel.removeAllRanges();
		sel.addRange(range);

		editor.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));

		expect(window.getSelection()!.toString()).toBe("bar");
	});

	it("normalizes whitespace after initialization (collapse doubles, trim edges)", () => {
		const { input } = setup({ value: "  a   b  " });
		const tb = new TextBox(input);

		expect(tb.getValue()).toBe("a b");
		expect(tb.element!.querySelector(".ui-richeditor")!.textContent).toBe("a b");
	});

	it("normalizes whitespace on setValue", () => {
		const { input } = setup();
		const tb = new TextBox(input);

		tb.setValue("x    y");

		expect(tb.getValue()).toBe("x y");
	});

	it("normalizes whitespace on blur", () => {
		const { input } = setup();
		const tb = new TextBox(input);
		const editor = tb.element!.querySelector(".ui-richeditor")! as HTMLElement;

		editor.textContent = "a   b  ";
		editor.dispatchEvent(new FocusEvent("blur", { bubbles: true }));

		expect(editor.textContent).toBe("a b");
		expect(tb.getValue()).toBe("a b");
	});

	it("destroy() removes the container and restores the original input to the DOM", () => {
		const { input } = setup();
		const tb = new TextBox(input);
		const container = tb.element!;

		tb.destroy();

		expect(container.isConnected).toBe(false);
		expect(input.isConnected).toBe(true);
	});

	// класс уводит поле с экрана (position/opacity/visibility), а tabindex подменяется на -1 —
	// без снятия того и другого после destroy поле остаётся невидимым и недоступным с клавиатуры
	it("destroy() restores the input to its original state", () => {
		const { input } = setup({ value: "текст" });
		new TextBox(input).destroy();

		expect(input.classList.contains(INPUT_CLASS)).toBe(false);
		expect(input.hasAttribute("tabindex")).toBe(false);
	});

	it("destroy() restores an explicit tabindex, including for a disabled field", () => {
		const { input } = setup();
		input.disabled = true;
		input.setAttribute("tabindex", "3");

		new TextBox(input).destroy();

		expect(input.getAttribute("tabindex")).toBe("3");
	});

	// компонент нормализует ограничения типа под себя — после снятия поле не должно остаться с ними
	it("destroy() restores the type constraints it normalized", () => {
		const { input: email } = setup({ type: "email" });
		new TextBox(email).destroy();
		expect(email.hasAttribute("maxlength")).toBe(false);

		const { input: number } = setup({ type: "number" });
		new TextBox(number).destroy();
		expect(number.hasAttribute("step")).toBe(false);
	});

	// у поля без атрибута maxlength свойство равно -1, а не 0 — на этом ограничение RFC терялось
	it("caps the email length even when maxlength is not set", () => {
		const { input } = setup({ type: "email" });
		const tb = new TextBox(input);

		expect(input.maxLength).toBe(MAX_EMAIL_LENGTH);
		expect(tb.maxlength).toBe(MAX_EMAIL_LENGTH);
	});

	it("keeps a stricter maxlength for email and lowers a larger one", () => {
		const { input: strict } = setup({ type: "email", maxlength: 64 });
		expect(new TextBox(strict).maxlength).toBe(64);

		const { input: loose } = setup({ type: "email", maxlength: 1000 });
		expect(new TextBox(loose).maxlength).toBe(MAX_EMAIL_LENGTH);
	});

	// подадреса вида user+tag@example.com иначе нельзя было бы набрать
	it("accepts a plus sign in an email", () => {
		const { input } = setup({ type: "email", value: "user" });
		const tb = new TextBox(input);
		const editable = tb.editor.editable;

		const sel = window.getSelection()!;
		sel.removeAllRanges();
		const r = document.createRange();
		r.selectNodeContents(editable);
		r.collapse(false);
		sel.addRange(r);

		const e = new KeyboardEvent("keydown", { key: "+", cancelable: true, bubbles: true });
		editable.dispatchEvent(e);

		expect(e.defaultPrevented).toBe(false);
	});

	// ввод символа на пределе мигает ошибкой — вставка не должна молча ничего не делать
	it("rejects a paste that does not fit at all and flashes the incorrect state", () => {
		const { input } = setup({ value: "abcde", maxlength: 5 });
		const tb = new TextBox(input);

		const sel = window.getSelection()!;
		sel.removeAllRanges();
		const r = document.createRange();
		r.selectNodeContents(tb.editor.editable);
		r.collapse(false);
		sel.addRange(r);

		const e = new Event("paste", { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown };
		e.clipboardData = { getData: (t: string) => (t === "text/plain" ? "xyz" : "") };
		tb.editor.editable.dispatchEvent(e);

		expect(tb.getValue()).toBe("abcde");
		expect(tb.element!.classList.contains("incorrect")).toBe(true);
	});

	describe("value sync (change is throttled while typing)", () => {
		beforeEach(() => jest.useFakeTimers());
		afterEach(() => jest.useRealTimers());

		const type = (tb: TextBox, text: string) => {
			tb.editor.editable.textContent = text;
			tb.editor.editable.dispatchEvent(new Event("input", { bubbles: true }));
		};

		// самое важное: отправка формы не должна унести устаревшее значение
		it("syncs the value before submit even when validation is disabled", () => {
			const { input, form } = setup({ value: "a" });
			form.noValidate = true; // до validate() дело не дойдёт — сброс обязан быть отдельным
			const tb = new TextBox(input);

			type(tb, "abc");
			expect(input.value).toBe("a"); // ещё не синхронизировано

			form.dispatchEvent(new SubmitEvent("submit", { cancelable: true }));

			expect(input.value).toBe("abc");
		});

		// приложение часто вешает обработчик формы до инициализации контролов — он всё равно
		// должен увидеть актуальное значение, поэтому синхронизация идёт в фазе перехвата
		it("syncs the value before a submit handler registered earlier than the control", () => {
			const { input, form } = setup({ value: "a" });

			let seenByForm: string | null = null;
			form.addEventListener("submit", () => (seenByForm = input.value));

			const tb = new TextBox(input); // контрол создан ПОСЛЕ обработчика формы
			type(tb, "abc");

			form.dispatchEvent(new SubmitEvent("submit", { cancelable: true }));

			expect(seenByForm).toBe("abc");
		});

		it("syncs the value before submit with validation enabled", () => {
			const { input, form } = setup({ value: "a" });
			const tb = new TextBox(input);

			type(tb, "abc");
			form.dispatchEvent(new SubmitEvent("submit", { cancelable: true }));

			expect(input.value).toBe("abc");
		});

		it("getValue() and validate() see the pending edit", () => {
			const { input } = setup({ value: "a" });
			const tb = new TextBox(input);

			type(tb, "abc");

			expect(tb.getValue()).toBe("abc");
			expect(input.value).toBe("abc"); // чтение значения синхронизировало поле
		});

		it("required field is not reported empty because of a pending edit", () => {
			const { input } = setup({ required: true });
			const tb = new TextBox(input);

			type(tb, "abc");

			expect(tb.validate()).toBe(true);
		});

		// счётчик идёт по textContent, поэтому обновляется сразу, не дожидаясь сериализации
		it("updates the symbol counter immediately while typing", () => {
			document.body.innerHTML = "";
			const input = document.createElement("input");
			input.type = "text";
			input.maxLength = 10;
			input.setAttribute("data-symbolcounter", "");
			document.body.appendChild(input);

			const tb = new TextBox(input);
			const counter = tb.element!.querySelector(".symbols")!;

			type(tb, "abc");

			expect(counter.textContent).toBe("3/10");
		});

		// validate() синхронизирует значение, синхронизация доставляет change, а его обработчик
		// в состоянии "invalid" снова зовёт validate() — рекурсия обязана останавливаться
		it("does not recurse when validating an invalid control with a pending edit", () => {
			const { input } = setup({ required: true });
			const tb = new TextBox(input);

			expect(tb.validate()).toBe(false);
			expect(tb.element!.classList.contains("invalid")).toBe(true);

			type(tb, "abc");

			expect(tb.validate()).toBe(true);
			expect(tb.element!.classList.contains("invalid")).toBe(false);
		});

		it("delivers textbox-change after the throttle window", () => {
			const { input } = setup({ value: "" });
			const tb = new TextBox(input);
			const handler = jest.fn();
			tb.onChange(handler);

			type(tb, "abc");
			expect(handler).not.toHaveBeenCalled();

			jest.advanceTimersByTime(150);
			expect(handler).toHaveBeenCalledWith(expect.objectContaining({ value: "abc" }));
		});
	});

	it("multiline contenteditable preserves <br> between pasted lines but does not over-count newlines", () => {
		// Regression for __getTextLength: \n in innerText should not count toward maxlength.
		// We can verify the public effect by setting a multiline value via setValue and reading getValue.
		const textarea = document.createElement("textarea");
		textarea.value = "line1\nline2";
		document.body.appendChild(textarea);

		const tb = new TextBox(textarea);
		expect(tb.getValue()).toBe("line1\nline2");
	});
});

function setupFormat(
	opts: {
		tools?: string;
		storage?: string;
		type?: string;
		value?: string;
		markers?: Record<string, string>;
		maxlength?: number;
	} = {}
) {
	document.body.innerHTML = "";
	const input = document.createElement("input");
	input.type = opts.type ?? "text";
	if (opts.maxlength) input.maxLength = opts.maxlength;
	input.setAttribute("data-format", "");
	if (opts.tools !== undefined) input.setAttribute("data-format-tools", opts.tools);
	if (opts.storage !== undefined) input.setAttribute("data-format-storage", opts.storage);
	if (opts.markers)
		for (const [tool, marker] of Object.entries(opts.markers)) input.setAttribute(`data-format-md-${tool}`, marker);
	if (opts.value !== undefined) input.value = opts.value;
	document.body.appendChild(input);
	return input;
}

describe("TextBox formatting", () => {
	it("exposes formatting config from attributes", () => {
		const tb = new TextBox(setupFormat());
		expect(tb.format).toBe(true);
		expect(tb.formatStorage).toBe("html");
		// без data-format-tools подключается весь словарь редактора
		expect(tb.formatTools).toEqual(["bold", "italic", "strike", "underline", "spoiler", "code", "link"]);
	});

	it("mounts the toolbar inside the textbox container on focus", () => {
		const tb = new TextBox(setupFormat({ tools: "bold italic" }));
		const editable = tb.element!.querySelector(".ui-richeditor") as HTMLElement;
		editable.dispatchEvent(new FocusEvent("focus"));

		const toolbar = tb.element!.querySelector(".ui-richeditor-toolbar")!;
		expect(toolbar.parentElement).toBe(tb.element); // в контейнере TextBox, не в body
		expect(toolbar.classList.contains("in-container")).toBe(true);
		expect(toolbar.querySelectorAll(".format-button")).toHaveLength(2);
	});

	it("limits tools via data-format-tools and ignores unknown values", () => {
		const tb = new TextBox(setupFormat({ tools: "bold italic nonsense" }));
		expect(tb.formatTools).toEqual(["bold", "italic"]);
	});

	it("reads markdown storage from data-format-storage", () => {
		const tb = new TextBox(setupFormat({ storage: "markdown" }));
		expect(tb.formatStorage).toBe("markdown");
	});

	it("does not enable formatting for non-text types", () => {
		const tb = new TextBox(setupFormat({ type: "number" }));
		const editable = tb.element!.querySelector(".ui-richeditor") as HTMLElement;
		editable.dispatchEvent(new FocusEvent("focus"));
		expect(tb.format).toBe(false);
		expect(document.querySelector(".ui-richeditor-toolbar.visible")).toBeNull();
	});

	it("deserializes stored HTML into the editor, keeping only allowed tags", () => {
		const tb = new TextBox(setupFormat({ value: "a <b>bold</b> <script>x</script>" }));
		const editor = tb.element!.querySelector(".ui-richeditor")!;
		expect(editor.querySelector("b")).not.toBeNull();
		expect(editor.querySelector("script")).toBeNull();
		expect(editor.textContent).toBe("a bold x");
	});

	it("serializes editor content back to the value on input", () => {
		const tb = new TextBox(setupFormat());
		const editor = tb.element!.querySelector(".ui-richeditor") as HTMLElement;
		editor.innerHTML = "plain <b>x</b> <i>y</i>";
		editor.dispatchEvent(new Event("input", { bubbles: true }));
		expect(tb.getValue()).toBe("plain <b>x</b> <i>y</i>");
	});

	it("uses custom markdown markers from data-format-md-* attributes", () => {
		const tb = new TextBox(setupFormat({ storage: "markdown", markers: { italic: "_" }, value: "_x_ y" }));
		const editor = tb.element!.querySelector(".ui-richeditor") as HTMLElement;
		expect(editor.querySelector("i")).not.toBeNull();
		editor.dispatchEvent(new Event("input", { bubbles: true }));
		expect(tb.getValue()).toBe("_x_ y");
		expect(tb.formatMarkers.italic).toBe("_");
	});

	it("drops formatting tags that are not in the enabled tools", () => {
		const tb = new TextBox(setupFormat({ tools: "bold", value: "<b>x</b> <i>y</i>" }));
		const editor = tb.element!.querySelector(".ui-richeditor")!;
		expect(editor.querySelector("b")).not.toBeNull();
		expect(editor.querySelector("i")).toBeNull();
		expect(editor.textContent).toBe("x y");
	});

	it("validate() counts visible text length, not the serialized value (format/html)", () => {
		const tb = new TextBox(setupFormat({ tools: "bold", maxlength: 6, value: "<b>hello</b>" }));

		expect(tb.editor.getLength()).toBe(5); // видимых символов 5
		expect(tb.getValue()).toBe("<b>hello</b>"); // сериализованное value длиннее (12)
		expect(tb.validate()).toBe(true); // 5 ≤ 6 — валидно по видимому тексту, а не по тегам
	});
});

// Enter в однострочном поле должен работать как у обычного input: браузер сам проверяет
// валидность, поднимает отменяемый submit и отправляет форму. dispatchEvent так не умеет —
// синтетическое событие вызывает обработчиков, но отправку не запускает.
describe("TextBox implicit submission", () => {
	const setup = (opts: { multiline?: boolean; button?: boolean; required?: boolean } = {}) => {
		document.body.innerHTML = "";
		const form = document.createElement("form");
		const input = opts.multiline ? document.createElement("textarea") : document.createElement("input");
		if (!opts.multiline) (input as HTMLInputElement).type = "text";
		input.value = "текст";
		if (opts.required) input.required = true;
		form.appendChild(input);

		if (opts.button) {
			const button = document.createElement("button");
			button.type = "submit";
			button.textContent = "Отправить";
			form.appendChild(button);
		}

		document.body.appendChild(form);

		const submit = jest.fn((e: Event) => e.preventDefault());
		form.addEventListener("submit", submit);

		return { form, input, submit };
	};

	const pressEnter = (tb: TextBox) =>
		tb.editor.editable.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
		);

	it("submits through the first submit button, as implicit submission does", () => {
		const { input, submit } = setup({ button: true });
		pressEnter(new TextBox(input as HTMLInputElement));

		expect(submit).toHaveBeenCalledTimes(1);
		expect((submit.mock.calls[0][0] as SubmitEvent).submitter).toBe(document.querySelector("button"));
	});

	it("submits a form without a submit button too", () => {
		const { input, submit } = setup();
		pressEnter(new TextBox(input as HTMLInputElement));

		expect(submit).toHaveBeenCalledTimes(1);
	});

	// как у обычного input: браузер отказывает до события, поэтому обработчики формы
	// вообще не вызываются, а контрол помечается классом
	it("does not submit at all when the value is invalid", () => {
		const { input, submit } = setup({ button: true, required: true });
		const tb = new TextBox(input as HTMLInputElement);
		tb.setValue("");

		pressEnter(tb);

		expect(submit).not.toHaveBeenCalled();
		expect(tb.element.classList.contains("invalid")).toBe(true);
	});

	// собственное ограничение объявлено полю через setCustomValidity, значит его тоже
	// проверяет браузер, а не только наш validate()
	it("blocks submission when the visible text is longer than maxlength", () => {
		const { input, submit } = setup({ button: true });
		input.maxLength = 3;
		const tb = new TextBox(input as HTMLInputElement);
		tb.setValue("длинное значение");

		pressEnter(tb);

		expect(submit).not.toHaveBeenCalled();
		expect(tb.validate()).toBe(false);
	});

	it("does not submit from a multiline textbox", () => {
		const { input, submit } = setup({ multiline: true, button: true });
		const tb = new TextBox(input as HTMLTextAreaElement);

		const paragraph = tb.editor.editable.querySelector("p")!;
		const selection = window.getSelection()!;
		const range = document.createRange();
		range.setStart(paragraph.firstChild!, 5);
		range.collapse(true);
		selection.removeAllRanges();
		selection.addRange(range);

		pressEnter(tb);

		expect(submit).not.toHaveBeenCalled();
		expect(tb.editor.editable.querySelectorAll("p")).toHaveLength(2);
	});
});
