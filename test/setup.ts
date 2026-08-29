import { initUICommands } from "@brandup/ui";

// Файл общий на весь прогон, а среда у наборов разная: почти всем нужен jsdom, но набору,
// который читает собранный CSS, DOM не нужен вовсе и он объявляет `@jest-environment node`.
// Всё, что ниже, трогает DOM, поэтому в node-среде пропускаем: иначе первое же обращение
// к `Element` роняет такой набор ещё до его запуска.
const HAS_DOM = typeof window !== "undefined" && typeof Element !== "undefined";

if (HAS_DOM) {
	// Регистрируем глобальный click-обработчик команд (@brandup/ui v2.0.2+).
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
}
