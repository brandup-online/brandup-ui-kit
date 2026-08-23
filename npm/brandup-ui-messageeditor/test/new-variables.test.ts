/**
 * @jest-environment jsdom
 */
import MessageEditor, { type MessageEditorOptions } from "../source/messageeditor";
import { VARIABLE_NEW_TEXT } from "../source/variables";

function setup(value: string, options: MessageEditorOptions = {}) {
	document.body.innerHTML = "";
	const form = document.createElement("form");
	const input = document.createElement("textarea");
	input.value = value;
	form.appendChild(input);
	document.body.appendChild(form);

	return new MessageEditor(input, options);
}

const declared: MessageEditorOptions = {
	variables: [{ key: "ИМЯ", name: "Имя" }, { key: "ГОРОД" }],
	newVariables: true,
};

// Окно правки забирает фокус — редактор теряет его, хотя ввод не закончен.
function openVariables(editor: MessageEditor) {
	editor.editor.editable.focus(); // панель форматирования появляется по фокусу, а кнопка живёт в ней
	document.querySelector<HTMLButtonElement>('.ui-richeditor-toolbar [data-toolbar-button="variable"]')!.click();
	editor.editor.editable.blur();
}

// Набор с клавиатуры: символ дописывается в текстовый узел, каретка идёт за ним, событие input.
// Путь отдельный от setValue — подсветка на печати идёт по input, а не по изменению значения.
function type(editor: MessageEditor, text: string) {
	const editable = editor.editor.editable;
	editable.focus();

	for (const char of text) {
		let node = editable.lastChild;
		while (node?.lastChild) node = node.lastChild;

		if (!node || node.nodeType !== Node.TEXT_NODE) {
			node = document.createTextNode("");
			(editable.lastElementChild ?? editable).appendChild(node);
		}

		(node as Text).data += char;

		const selection = window.getSelection()!;
		const range = document.createRange();
		range.setStart(node, (node as Text).data.length);
		range.collapse(true);
		selection.removeAllRanges();
		selection.addRange(range);

		editable.dispatchEvent(new Event("input", { bubbles: true }));
	}
}

function rows() {
	return Array.from(document.querySelectorAll<HTMLElement>(".messageeditor-variables .variables .variable"));
}

function closeModal() {
	document.querySelector<HTMLButtonElement>(".ui-modal .modal-close")?.click();
}

// незакрытое окно остаётся подписанным на удаление своего элемента из DOM, и уборка
// среды jsdom дёргает его уже после закрытия окружения
afterEach(() => {
	closeModal();
	document.body.innerHTML = "";
});

describe("new variables mode", () => {
	// Необъявленный ключ здесь не ошибка, а заявка: заведёт такую переменную приложение,
	// а помечена она затем, чтобы было видно — это ещё не существующее поле.
	it("marks a key outside the declared list as new, not as unknown", () => {
		const editor = setup("Привет, {СКИДКА}!", declared);
		const span = editor.editor.editable.querySelector<HTMLElement>("span.variable")!;

		expect(span.classList.contains("new")).toBe(true);
		expect(span.classList.contains("unknown")).toBe(false);
		expect(span.getAttribute("title")).toBeTruthy();
		expect(span.textContent).toBe("{СКИДКА}"); // текст неприкосновенен — из него собирается значение
		expect(editor.getValue()).toBe("Привет, {СКИДКА}!");
	});

	// Главное отличие режима: отправку такая переменная не держит, и подпись поля остаётся хосту.
	it("leaves the value valid", () => {
		const editor = setup("{СКИДКА}", declared);
		const valueElem = editor.element.querySelector("textarea")!;

		expect(editor.validate()).toBe(true);
		expect(editor.element.classList.contains("invalid")).toBe(false);
		expect(valueElem.validity.customError).toBe(false);
		expect(valueElem.form!.checkValidity()).toBe(true);
	});

	// Проверки здесь нет вовсе — значит и подпись поля не наша: приложение могло выставить свою.
	it("keeps a host-set custom validity", () => {
		const editor = setup("{СКИДКА}", declared);
		const valueElem = editor.element.querySelector("textarea")!;

		valueElem.setCustomValidity("Своя проверка приложения.");
		editor.setValue("{СКИДКА} и {БОНУС}");

		expect(valueElem.validationMessage).toBe("Своя проверка приложения.");
	});

	// Отправку список не держит, но кто-то должен его выполнить — хост читает его свойством.
	it("reports the keys to create, in order and without repeats", () => {
		const editor = setup("{БОНУС} {ИМЯ} {СКИДКА} {БОНУС}", declared);

		expect(editor.unknownVariables).toEqual(["БОНУС", "СКИДКА"]);
		expect(editor.editor.editable.querySelectorAll("span.variable.new")).toHaveLength(3);
	});

	// Заявка имеет смысл, только если её можно выполнить: ключ с символами разметки объявить
	// нельзя, и такой помечаем чужим, как в строгом режиме.
	it("does not offer a key with markup characters as new", () => {
		const editor = setup("{A|B}", declared);
		const span = editor.editor.editable.querySelector<HTMLElement>("span.variable")!;

		expect(span.classList.contains("new")).toBe(false);
		expect(span.classList.contains("unknown")).toBe(true);
		expect(editor.unknownVariables).toEqual([]);
	});

	// Границы ключа — буква или цифра: иначе `{ }` и `{...}` становились бы переменной на ровном
	// месте. Такое не конструкция вовсе — обычный текст, каким его и набрали.
	it.each([["{ }"], ["{...}"], ["{ СКИДКА }"], ["{СКИДКА.}"], ["{[X]}"], ["{-}"], ["{-СКИДКА}"]])(
		"does not treat %s as a construct at all",
		(value) => {
			const editor = setup(value, declared);

			expect(editor.editor.editable.querySelector("span.variable")).toBeNull();
			expect(editor.unknownVariables).toEqual([]);
			expect(editor.getValue()).toBe(value);
		}
	);

	// Незаводимый ключ рядом с годным не должен утаскивать за собой и его.
	it("still offers the declarable keys beside a broken one", () => {
		const editor = setup("{A|B} и {СКИДКА}", declared);

		expect(editor.unknownVariables).toEqual(["СКИДКА"]);
		expect(editor.editor.editable.querySelectorAll("span.variable.new")).toHaveLength(1);
		expect(editor.editor.editable.querySelectorAll("span.variable.unknown")).toHaveLength(1);
	});

	// Ключ новой переменной приводится к верхнему регистру: объявить его пока нечем, а заведут
	// ровно то, что набрано, — и `{Скидка}` рядом с `{СКИДКА}` развели бы два поля вместо одного.
	it.each([["{скидка}"], ["{Скидка}"], ["{сКиДкА}"]])("raises %s to upper case", (value) => {
		const editor = setup(`Привет, ${value}!`, declared);
		const span = editor.editor.editable.querySelector<HTMLElement>("span.variable")!;

		expect(editor.getValue()).toBe("Привет, {СКИДКА}!");
		expect(span.textContent).toBe("{СКИДКА}");
		expect(span.classList.contains("new")).toBe(true);
		expect(editor.unknownVariables).toEqual(["СКИДКА"]);
	});

	// Приведение сводит написанное в разном регистре к одной переменной — и в тексте, и в списке.
	it("counts keys that differ only in case as one new variable", () => {
		const editor = setup("{Скидка}, {СКИДКА} и {скидка}", declared);

		expect(editor.getValue()).toBe("{СКИДКА}, {СКИДКА} и {СКИДКА}");
		expect(editor.unknownVariables).toEqual(["СКИДКА"]);
		expect(editor.editor.editable.querySelectorAll("span.variable.new")).toHaveLength(3);
	});

	// Приведение работает и без объявленных: с пустого списка в этом режиме как раз начинают.
	it("raises a new key to upper case with an empty declared list", () => {
		const editor = setup("{скидка}", { newVariables: true });

		expect(editor.getValue()).toBe("{СКИДКА}");
		expect(editor.unknownVariables).toEqual(["СКИДКА"]);
	});

	// В строгом режиме регистр не правим: необъявленный ключ там ошибка, и менять набранное
	// значило бы прятать её — исправлять пишущему, а не полю.
	it("leaves the case alone in the strict mode", () => {
		const editor = setup("{скидка}", { variables: declared.variables });

		expect(editor.getValue()).toBe("{скидка}");
		expect(editor.unknownVariables).toEqual(["скидка"]);
	});

	// Заведённая переменная перестаёт быть новой независимо от того, как её набрали.
	it("stops treating a key as new once it is declared in another case", () => {
		const editor = setup("{имя}", declared);
		const span = editor.editor.editable.querySelector<HTMLElement>("span.variable")!;

		expect(span.classList.contains("new")).toBe(false);
		expect(editor.getValue()).toBe("{ИМЯ}");
		expect(editor.unknownVariables).toEqual([]);
	});

	// Подчёркивание на границе разрешено наравне с буквой и цифрой: `_id` и `USER_NAME_` —
	// обычные имена полей, и отказывать им значило бы отказывать половине наборов.
	it.each([["{_ID}"], ["{СКИДКА_}"], ["{_}"], ["{_ДАТА_2}"]])("offers %s as new", (value) => {
		const editor = setup(value, declared);
		const span = editor.editor.editable.querySelector<HTMLElement>("span.variable")!;

		expect(span.classList.contains("new")).toBe(true);
		expect(editor.unknownVariables).toEqual([value.slice(1, -1)]);
	});

	// Объявленная остаётся объявленной: режим не отменяет список, а лишь разрешает то, чего в нём нет.
	it("leaves a declared variable alone", () => {
		const editor = setup("{ИМЯ} {ГОРОД}", declared);

		expect(editor.editor.editable.querySelectorAll("span.variable.new")).toHaveLength(0);
		expect(editor.unknownVariables).toEqual([]);
	});

	// Строгий режим на пустом списке молчит (набор может быть ещё не известен), а здесь пустой
	// список — рабочее начало: переменные заводятся по мере того, как их набирают.
	it("marks new keys even while the declared list is empty", () => {
		const editor = setup("{СКИДКА}", { newVariables: true });
		const span = editor.editor.editable.querySelector<HTMLElement>("span.variable")!;

		expect(span.classList.contains("new")).toBe(true);
		expect(editor.unknownVariables).toEqual(["СКИДКА"]);
	});

	// Объявленный режим — согласие на персонализацию: без него `{ИМЯ}` осталось бы обычным текстом,
	// и разрешать в нём было бы нечего.
	it("turns personalization on by itself", () => {
		expect(setup("{СКИДКА}", { newVariables: true }).personalization).toBe(true);
	});

	// Разметку отдаёт сервер — режим объявляется там же, где список, и работать обязан так же
	// целиком: и пометка в тексте, и запись в окне.
	it("takes the mode from the data-new-variables attribute", () => {
		document.body.innerHTML = "";
		const input = document.createElement("textarea");
		input.dataset.newVariables = "";
		input.dataset.variables = "ИМЯ";
		input.value = "{СКИДКА}";
		document.body.appendChild(input);

		const editor = new MessageEditor(input);

		expect(editor.newVariables).toBe(true);
		expect(editor.editor.editable.querySelector("span.variable.new")).not.toBeNull();

		openVariables(editor);

		expect(rows().map((r) => r.querySelector(".preview")!.textContent)).toEqual(["{ИМЯ}", "{СКИДКА}"]);
		expect(rows()[1].classList.contains("new")).toBe(true);
	});

	// без персонализации `{ИМЯ}` — обычный текст, и режим ничего не меняет
	it("marks nothing while personalization is off", () => {
		const editor = setup("{СКИДКА}", { ...declared, personalization: false });

		expect(editor.editor.editable.querySelector("span.variable")).toBeNull();
		expect(editor.unknownVariables).toEqual([]);
	});

	// Набирают переменные чаще, чем вставляют из окна, а подсветка на печати идёт своим путём —
	// по событию input, до того как значение вообще пересчитано.
	it.each([["{СКИДКА}"], ["{ДАТА ЗАКАЗА}"], ["{Скидка}", "{СКИДКА}"]])(
		"marks %s typed by hand",
		(text, expected = text) => {
			const editor = setup("Привет", declared);
			type(editor, ` ${text}`); // пробел набирается тоже: концевой в исходном значении срезается

			const span = editor.editor.editable.querySelector<HTMLElement>("span.variable")!;
			expect(span.classList.contains("new")).toBe(true);
			expect(editor.getValue()).toBe(`Привет ${expected}`);
		}
	);

	// Набранная только что переменная — первая, которую захотят вставить ещё раз.
	it("offers a just-typed key in the window", () => {
		const editor = setup("", declared);
		type(editor, "{СКИДКА}");
		openVariables(editor);

		expect(rows().map((r) => r.querySelector(".preview")!.textContent)).toEqual(["{Имя}", "{ГОРОД}", "{СКИДКА}"]);
	});

	describe("editing a new variable", () => {
		const open = (editor: MessageEditor, selector = "span.variable") => {
			const span = editor.editor.editable.querySelector<HTMLElement>(selector)!;
			editor.editor.editable.focus();
			span.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			editor.editor.editable.blur();

			return span;
		};

		const field = () => document.querySelector<HTMLInputElement>(".messageeditor-variable-key .key-field")!;
		const applyButton = () => document.querySelector<HTMLButtonElement>(".messageeditor-variable-key .apply")!;
		const type = (value: string) => {
			field().value = value;
			field().dispatchEvent(new Event("input", { bubbles: true }));
		};

		// Новую переменную выбирать не из чего: в списке её нет и быть не может — её набрали
		// здесь же. Поэтому клик по ней открывает не список, а правку ключа.
		it("opens the key window instead of the picker", () => {
			const editor = setup("{СКИДКА}", declared);
			open(editor);

			expect(document.querySelector(".messageeditor-variable-key")).not.toBeNull();
			expect(document.querySelector(".messageeditor-variables")).toBeNull();
			expect(field().value).toBe("СКИДКА"); // ключ без скобок: правят его, а не конструкцию
		});

		// Окно открыли, чтобы набрать: фокус сразу в поле, каретка в конец ключа. Выделенный
		// целиком ключ стёрся бы первым нажатием, а правят обычно опечатку в нём.
		it("puts the caret at the end of the key", () => {
			const editor = setup("{СКИДКА}", declared);
			open(editor);

			expect(document.activeElement).toBe(field());
			expect(field().selectionStart).toBe("СКИДКА".length);
			expect(field().selectionEnd).toBe("СКИДКА".length);
		});

		it("replaces the construct with the edited key", () => {
			const editor = setup("Привет, {СКИДКА}!", declared);
			open(editor);

			type("ДАТА ЗАКАЗА");
			applyButton().click();

			expect(editor.getValue()).toBe("Привет, {ДАТА ЗАКАЗА}!");
			expect(editor.unknownVariables).toEqual(["ДАТА ЗАКАЗА"]);
			expect(document.querySelector(".messageeditor-variable-key")).toBeNull();
		});

		// Правило ключа у окна и у списка одно: сохранить нельзя то, чего нельзя объявить.
		it.each([["   "], ["."], ["-СКИДКА"], ["СКИДКА."]])("keeps saving off for %j", (value) => {
			const editor = setup("{СКИДКА}", declared);
			open(editor);

			type(value);

			expect(applyButton().disabled).toBe(true);

			applyButton().click(); // и нажатие ничего не меняет
			expect(editor.getValue()).toBe("{СКИДКА}");
		});

		// Краевые пробелы срезаются, а не запрещаются: объявленный ключ их не содержит никогда,
		// и отказывать из-за случайного пробела значило бы придираться.
		it("trims edge spaces on save", () => {
			const editor = setup("{СКИДКА}", declared);
			open(editor);

			type("  ДАТА ЗАКАЗА  ");

			expect(applyButton().disabled).toBe(false);
			applyButton().click();

			expect(editor.getValue()).toBe("{ДАТА ЗАКАЗА}");
		});

		it.each([["СКИДКА_2"], ["_id"], ["order.total"], ["ДАТА ЗАКАЗА"]])("allows %j", (value) => {
			const editor = setup("{СКИДКА}", declared);
			open(editor);

			type(value);

			expect(applyButton().disabled).toBe(false);
		});

		// Символы разметки развалили бы конструкцию: набрать их нельзя, как и в окне рандомизации.
		it("strips markup characters from what is typed", () => {
			const editor = setup("{СКИДКА}", declared);
			open(editor);

			type("СК{И|Д}[К]А");

			expect(field().value).toBe("СКИДКА");
			expect(applyButton().disabled).toBe(false);
		});

		// В поле из одной строки Enter больше нечего делать
		it("saves on Enter", () => {
			const editor = setup("{СКИДКА}", declared);
			open(editor);

			type("БОНУС");
			field().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));

			expect(editor.getValue()).toBe("{БОНУС}");
		});

		it("changes nothing when cancelled", () => {
			const editor = setup("{СКИДКА}", declared);
			open(editor);

			type("БОНУС");
			document.querySelector<HTMLButtonElement>(".messageeditor-variable-key .cancel")!.click();

			expect(editor.getValue()).toBe("{СКИДКА}");
			expect(document.querySelector(".messageeditor-variable-key")).toBeNull();
		});

		// Ключ, который нельзя завести, правят тем же окном: клик по нему — попытка исправить.
		it("opens for a key that cannot be declared", () => {
			const editor = setup("{A|B}", declared);
			open(editor);

			expect(field().value).toBe("A|B");

			type("БОНУС");
			applyButton().click();

			expect(editor.getValue()).toBe("{БОНУС}");
		});

		// Объявленную по-прежнему меняют выбором: список — ровно то, что нужно, чтобы взять другую.
		it("still opens the picker for a declared variable", () => {
			const editor = setup("{ИМЯ}", declared);
			open(editor);

			expect(document.querySelector(".messageeditor-variables")).not.toBeNull();
			expect(document.querySelector(".messageeditor-variable-key")).toBeNull();
		});

		// В строгом режиме необъявленная — ошибка, и исправить её можно только объявленной.
		it("still opens the picker for an unknown key in the strict mode", () => {
			const editor = setup("{ЧУЖАЯ}", { variables: declared.variables });
			open(editor);

			expect(document.querySelector(".messageeditor-variables")).not.toBeNull();
			expect(document.querySelector(".messageeditor-variable-key")).toBeNull();
		});
	});

	describe("variables modal", () => {
		// Набранную переменную вставляют повторно так же, как объявленную, — значит она обязана
		// быть в списке. Пометка объясняет, почему запись отличается: поля ещё нет.
		it("lists the new keys after the declared ones, with a mark", () => {
			const editor = setup("{СКИДКА} {ИМЯ} {БОНУС}", declared);
			openVariables(editor);

			expect(rows().map((r) => r.querySelector(".preview")!.textContent)).toEqual([
				"{Имя}",
				"{ГОРОД}",
				"{СКИДКА}",
				"{БОНУС}",
			]);

			const [name, , discount] = rows();
			expect(name.classList.contains("new")).toBe(false);
			expect(discount.classList.contains("new")).toBe(true);
			expect(discount.querySelector(".note")!.textContent).toBe(VARIABLE_NEW_TEXT);
			expect(discount.querySelector(".key")).toBeNull(); // названия у новой нет, ключ и есть вид
		});

		it("inserts a picked new key like any other", () => {
			const editor = setup("{СКИДКА}", declared);
			openVariables(editor);

			rows()
				.find((r) => r.classList.contains("new"))!
				.click();

			expect(editor.getValue()).toBe("{СКИДКА}{СКИДКА}");
		});

		// Список собирается на каждое открытие: набранная только что переменная должна найтись
		// в нём сразу, а собранный однажды список отставал бы от поля.
		it("follows the text between openings", () => {
			const editor = setup("{СКИДКА}", declared);

			openVariables(editor);
			expect(rows().filter((r) => r.classList.contains("new"))).toHaveLength(1);
			closeModal();

			editor.setValue("{БОНУС} {ПОДАРОК}");

			openVariables(editor);
			expect(
				rows()
					.filter((r) => r.classList.contains("new"))
					.map((r) => r.querySelector(".preview")!.textContent)
			).toEqual(["{БОНУС}", "{ПОДАРОК}"]);
		});

		// Пустой объявленный список — не пустое окно, пока в тексте есть новые: заглушка
		// «переменные не заданы» рядом с ними противоречила бы сама себе.
		it("replaces the empty text when the text has new keys", () => {
			const editor = setup("{СКИДКА}", { newVariables: true });
			openVariables(editor);

			expect(document.querySelector(".messageeditor-variables .variables .empty")).toBeNull();
			expect(rows()).toHaveLength(1);
		});

		// Предложить к вставке ключ, который нельзя завести, значило бы звать набрать его ещё раз.
		it("keeps a key that cannot be declared out of the window", () => {
			const editor = setup("{A|B} и {СКИДКА}", declared);
			openVariables(editor);

			expect(rows().map((r) => r.querySelector(".preview")!.textContent)).toEqual([
				"{Имя}",
				"{ГОРОД}",
				"{СКИДКА}",
			]);
		});

		// в строгом режиме необъявленный ключ — ошибка, и предлагать его к вставке значило бы
		// звать повторить её
		it("shows no new keys in the strict mode", () => {
			const editor = setup("{ЧУЖАЯ}", { variables: declared.variables });
			openVariables(editor);

			expect(rows()).toHaveLength(2);
			expect(rows().some((r) => r.classList.contains("new"))).toBe(false);
		});
	});
});

// Атрибут ставит сервер, а шаблон обычно печатает в него значение, а не решает, писать ли его
// вовсе: `data-new-variables="false"` обязан значить «выключено», иначе выключенный режим
// выглядел бы включённым.
describe("data-new-variables value", () => {
	it.each([
		["", true],
		["true", true],
		["1", true],
		["false", false],
		["0", false],
		["FALSE", false],
	])("reads %j as %s", (value, expected) => {
		document.body.innerHTML = "";
		const input = document.createElement("textarea");
		input.setAttribute("data-new-variables", value);
		input.dataset.variables = "ИМЯ";
		input.value = "{СКИДКА}";
		document.body.appendChild(input);

		const editor = new MessageEditor(input);

		expect(editor.newVariables).toBe(expected);
		expect(editor.editor.editable.querySelector("span.variable")!.classList.contains("new")).toBe(expected);
	});

	it("stays off without the attribute", () => {
		document.body.innerHTML = "";
		const input = document.createElement("textarea");
		input.dataset.variables = "ИМЯ";
		document.body.appendChild(input);

		expect(new MessageEditor(input).newVariables).toBe(false);
	});
});
