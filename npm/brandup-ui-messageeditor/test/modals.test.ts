/**
 * @jest-environment jsdom
 */
import RandomizerModal from "../source/randomizer";
import VariablesModal, { parseVariables, VARIABLES_EMPTY_TEXT } from "../source/variables";

const opened: Array<{ close(): void }> = [];
const open = <T extends { close(): void }>(modal: T): T => {
	opened.push(modal);
	return modal;
};

beforeEach(() => {
	document.body.innerHTML = "";
	document.body.className = "";
});

// незакрытое окно остаётся подписанным на удаление своего элемента из DOM, и уборка
// среды jsdom дёргает его уже после закрытия окружения
afterEach(() => {
	opened.forEach((modal) => modal.close());
	opened.length = 0;
});

// Базовый Modal не рендерит содержимое из своего конструктора: до возврата из super()
// поля наследника ещё не объявлены, и их объявления затирают присвоенное. Эти тесты
// ловят как раз такую поломку — окно открывается пустым или падает.
describe("RandomizerModal", () => {
	it("renders the selected text as the first variant", () => {
		open(new RandomizerModal("скидка", () => {}));

		const inputs = document.querySelectorAll<HTMLInputElement>(".messageeditor-randomizer input");
		expect(inputs).toHaveLength(1);
		expect(inputs[0].value).toBe("скидка");
	});

	it("splits an existing spintax back into variants", () => {
		open(new RandomizerModal("[раз|два]", () => {}));

		const inputs = document.querySelectorAll<HTMLInputElement>(".messageeditor-randomizer input");
		expect(Array.from(inputs).map((i) => i.value)).toEqual(["раз", "два"]);
	});

	it("collects the variants into a spintax and closes", () => {
		const apply = jest.fn();
		const modal = open(new RandomizerModal("раз", apply));

		// добавляем второй вариант и заполняем оба
		modal.element!.querySelector<HTMLButtonElement>(".add")!.click();
		const inputs = document.querySelectorAll<HTMLInputElement>(".messageeditor-randomizer input");
		inputs[0].value = "раз";
		inputs[1].value = "два";

		modal.element!.querySelector<HTMLButtonElement>(".apply")!.click();

		expect(apply).toHaveBeenCalledWith("[раз|два]");
		expect(document.querySelector(".messageeditor-randomizer")).toBeNull();
	});

	it("does not apply when every variant is empty", () => {
		const apply = jest.fn();
		const modal = open(new RandomizerModal("", apply));

		modal.element!.querySelector<HTMLButtonElement>(".apply")!.click();

		expect(apply).not.toHaveBeenCalled();
	});

	// подписчик придержал что-то на время работы окна и обязан отпустить это в любом исходе
	it("notifies close subscribers once, whatever ended the window", () => {
		const closed = jest.fn();
		const modal = open(new RandomizerModal("раз", () => {}));
		modal.onClosed(closed);

		modal.element!.querySelector<HTMLButtonElement>(".modal-close")!.click();
		modal.close(); // повторное закрытие ничего не досылает

		expect(closed).toHaveBeenCalledTimes(1);

		// подписка на уже закрытое срабатывает сразу — иначе придержанное не отпустил бы никто
		const late = jest.fn();
		modal.onClosed(late);
		expect(late).toHaveBeenCalledTimes(1);
	});

	it("closes on Escape without applying", () => {
		const apply = jest.fn();
		open(new RandomizerModal("раз", apply));

		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

		expect(apply).not.toHaveBeenCalled();
		expect(document.querySelector(".ui-modal")).toBeNull();
		expect(document.body.classList.contains("ui-modal-opened")).toBe(false);
	});
});

describe("VariablesModal", () => {
	// В списке показывается то, что будет видно в сообщении: с названием — оно, иначе ключ.
	// Ключ идёт отдельной подписью, без скобок и только когда отличается от показанного.
	it("shows each variable as it will look in the message, with its key aside", () => {
		const modal = open(
			new VariablesModal([{ key: "ИМЯ", name: "Имя подписчика" }, { key: "ГОРОД" }], () => {})
		);

		const rows = modal.element!.querySelectorAll(".variables .variable");
		expect(Array.from(rows).map((r) => r.querySelector(".preview")!.textContent)).toEqual([
			"{Имя подписчика}",
			"{ГОРОД}",
		]);
		expect(rows[0].querySelector(".key")!.textContent).toBe("ИМЯ"); // ключ без скобок
		expect(rows[1].querySelector(".key")).toBeNull();
	});

	it("lists the variables and inserts the picked one", () => {
		const apply = jest.fn();
		const modal = open(new VariablesModal([{ key: "ИМЯ", name: "Имя подписчика" }, { key: "ГОРОД" }], apply));

		const buttons = modal.element!.querySelectorAll<HTMLButtonElement>(".variables .variable");
		expect(buttons).toHaveLength(2);

		buttons[1].click();

		expect(apply).toHaveBeenCalledWith("{ГОРОД}");
		expect(document.querySelector(".ui-modal")).toBeNull();
	});

	it("says so when there are no variables", () => {
		const modal = open(new VariablesModal([], () => {}));

		expect(modal.element!.querySelector(".variables .empty")!.textContent).toBe(VARIABLES_EMPTY_TEXT);
	});

	// причину пустого списка знает приложение, а не компонент
	it("shows the text given for an empty list", () => {
		const modal = open(new VariablesModal([], () => {}, "Переменные появятся после выбора аудитории."));

		expect(modal.element!.querySelector(".variables .empty")!.textContent).toBe(
			"Переменные появятся после выбора аудитории."
		);
	});

	it.each([[null], [undefined], [""], ["   "]])("falls back to the default text for %j", (text) => {
		const modal = open(new VariablesModal([], () => {}, text));

		expect(modal.element!.querySelector(".variables .empty")!.textContent).toBe(VARIABLES_EMPTY_TEXT);
	});
});

describe("parseVariables", () => {
	it("reads a comma separated list of keys", () => {
		expect(parseVariables("ИМЯ, ГОРОД ,КОМПАНИЯ")).toEqual([{ key: "ИМЯ" }, { key: "ГОРОД" }, { key: "КОМПАНИЯ" }]);
	});

	// ключ может содержать пробелы — по ним список не режется
	it("keeps spaces inside a key", () => {
		expect(parseVariables("ИМЯ КЛИЕНТА")).toEqual([{ key: "ИМЯ КЛИЕНТА" }]);
	});

	it("reads a JSON array with names", () => {
		const value = '[{"key":"ИМЯ","name":"Имя подписчика"},"ГОРОД"]';

		expect(parseVariables(value)).toEqual([{ key: "ИМЯ", name: "Имя подписчика" }, { key: "ГОРОД" }]);
	});

	// ключ со скобками не свернётся в цельную конструкцию: подсветка поймает кусок,
	// а в значение уйдёт мусор
	it.each([["А{Б"], ["А}Б"], ["А[Б"], ["А]Б"], ["А|Б"]])("drops the key %j with markup characters", (key) => {
		expect(parseVariables(key)).toEqual([]);
		expect(parseVariables(JSON.stringify([{ key, name: "Название" }]))).toEqual([]);
	});

	it("drops entries without a key", () => {
		expect(parseVariables('[{"name":"Без ключа"},"",{"key":"  "},{"key":"ГОРОД"}]')).toEqual([
			{ key: "ГОРОД" },
		]);
	});

	it.each([[null], [""], ["   "], [","]])("gives an empty list for %j", (value) => {
		expect(parseVariables(value)).toEqual([]);
	});

	// потерянный список выглядит как «переменные не заданы» — о разборе сообщаем в консоль
	it("reports broken JSON instead of failing", () => {
		const error = jest.spyOn(console, "error").mockImplementation(() => {});

		expect(parseVariables('[{"key":]')).toEqual([]);
		expect(error).toHaveBeenCalled();

		error.mockRestore();
	});

	it("ignores JSON that is not an array", () => {
		expect(parseVariables('{"key":"ИМЯ"}')).toEqual([]); // не массив — разбор как ключа, а он со скобками
		expect(parseVariables("[1, true, null]")).toEqual([]);
	});
});
