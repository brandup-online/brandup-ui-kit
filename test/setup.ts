import { initUICommands } from "@brandup/ui";

// Регистрируем глобальный click-обработчик команд (@brandup/ui UIElement).
// В продакшене это делает Application.run(); в тестах вызываем явно.
initUICommands();

// jsdom не реализует scrollIntoView — стабим, чтобы UI-логика (InputControl.focus и т.п.) не падала под тестами.
(Element.prototype as any).scrollIntoView = function () {};

// jsdom не реализует innerText — проксируем к textContent. Этого достаточно для UI-логики
// (для одиночных строк без разрывов innerText и textContent совпадают).
if (!Object.getOwnPropertyDescriptor(HTMLElement.prototype, "innerText")) {
	Object.defineProperty(HTMLElement.prototype, "innerText", {
		get() {
			return this.textContent ?? "";
		},
		set(value: string) {
			this.textContent = value;
		},
		configurable: true,
	});
}
