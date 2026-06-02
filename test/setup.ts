// @brandup/ui v2 регистрирует глобальный click-обработчик команд при module load
// (`window.addEventListener("click", commandClickHandler)` в element.ts), отдельной инициализации не нужно.

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
