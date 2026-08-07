/**
 * @jest-environment jsdom
 */
import RandomizerModal, { MAX_VARIANTS } from "../source/randomizer";
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
	const fields = (modal: RandomizerModal) => Array.from(modal.element!.querySelectorAll<HTMLElement>(".editable"));
	const texts = (modal: RandomizerModal) => fields(modal).map((f) => f.textContent);

	// В набор печатают, а не заполняют форму: пока есть место, список кончается пустым вариантом,
	// и он же приглашает набрать следующий.
	const type = (field: HTMLElement, text: string) => {
		field.textContent = text;
		field.dispatchEvent(new Event("input", { bubbles: true }));
	};
	const leave = (field: HTMLElement) => field.dispatchEvent(new FocusEvent("blur", { bubbles: false }));

	it("renders the selected text as the first variant, with a blank one after it", () => {
		const modal = open(new RandomizerModal("скидка", () => {}));

		expect(texts(modal)).toEqual(["скидка", ""]);
	});

	it("splits an existing spintax back into variants", () => {
		const modal = open(new RandomizerModal("[раз|два]", () => {}));

		expect(texts(modal)).toEqual(["раз", "два", ""]);
	});

	// Исходный текст — выделение из сообщения, и символы конструкции с переносами в нём не
	// редкость: он обязан пройти ту же чистку, что и вставка, иначе в варианте оказалось бы
	// то, что нельзя ни набрать, ни вставить.
	it("cleans the initial text like a paste", () => {
		const modal = open(new RandomizerModal("[а|б] хвост", () => {}));

		expect(texts(modal)).toEqual(["аб хвост", ""]);
	});

	it("collapses a multi-line selection into one line", () => {
		const modal = open(new RandomizerModal("раз\n\nдва", () => {}));

		expect(texts(modal)).toEqual(["раз два", ""]);
	});

	// перетащенный текст миновал бы и клавиши, и вставку — бросать в вариант нельзя вовсе
	it("refuses a drop into a variant field", () => {
		const modal = open(new RandomizerModal("раз", () => {}));

		const drop = new Event("drop", { bubbles: true, cancelable: true });
		fields(modal)[0].dispatchEvent(drop);

		expect(drop.defaultPrevented).toBe(true);
	});

	// пустой вариант внизу появляется сам, как только предыдущий перестал быть пустым
	it("offers the next variant as soon as the last one is filled", () => {
		const modal = open(new RandomizerModal("раз", () => {}));

		type(fields(modal)[1], "два");

		expect(texts(modal)).toEqual(["раз", "два", ""]);
	});

	it("collects the variants into a spintax and closes", () => {
		const apply = jest.fn();
		const modal = open(new RandomizerModal("раз", apply));

		type(fields(modal)[1], "два");
		modal.element!.querySelector<HTMLButtonElement>(".apply")!.click();

		expect(apply).toHaveBeenCalledWith("[раз|два]");
		expect(document.querySelector(".messageeditor-randomizer")).toBeNull();
	});

	// нажатие, которое ничего не делает, выглядит поломкой: пока варианта нет, сохранять нечего
	it("keeps saving disabled until a variant is filled", () => {
		const modal = open(new RandomizerModal("", () => {}));
		const apply = modal.element!.querySelector<HTMLButtonElement>(".apply")!;

		expect(apply.disabled).toBe(true);

		type(fields(modal)[0], "раз");

		expect(apply.disabled).toBe(false);
	});

	it("closes without applying on cancel", () => {
		const apply = jest.fn();
		const modal = open(new RandomizerModal("раз", apply));

		modal.element!.querySelector<HTMLButtonElement>(".cancel")!.click();

		expect(apply).not.toHaveBeenCalled();
		expect(document.querySelector(".messageeditor-randomizer")).toBeNull();
	});

	// Очищенный вариант — не запись, а мусор в списке: убираем, как только из него ушли.
	// Хвостовой пустой остаётся: он приглашение набрать следующий.
	it("drops a cleared variant on blur but keeps the trailing blank one", () => {
		const modal = open(new RandomizerModal("[раз|два]", () => {}));

		const second = fields(modal)[1];
		type(second, "");
		leave(second);

		expect(texts(modal)).toEqual(["раз", ""]);

		const blank = fields(modal)[1];
		leave(blank);

		expect(texts(modal)).toEqual(["раз", ""]);
	});

	// у приглашения нечего убирать, поэтому кнопки удаления у него нет
	it("hides the remove button on the trailing blank variant only", () => {
		const modal = open(new RandomizerModal("раз", () => {}));

		const rows = modal.element!.querySelectorAll(".variant");
		expect(rows[0].classList.contains("blank")).toBe(false);
		expect(rows[1].classList.contains("blank")).toBe(true);
	});

	it("removes a variant by its button", () => {
		const modal = open(new RandomizerModal("[раз|два]", () => {}));

		modal.element!.querySelectorAll<HTMLButtonElement>(".variant .remove")[0].click();

		expect(texts(modal)).toEqual(["два", ""]);
	});

	// Вариант бывает длинным, поэтому это редактируемая область, а не поле ввода: она переносит
	// текст. Скобки и разделитель внутри развалили бы саму конструкцию.
	it("edits a variant in a wrapping field that refuses the construct characters", () => {
		const modal = open(new RandomizerModal("скидка", () => {}));
		const field = fields(modal)[0];

		expect(field.getAttribute("contenteditable")).toBe("true");

		const pressed = (key: string) => {
			const e = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
			field.dispatchEvent(e);
			return e.defaultPrevented;
		};

		expect(["[", "]", "|"].map(pressed)).toEqual([true, true, true]);
		expect(pressed("а")).toBe(false);
	});

	// Enter не переносит строку внутри варианта, а переводит в следующий
	it("moves to the next variant on Enter", () => {
		const modal = open(new RandomizerModal("раз", () => {}));
		const field = fields(modal)[0];

		const e = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
		field.dispatchEvent(e);

		expect(e.defaultPrevented).toBe(true);
		expect(document.activeElement).toBe(fields(modal)[1]);
	});

	// набор не должен разрастаться: спинтакс уходит в текст сообщения целиком
	it("stops offering new variants at the limit and says why", () => {
		const spintax = `[${Array.from({ length: MAX_VARIANTS }, (_, i) => `в${i}`).join("|")}]`;
		const modal = open(new RandomizerModal(spintax, () => {}));

		// приглашения больше нет — список ровно в предел
		expect(fields(modal)).toHaveLength(MAX_VARIANTS);
		expect(modal.element!.classList.contains("max-variants")).toBe(true);

		type(fields(modal)[MAX_VARIANTS - 1], "изменили");

		expect(fields(modal)).toHaveLength(MAX_VARIANTS);
	});

	// лишнее из готового спинтакса отсекается сразу: набрать столько всё равно бы не дали
	it("cuts an oversized spintax down to the limit", () => {
		const spintax = `[${Array.from({ length: MAX_VARIANTS + 5 }, (_, i) => `в${i}`).join("|")}]`;
		const modal = open(new RandomizerModal(spintax, () => {}));

		expect(fields(modal)).toHaveLength(MAX_VARIANTS);
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
		const modal = open(new VariablesModal([{ key: "ИМЯ", name: "Имя подписчика" }, { key: "ГОРОД" }], () => {}));

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
		expect(parseVariables('[{"name":"Без ключа"},"",{"key":"  "},{"key":"ГОРОД"}]')).toEqual([{ key: "ГОРОД" }]);
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

// Конструкция живёт в одной строке, а название подставляется вместо неё: перенос в названии
// разорвал бы её. Запись не отбрасываем — смысл названия от схлопывания пробелов цел.
describe("parseVariables names", () => {
	it("collapses line breaks in a name", () => {
		// в JSON перенос записан escape-последовательностью: сырой внутри строки недопустим
		expect(parseVariables('[{"key":"ИМЯ","name":"Имя\\nклиента"}]')).toEqual([{ key: "ИМЯ", name: "Имя клиента" }]);
	});
});
