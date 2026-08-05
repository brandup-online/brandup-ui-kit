// Подсветка доменной разметки прямо в тексте: спинтакс `[раз|два]` и переменные `{ИМЯ}`.
// Обёртки — обычные <span>, редактор их не знает и при сериализации отбрасывает, оставляя
// текст, поэтому в значение подсветка не попадает.

import { DOM } from "@brandup/ui";
import { SPINTAX_OPEN } from "./randomizer";
import { buildVariable } from "./variables";

export const SPINTAX_CLASS = "spintax";
export const VARIABLE_CLASS = "variable";
/** Ключ переменной внутри обёртки: на экране его подменяет название, но в тексте он остаётся. */
export const KEY_CLASS = "key";

/** Названия переменных по ключу — что показывать в тексте вместо `{КЛЮЧ}`. */
export type VariableNames = ReadonlyMap<string, string>;

export interface HighlightOptions {
	/** Названия переменных по ключу; без них показывается ключ. */
	names?: VariableNames;
	/** Подсвечивать ли переменные (по умолчанию да): выключенная персонализация их не выделяет. */
	variables?: boolean;
}

/** Обёртки подсвеченных конструкций — по нему их находят и подсветка, и правки редактора. */
export const MARKUP_SELECTOR = `span.${SPINTAX_CLASS}, span.${VARIABLE_CLASS}`;

/**
 * Конструкция, внутри которой лежит узел (обычно — якорь выделения), или null.
 * Узлом может быть и текст, и сам элемент: выделение указывает то на одно, то на другое.
 */
export function markupAt(node: Node | null | undefined): HTMLElement | null {
	const elem = node?.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node?.parentElement;

	return elem?.closest<HTMLElement>(MARKUP_SELECTOR) ?? null;
}

// Спинтакс — только с разделителем: `[текст]` без `|` вариантов не содержит.
// Ни одна из конструкций не пересекает строку и не вкладывается друг в друга.
const SPINTAX_PATTERN = /\[[^[\]\n]*\|[^[\]\n]*\]/;
const VARIABLE_PATTERN = /\{[^{}\n]+\}/;

// Выключенная персонализация не подсвечивает переменные вовсе: подсвеченная конструкция неделима,
// и без своего окна её нельзя было бы ни поправить, ни разобрать по частям.
const WITH_VARIABLES = new RegExp(`${SPINTAX_PATTERN.source}|${VARIABLE_PATTERN.source}`, "g");
const SPINTAX_ONLY = new RegExp(SPINTAX_PATTERN.source, "g");

/**
 * Перестраивает подсветку в редактируемом элементе.
 *
 * Возвращает true, если разметка перестраивалась, — тогда вызывающему нужно вернуть каретку.
 * Именно перестраивалась, а не изменилась: обёртки собираются из новых текстовых узлов, и после
 * этого прежнее выделение указывает на узлы, которых в дереве уже нет, даже когда разметка вышла
 * ровно такой же. Текст при перестройке не меняется, поэтому смещения совпадают точно.
 */
export function highlight(root: HTMLElement, options: HighlightOptions = {}): boolean {
	const pattern = options.variables === false ? SPINTAX_ONLY : WITH_VARIABLES;

	// В тексте нет ни конструкций, ни прежних обёрток — трогать DOM незачем. Проверка дешёвая
	// и снимает работу с обычного набора, где ни спинтакса, ни переменных нет вовсе.
	const hasMarkup = pattern.test(root.textContent ?? "");
	pattern.lastIndex = 0;
	if (!hasMarkup && !root.querySelector(MARKUP_SELECTOR)) return false;

	// Разметка уже на месте — а перестройка не бесплатна: она пересобирает обёртки всего текста
	// и заставляет вызывающего возвращать каретку по смещениям. Печать рядом с конструкцией даёт
	// это на каждый символ, и каждый раз каретка проходила бы через восстановление зря.
	if (isHighlighted(root, pattern)) return false;

	unwrap(root);
	wrap(root, pattern, options.names);

	return true;
}

/**
 * Соответствует ли текущая разметка тексту: каждая обёртка содержит ровно одну конструкцию,
 * а вне обёрток конструкций нет.
 *
 * Идущие подряд текстовые узлы проверяются вместе: конструкция могла разорваться между ними
 * (правка вставляет узлы), и по отдельности такую не найти — как не находит её и {@link wrap},
 * которому текст перед разбором склеивает {@link unwrap}.
 */
function isHighlighted(root: HTMLElement, pattern: RegExp): boolean {
	const matches = (text: string) => {
		pattern.lastIndex = 0;
		const found = pattern.test(text);
		pattern.lastIndex = 0;

		return found;
	};

	for (const span of Array.from(root.querySelectorAll<HTMLElement>(MARKUP_SELECTOR))) {
		const text = span.textContent ?? "";
		pattern.lastIndex = 0;
		const match = pattern.exec(text);
		pattern.lastIndex = 0;

		if (!match || match[0] !== text) return false;
	}

	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	let run = "";

	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		// текст обёртки уже проверен; она же разрывает цепочку соседних узлов
		if (markupAt(node)) {
			if (matches(run)) return false;
			run = "";
			continue;
		}

		run += (node as Text).data;
	}

	return !matches(run);
}

/** Снимает прежние обёртки: разметка могла разъехаться после правки текста. */
function unwrap(root: HTMLElement) {
	root.querySelectorAll<HTMLElement>(MARKUP_SELECTOR).forEach((span) => {
		// Разворачиваем в один текстовый узел, а не в детей: у переменной с названием внутри
		// лежит ещё и обёртка ключа, и она осталась бы посреди текста.
		span.replaceWith(document.createTextNode(span.textContent ?? ""));
	});

	// после разворачивания соседние текстовые узлы надо склеить, иначе конструкция,
	// разорванная по узлам, не найдётся регулярным выражением
	root.normalize();
}

function wrap(root: HTMLElement, pattern: RegExp, names?: VariableNames) {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	const targets: Text[] = [];

	let node = walker.nextNode() as Text | null;
	while (node) {
		if (pattern.test(node.data)) targets.push(node);
		pattern.lastIndex = 0; // общий g-объект: сбрасываем позицию между узлами
		node = walker.nextNode() as Text | null;
	}

	targets.forEach((target) => wrapNode(target, pattern, names));
}

function wrapNode(node: Text, pattern: RegExp, names?: VariableNames) {
	const text = node.data;
	const fragment = document.createDocumentFragment();
	let last = 0;

	for (const match of text.matchAll(pattern)) {
		const start = match.index;
		if (start > last) fragment.appendChild(document.createTextNode(text.slice(last, start)));

		fragment.appendChild(buildMarkup(match[0], names));

		last = start + match[0].length;
	}

	if (last < text.length) fragment.appendChild(document.createTextNode(text.slice(last)));

	node.replaceWith(fragment);
}

/**
 * Обёртка конструкции. Текст внутри — всегда сама конструкция: из него собирается значение
 * сообщения, и подсветка его не меняет.
 *
 * У переменной с названием ключ прячется, а на экран выводится оформлением подпись из атрибута
 * (см. `data-label` в messageeditor.less) — так текст остаётся нетронутым. Скобки в подпись
 * кладём здесь же: конструкция должна быть узнаваема, а собираются они там же, где и всегда.
 */
function buildMarkup(text: string, names?: VariableNames): HTMLElement {
	const span = document.createElement("span");
	const spintax = text.startsWith(SPINTAX_OPEN);

	span.className = spintax ? SPINTAX_CLASS : VARIABLE_CLASS;
	// Конструкция атомарна: править её текст в поле нельзя, только через своё окно — иначе
	// разметку легко испортить, стерев одну скобку. Ставим атрибутом, а не свойством:
	// свойство не отражается в разметку, и состояние было бы не видно ни в DOM, ни в тестах.
	span.setAttribute("contenteditable", "false");

	const name = spintax ? undefined : names?.get(text.slice(1, -1));
	if (!name) {
		span.textContent = text;
		return span;
	}

	span.dataset.label = buildVariable(name);
	// ключ спрятан, а знать его иногда нужно — например когда у двух переменных одно название
	span.setAttribute("title", text);
	span.appendChild(DOM.tag("span", { class: KEY_CLASS }, text));

	return span;
}
