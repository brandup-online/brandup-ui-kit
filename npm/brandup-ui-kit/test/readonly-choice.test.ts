import { enforceReadonlyChoice } from "../source/utils/readonly-choice";

// `readonly` на чекбоксе и радио браузер не читает вовсе: атрибута для них в HTML нет. Стили кита
// рисуют такому элементу закрытый вид и снимают `pointer-events`, но указателем дело и кончалось —
// пробел с клавиатуры переключал его, и значение, которое хост считал неизменяемым, менялось.
//
// Проверяем через `click`: нажатие пробела на элементе выбора браузер сам превращает в него,
// поэтому отменённый `click` — это и отменённая клавиша (jsdom клавиатурное поведение
// не воспроизводит, а вот `elem.click()` идёт тем же путём, что и оно).

// Явно ничего не включаем: модуль подписывается сам, как только его загрузили. Набор потому
// и не зовёт `enforceReadonlyChoice()` до проверок — если однажды подписку снова повесят на
// вызов извне, эти проверки упадут первыми.

beforeEach(() => {
	document.body.innerHTML = "";
});

const input = (attributes: Partial<Record<"type" | "readonly" | "checked", string>>): HTMLInputElement => {
	const elem = document.createElement("input");
	for (const [name, value] of Object.entries(attributes)) elem.setAttribute(name, value);
	document.body.appendChild(elem);

	return elem;
};

describe("enforceReadonlyChoice", () => {
	it("keeps a readonly checkbox unchecked", () => {
		const elem = input({ type: "checkbox", readonly: "" });

		elem.click();

		expect(elem.checked).toBe(false);
	});

	it("keeps a readonly checkbox checked", () => {
		const elem = input({ type: "checkbox", readonly: "", checked: "" });

		elem.click();

		expect(elem.checked).toBe(true);
	});

	// Тумблер — тот же чекбокс, отличается только ролью, поэтому отмена обязана доставать и его.
	it("keeps a readonly switch as it was", () => {
		const elem = input({ type: "checkbox", readonly: "", checked: "" });
		elem.setAttribute("role", "switch");

		elem.click();

		expect(elem.checked).toBe(true);
	});

	it("keeps a readonly radio unselected", () => {
		const elem = input({ type: "radio", readonly: "" });

		elem.click();

		expect(elem.checked).toBe(false);
	});

	it("leaves a checkbox without the attribute alone", () => {
		const elem = input({ type: "checkbox" });

		elem.click();

		expect(elem.checked).toBe(true);
	});

	// Отменяем действие, а не событие: нажатие по закрытому полю остаётся обычным нажатием,
	// и обработчик хоста — подсказка, почему поле не меняется, — обязан его увидеть.
	it("still lets the host see the click", () => {
		const elem = input({ type: "checkbox", readonly: "" });
		const seen = jest.fn();
		elem.addEventListener("click", seen);

		elem.click();

		expect(seen).toHaveBeenCalledTimes(1);
		expect(elem.checked).toBe(false);
	});

	// Текстовому полю `readonly` соблюдает сам браузер, и отменять на нём нажатия нельзя:
	// щелчок ставит каретку, а по ней выделяют и копируют.
	it("does not touch a readonly text field", () => {
		const elem = input({ type: "text", readonly: "" });
		const defaultPrevented = jest.fn();
		elem.addEventListener("click", (e) => defaultPrevented(e.defaultPrevented));

		elem.click();

		expect(defaultPrevented).toHaveBeenCalledWith(false);
	});

	// Слушатель на документе нужен один: подписка уже стоит с загрузки модуля, и повторные
	// вызовы — из приложения, что грузит кит отложенно, — не должны добавлять второй.
	it("subscribes once however many times it is called", () => {
		const spy = jest.spyOn(document, "addEventListener");

		enforceReadonlyChoice();
		enforceReadonlyChoice();

		expect(spy).not.toHaveBeenCalled();

		spy.mockRestore();
	});
});

// Отмена обязана приходить вместе с пакетом, а не с регистрацией middleware: закрытый вид
// рисуют стили — безусловно всем, кто их подключил. Здесь проверяется вся цепочка целиком:
// импортирован сам кит, ничего не настроено, приложение не запущено.
describe("importing the kit is enough", () => {
	it("cancels the toggle without any setup", async () => {
		await import("../source/index");

		document.body.innerHTML = "";
		const elem = document.createElement("input");
		elem.type = "checkbox";
		elem.setAttribute("readonly", "");
		document.body.appendChild(elem);

		elem.click();

		expect(elem.checked).toBe(false);
	});
});
