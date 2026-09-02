/**
 * @jest-environment jsdom
 */

// Значок в поле красится токеном `--svg-fill`, а тот брался из `--<состояние>--input-color`.
// Эти токены равны ключевому слову `inherit`: для `color` это верно — берётся цвет страницы, —
// а подставленное в `fill` оно означает `fill` родителя, то есть初альный чёрный. На светлой теме
// разницы не видно, на тёмной значок чернел под курсором, в фокусе и на неверном значении.
//
// Проверяем не имя токена, а то, чем дело кончается: значение, которым значок будет закрашен,
// не должно быть ключевым словом `inherit` ни в одном состоянии.

import path from "node:path";
import { compileRules, declared, inherited, KIT_DIR, type Rule } from "../../../test/css-cascade";

const PACKAGE = path.join(__dirname, "..");

const STATES = ["hover", "focus-within", "focus", "user-invalid", "disabled"] as const;

const compile = (entry: string): Rule[] =>
	compileRules({
		entry,
		paths: [
			PACKAGE,
			path.join(PACKAGE, "source"),
			path.join(PACKAGE, "node_modules"),
			KIT_DIR,
			path.join(KIT_DIR, "source"),
		],
		states: STATES,
		lessFrom: KIT_DIR,
	});

interface Situation {
	hover?: boolean;
	focused?: boolean;
	readonly?: boolean;
	disabled?: boolean;
	invalid?: boolean;
	incorrect?: boolean;
}

/** Поле со значком в кнопке действий — там, где значок и живёт. */
function icon(state: Situation) {
	document.body.innerHTML = `
		<div class="ui-textbox">
			<div class="editor"></div>
			<div class="actions"><button type="button"><svg></svg></button></div>
		</div>`;

	const root = document.querySelector(".ui-textbox") as HTMLElement;

	if (state.hover) root.setAttribute("data-hover", "");
	if (state.focused) root.classList.add("focused");
	if (state.readonly) root.classList.add("readonly");
	if (state.disabled) root.classList.add("disabled");
	if (state.invalid) root.classList.add("invalid");
	if (state.incorrect) root.classList.add("incorrect");

	return document.querySelector("svg") as unknown as HTMLElement;
}

let textboxRules: Rule[];
let inputRules: Rule[];

beforeAll(() => {
	textboxRules = compile(path.join(PACKAGE, "source", "textbox.less"));
	// Токены объявлены в `:root` кита, а textbox импортирует его по ссылке — в собственном
	// выводе пакета блока `:root` нет вовсе, и искать значение токена нужно здесь.
	inputRules = compile(path.join(KIT_DIR, "source", "inputs.less"));
}, 60000);

afterEach(() => {
	document.body.innerHTML = "";
});

/** Чем значок будет закрашен, с одним переходом через токен. */
const fill = (state: Situation) => {
	const value = inherited(textboxRules, icon(state), "--svg-fill");
	const token = value?.match(/^var\((--[\w-]+)(?:,[^)]*)?\)$/)?.[1];
	if (!token) return value;

	const root = declared(inputRules, document.documentElement, token);
	if (root === undefined) throw new Error(`Токен ${token} не объявлен в :root — проверять нечего`);

	return root;
};

const situations: Array<[string, Situation]> = [
	["в покое", {}],
	["под курсором", { hover: true }],
	["в фокусе", { focused: true }],
	["на неверном значении", { invalid: true }],
	["на непринятом значении", { incorrect: true }],
	["у только читаемого поля", { readonly: true }],
	["у выключенного поля", { disabled: true }],
];

it.each(situations)("значок не красится ключевым словом inherit %s", (_, state) => {
	expect(fill(state)).not.toBe("inherit");
});

// Механизм, на котором держится верхняя проверка: значок стоит в `<button>`, а у кнопки свой
// цвет от браузера — без наследования `currentColor` брал бы его, а не цвет поля.
it("кнопка действий наследует цвет поля", () => {
	const button = (icon({}) as HTMLElement).parentElement as HTMLElement;

	expect(declared(textboxRules, button, "color")).toBe("inherit");
});
