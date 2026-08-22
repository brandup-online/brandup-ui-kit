/**
 * @jest-environment jsdom
 */
import { resetUserScroll } from "@brandup/ui-kit/source/utils/user-scroll"; // как и сам контрол — мимо общего входа кита
import { InputControl } from "../source/index";

/** Минимальный контрол на базовом классе: фокус ведёт в само поле-носитель. */
class TestControl extends InputControl<HTMLInputElement> {
	/** Поставил ли конструктор автофокус — ровно то, что вернул `__applyAutoFocus`. */
	readonly autoFocusApplied: boolean;

	constructor(valueElem: HTMLInputElement) {
		const container = document.createElement("div");
		valueElem.insertAdjacentElement("afterend", container);
		container.insertAdjacentElement("afterbegin", valueElem);

		super("Test.InputControl", container, valueElem);

		this.autoFocusApplied = this.__applyAutoFocus();
	}
}

/** Ждёт микрозадач наблюдателя вставки в документ. */
const afterMutations = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(attrs: Record<string, string> = {}): HTMLInputElement {
	document.body.innerHTML = "";
	const form = document.createElement("form");
	const input = document.createElement("input");
	input.type = "text";
	for (const [name, value] of Object.entries(attrs)) input.setAttribute(name, value);
	form.appendChild(input);
	document.body.appendChild(form);
	return input;
}

describe("InputControl autofocus", () => {
	beforeEach(() => {
		resetUserScroll(); // признак прокрутки общий на страницу — тесты не должны его наследовать
		(document.activeElement as HTMLElement | null)?.blur();
	});

	it("does not focus a control without the attribute", () => {
		const input = setup();
		const control = new TestControl(input);

		expect(control.autoFocus).toBe(false);
		expect(control.autoFocusApplied).toBe(false);
		expect(document.activeElement).not.toBe(input);
	});

	it("focuses a control declared with data-autofocus", () => {
		const input = setup({ "data-autofocus": "" });
		const control = new TestControl(input);

		expect(control.autoFocus).toBe(true);
		expect(control.autoFocusApplied).toBe(true);
		expect(document.activeElement).toBe(input);
	});

	// нативный атрибут браузер применяет при разборе разметки, когда контрола ещё нет,
	// — для контрола он остаётся объявлением намерения
	it("focuses a control declared with the native autofocus attribute", () => {
		const input = setup({ autofocus: "" });
		const control = new TestControl(input);

		expect(control.autoFocus).toBe(true);
		expect(document.activeElement).toBe(input);
	});

	// вид двигаем на минимум: страницу ещё не читали, и сдвигать её ради поля, которое и так
	// на виду, не за чем — в отличие от focus() из кода, который ведёт к нужному месту
	it("scrolls the control into view no more than needed", () => {
		const input = setup({ "data-autofocus": "" });
		const scrollIntoView = jest.spyOn(Element.prototype, "scrollIntoView"); // jsdom его не реализует, стаб в setup

		const control = new TestControl(input);

		expect(scrollIntoView.mock.instances).toContain(control.element);
		expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });

		scrollIntoView.mockClear();
		control.focus();
		expect(scrollIntoView).toHaveBeenCalledWith({ block: "center", inline: "center" });

		scrollIntoView.mockRestore();
	});

	// вводят пальцем — экранная клавиатура закрыла бы страницу, которую ещё не читали
	it("does not focus when the pointer is coarse", () => {
		const input = setup({ "data-autofocus": "" });
		const original = window.matchMedia;
		// jsdom matchMedia не реализует — подставляем свой на время проверки
		(window as unknown as { matchMedia: unknown }).matchMedia = (query: string) =>
			({ matches: query.includes("coarse") }) as MediaQueryList;

		try {
			const control = new TestControl(input);

			expect(control.autoFocusApplied).toBe(false);
			expect(document.activeElement).not.toBe(input);
		} finally {
			(window as unknown as { matchMedia: unknown }).matchMedia = original;
		}
	});

	it("does not focus a disabled control", () => {
		const input = setup({ "data-autofocus": "", disabled: "" });
		const control = new TestControl(input);

		expect(control.autoFocusApplied).toBe(false);
		expect(document.activeElement).not.toBe(input);
	});

	it("does not focus a readonly control", () => {
		const input = setup({ "data-autofocus": "", readonly: "" });
		const control = new TestControl(input);

		expect(control.autoFocusApplied).toBe(false);
		expect(document.activeElement).not.toBe(input);
	});

	// инициализация бывает отложенной; к её концу пользователь уже мог уйти читать другое
	// место страницы — забирать у него вид и клавиатуру нельзя
	it("gives up when the user has already scrolled the page", () => {
		const input = setup({ "data-autofocus": "" });
		const scrollIntoView = jest.spyOn(Element.prototype, "scrollIntoView");

		window.dispatchEvent(new Event("wheel"));
		const control = new TestControl(input);

		expect(control.autoFocusApplied).toBe(false);
		expect(document.activeElement).not.toBe(input);
		expect(scrollIntoView).not.toHaveBeenCalled();
		scrollIntoView.mockRestore();
	});

	// прокрутку страницы поднимает и программный scrollIntoView — сам по себе он не значит,
	// что пользователь куда-то ушёл
	it("keeps the autofocus after a programmatic scroll event", () => {
		const input = setup({ "data-autofocus": "" });

		window.dispatchEvent(new Event("scroll"));
		const control = new TestControl(input);

		expect(control.autoFocusApplied).toBe(true);
	});

	// в поле ввода клавиши прокрутки двигают каретку, а не страницу
	it("keeps the autofocus after scroll keys pressed inside a field", () => {
		const input = setup({ "data-autofocus": "" });
		const other = document.createElement("input");
		document.body.appendChild(other);

		other.dispatchEvent(new KeyboardEvent("keydown", { key: "PageDown", bubbles: true }));
		const control = new TestControl(input);

		expect(control.autoFocusApplied).toBe(true);
	});

	// Страница собирается во фрагменте и попадает на экран уже собранной — в неподключённый
	// элемент браузер фокус не ставит, поэтому автофокус ждёт вставки в документ.
	it("focuses a control built off-document once it is inserted", async () => {
		document.body.innerHTML = "";
		const holder = document.createElement("div"); // вне документа
		const input = document.createElement("input");
		input.type = "text";
		input.setAttribute("data-autofocus", "");
		holder.appendChild(input);

		const control = new TestControl(input);

		expect(control.autoFocusApplied).toBe(false);
		expect(document.activeElement).not.toBe(input);

		document.body.appendChild(holder);
		await afterMutations();

		expect(document.activeElement).toBe(input);
	});

	// за время ожидания вставки пользователь мог уйти читать страницу
	it("gives up the deferred autofocus when the user scrolled meanwhile", async () => {
		document.body.innerHTML = "";
		const holder = document.createElement("div");
		const input = document.createElement("input");
		input.type = "text";
		input.setAttribute("data-autofocus", "");
		holder.appendChild(input);

		new TestControl(input);
		window.dispatchEvent(new Event("wheel"));

		document.body.appendChild(holder);
		await afterMutations();

		expect(document.activeElement).not.toBe(input);
	});

	it("drops the deferred autofocus of a destroyed control", async () => {
		document.body.innerHTML = "";
		const holder = document.createElement("div");
		const input = document.createElement("input");
		input.type = "text";
		input.setAttribute("data-autofocus", "");
		holder.appendChild(input);

		const control = new TestControl(input);
		control.destroy();

		document.body.appendChild(holder);
		await afterMutations();

		expect(document.activeElement).not.toBe(input);
	});

	// на страницу перешли по ссылке — фокус остался на ней от клика, а не ради ввода
	it("takes the focus from the link the page was opened by", () => {
		const input = setup({ "data-autofocus": "" });
		const link = document.createElement("a");
		link.href = "#";
		link.tabIndex = 0;
		document.body.appendChild(link);
		link.focus();

		const control = new TestControl(input);

		expect(control.autoFocusApplied).toBe(true);
		expect(document.activeElement).toBe(input);
	});

	// клавишу, которую виджет забрал себе (список dropdown, меню), страница не отработала —
	// это работа внутри виджета, а не прокрутка
	it("keeps the autofocus after a scroll key the widget handled itself", () => {
		const input = setup({ "data-autofocus": "" });
		const widget = document.createElement("span");
		document.body.appendChild(widget);
		widget.addEventListener("keydown", (e) => e.preventDefault());

		widget.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
		const control = new TestControl(input);

		expect(control.autoFocusApplied).toBe(true);
	});

	it("gives up after a scroll key nobody handled", () => {
		const input = setup({ "data-autofocus": "" });
		const other = document.createElement("div");
		document.body.appendChild(other);

		other.dispatchEvent(new KeyboardEvent("keydown", { key: "PageDown", bubbles: true, cancelable: true }));
		const control = new TestControl(input);

		expect(control.autoFocusApplied).toBe(false);
	});

	// автопрокрутку средней кнопкой и перетаскивание полосы жестами прокрутки не поймать
	it("gives up after the middle button starts autoscrolling", () => {
		const input = setup({ "data-autofocus": "" });

		window.dispatchEvent(new MouseEvent("mousedown", { button: 1 }));
		const control = new TestControl(input);

		expect(control.autoFocusApplied).toBe(false);
	});

	it("keeps the autofocus after an ordinary click", () => {
		const input = setup({ "data-autofocus": "" });

		window.dispatchEvent(new MouseEvent("mousedown", { button: 0 }));
		const control = new TestControl(input);

		expect(control.autoFocusApplied).toBe(true);
	});

	it("gives up when the user has already focused another field", () => {
		const input = setup({ "data-autofocus": "" });
		const other = document.createElement("input");
		document.body.appendChild(other);
		other.focus();

		const control = new TestControl(input);

		expect(control.autoFocusApplied).toBe(false);
		expect(document.activeElement).toBe(other);
	});

	// двух автофокусов на странице не бывает: забирает его тот контрол, что инициализирован раньше
	it("leaves the focus to the control initialized first", () => {
		document.body.innerHTML = "";
		const form = document.createElement("form");
		const first = document.createElement("input");
		const second = document.createElement("input");
		first.setAttribute("data-autofocus", "");
		second.setAttribute("data-autofocus", "");
		form.append(first, second);
		document.body.appendChild(form);

		const firstControl = new TestControl(first);
		const secondControl = new TestControl(second);

		expect(firstControl.autoFocusApplied).toBe(true);
		expect(secondControl.autoFocusApplied).toBe(false);
		expect(document.activeElement).toBe(first);
	});
});
