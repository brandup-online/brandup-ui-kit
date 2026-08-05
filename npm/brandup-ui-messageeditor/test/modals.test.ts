/**
 * @jest-environment jsdom
 */
import RandomizerModal from "../source/randomizer";
import VariablesModal from "../source/variables";

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
	it("lists the variables and inserts the picked one", () => {
		const apply = jest.fn();
		const modal = open(new VariablesModal([{ name: "ИМЯ", title: "Имя подписчика" }, { name: "ГОРОД" }], apply));

		const buttons = modal.element!.querySelectorAll<HTMLButtonElement>(".variables .variable");
		expect(buttons).toHaveLength(2);

		buttons[1].click();

		expect(apply).toHaveBeenCalledWith("{ГОРОД}");
		expect(document.querySelector(".ui-modal")).toBeNull();
	});

	it("says so when there are no variables", () => {
		const modal = open(new VariablesModal([], () => {}));

		expect(modal.element!.querySelector(".variables .empty")).not.toBeNull();
	});
});
