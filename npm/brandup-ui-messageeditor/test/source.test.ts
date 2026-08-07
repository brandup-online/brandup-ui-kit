/**
 * @jest-environment jsdom
 */
import { PopupManager } from "@brandup/ui-kit";
import MessageEditor, {
	EMOJI_CLASS,
	MODES_CLASS,
	MODE_CLASS,
	SOURCE_CLASS,
	SOURCE_MODE_CLASS,
} from "../source/messageeditor";

function setup(opts: { value?: string; attr?: boolean; placeholder?: string; disabled?: boolean } = {}) {
	document.body.innerHTML = "";
	const form = document.createElement("form");
	const input = document.createElement("textarea");
	if (opts.value !== undefined) input.value = opts.value;
	if (opts.attr) input.setAttribute("data-source", "");
	if (opts.placeholder) input.setAttribute("placeholder", opts.placeholder);
	if (opts.disabled) input.disabled = true;
	form.appendChild(input);
	document.body.appendChild(form);
	return { input, form };
}

const sourceElem = (editor: MessageEditor) => editor.element.querySelector<HTMLElement>(`.${SOURCE_CLASS}`);
const modeButton = (editor: MessageEditor, mode: string) =>
	editor.element.querySelector<HTMLButtonElement>(`.${MODE_CLASS}[data-mode="${mode}"]`);

describe("MessageEditor source", () => {
	// Пишущему сообщение сырая разметка не нужна: показанная без спроса, она требует объяснений.
	it("is off until it is asked for", () => {
		const editor = new MessageEditor(setup({ value: "**жирный**" }).input);

		expect(editor.source).toBe(false);
		expect(editor.sourceMode).toBe(false);
		expect(editor.element.querySelector(`.${MODES_CLASS}`)).toBeNull();
		expect(sourceElem(editor)).toBeNull();

		editor.toggleSource(true); // включать нечего — режима нет вовсе

		expect(editor.sourceMode).toBe(false);
		expect(editor.element.classList.contains(SOURCE_MODE_CLASS)).toBe(false);
	});

	it.each([
		["атрибутом", (input: HTMLTextAreaElement) => new MessageEditor(input)],
		["опцией", (input: HTMLTextAreaElement) => new MessageEditor(input, { source: true })],
	])("turns the source panel on %s", (_, create) => {
		const { input } = setup({ attr: true });
		const editor = create(input);

		expect(editor.source).toBe(true);

		// переключатель над плашкой, панель — рядом с ней
		const modes = editor.element.querySelector(`.${MODES_CLASS}`)!;
		expect(modes.nextElementSibling!.classList.contains("bubble")).toBe(true);
		expect(sourceElem(editor)!.previousElementSibling!.classList.contains("bubble")).toBe(true);
		expect(modes.querySelectorAll(`.${MODE_CLASS}`)).toHaveLength(2);
		expect(modeButton(editor, "source")!.textContent).toBe("Markdown"); // формат хранения значения
	});

	// Переданная опция сильнее разметки: канал знает приложение точнее, чем разметка от сервера
	it("lets the option turn off what the attribute declared", () => {
		const editor = new MessageEditor(setup({ attr: true }).input, { source: false });

		expect(editor.source).toBe(false);
		expect(sourceElem(editor)).toBeNull();
	});

	it("renders the value in the storage format", () => {
		const { input } = setup({ value: "Привет, **{ИМЯ}**!\n> цитата", attr: true });
		const editor = new MessageEditor(input, { blocks: ["quote"], variables: [{ key: "ИМЯ" }] });

		// плашка показывает разметку разметкой, а не маркерами
		expect(editor.editor.editable.querySelector("b")).not.toBeNull();
		expect(sourceElem(editor)!.textContent).toBe(""); // до переключения рендерить нечего

		editor.toggleSource(true);

		expect(editor.sourceMode).toBe(true);
		expect(editor.element.classList.contains(SOURCE_MODE_CLASS)).toBe(true);
		expect(sourceElem(editor)!.textContent).toBe("Привет, **{ИМЯ}**!\n> цитата");
	});

	// Панель только показывает значение: правится оно по-прежнему в плашке
	it("changes nothing in the value", () => {
		const { input } = setup({ value: "**жирный**", attr: true });
		const editor = new MessageEditor(input);
		const handler = jest.fn();
		editor.onChange(handler);

		editor.toggleSource(true);
		editor.toggleSource(false);

		expect(editor.getValue()).toBe("**жирный**");
		expect(input.value).toBe("**жирный**");
		expect(handler).not.toHaveBeenCalled();
	});

	// Значение меняет и хост через setValue — показанный выход обязан следовать за ним
	it("follows the value while the panel is open", () => {
		const editor = new MessageEditor(setup({ value: "было", attr: true }).input);
		editor.toggleSource(true);

		editor.setValue("стало **другим**");

		expect(sourceElem(editor)!.textContent).toBe("стало **другим**");
	});

	// При печати копия значения у поля отстаёт (событие изменения троттлится), а показывать
	// выход, отставший от текста, — хуже, чем не показывать вовсе
	it("flushes the deferred change into the panel", () => {
		const { input } = setup({ value: "раз", attr: true });
		const editor = new MessageEditor(input);
		const editable = editor.editor.editable;

		editable.querySelector("p")!.textContent = "раз два";
		editable.dispatchEvent(new InputEvent("input", { bubbles: true }));
		expect(input.value).toBe("раз"); // изменение отложено

		editor.toggleSource(true);

		expect(sourceElem(editor)!.textContent).toBe("раз два");
		expect(input.value).toBe("раз два");
	});

	it("marks the shown mode in the switch and toggles by click", () => {
		const editor = new MessageEditor(setup({ value: "текст", attr: true }).input);
		const text = modeButton(editor, "text")!;
		const source = modeButton(editor, "source")!;

		expect(text.classList.contains("active")).toBe(true);
		expect(text.getAttribute("aria-pressed")).toBe("true");
		expect(source.getAttribute("aria-pressed")).toBe("false");

		source.click();

		expect(editor.sourceMode).toBe(true);
		expect(source.classList.contains("active")).toBe(true);
		expect(text.classList.contains("active")).toBe(false);

		text.click();

		expect(editor.sourceMode).toBe(false);
		expect(text.classList.contains("active")).toBe(true);
	});

	// Вернулись к сообщению — значит, продолжают писать: фокус идёт следом
	it("returns the focus to the bubble", () => {
		const editor = new MessageEditor(setup({ value: "текст", attr: true }).input);
		const editable = editor.editor.editable;
		editable.focus();

		modeButton(editor, "source")!.click();
		expect(document.activeElement).not.toBe(editable);

		modeButton(editor, "text")!.click();
		expect(document.activeElement).toBe(editable);
	});

	// Панель форматирования висит над плашкой, а плашки в этом режиме на экране нет
	it("takes the format toolbar away with the bubble", () => {
		const editor = new MessageEditor(setup({ value: "текст", attr: true }).input);
		editor.editor.editable.dispatchEvent(new FocusEvent("focus"));
		expect(document.querySelector(".ui-richeditor-toolbar.visible")).not.toBeNull();

		editor.toggleSource(true);

		expect(document.querySelector(".ui-richeditor-toolbar.visible")).toBeNull();
	});

	// Оставленный открытым, попап держал бы PopupManager на невидимом элементе: на body висели бы
	// класс открытого попапа и слушатель закрытия, а на узком экране страница осталась бы
	// непрокручиваемой. Кликом по кнопке его закрывает и сам PopupManager — но не тогда, когда
	// режим переключает хост из кода.
	it("closes the emoji picker when the panel takes the bubble away", () => {
		const editor = new MessageEditor(setup({ value: "текст", attr: true }).input);
		editor.element.querySelector<HTMLButtonElement>(`.${EMOJI_CLASS}`)!.click();
		expect(PopupManager.isOpened()).toBe(true);

		editor.toggleSource(true);

		expect(PopupManager.isOpened()).toBe(false);
		expect(document.body.classList.contains("ui-popup-opened")).toBe(false);
	});

	// Клик по плашке мимо текста уводит фокус в текст, но плашки в этом режиме на экране нет:
	// в панели текст выделяют, а не правят
	it("does not steal the click from the panel", () => {
		const editor = new MessageEditor(setup({ value: "текст", attr: true }).input);
		editor.toggleSource(true);

		const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
		sourceElem(editor)!.dispatchEvent(event);

		expect(event.defaultPrevented).toBe(false);
	});

	// Пустая панель без заглушки выглядит сломанной, а не пустой
	it("takes the placeholder for the empty panel", () => {
		const editor = new MessageEditor(setup({ attr: true, placeholder: "Напишите сообщение" }).input);

		expect(sourceElem(editor)!.dataset.placeholder).toBe("Напишите сообщение");
	});

	// Показать разметку можно и там, где её не правят: смотреть значение это не изменять его
	it("works in a disabled field, without focusing it back", () => {
		const editor = new MessageEditor(setup({ value: "**жирный**", attr: true, disabled: true }).input);

		modeButton(editor, "source")!.click();
		expect(sourceElem(editor)!.textContent).toBe("**жирный**");

		modeButton(editor, "text")!.click();
		expect(editor.sourceMode).toBe(false);
		expect(document.activeElement).not.toBe(editor.editor.editable);
	});
});
