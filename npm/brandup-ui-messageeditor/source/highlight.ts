// Подсветка доменной разметки прямо в тексте: спинтакс `[раз|два]` и переменные `{ИМЯ}`.
// Обёртки — обычные <span>, редактор их не знает и при сериализации отбрасывает, оставляя
// текст, поэтому в значение подсветка не попадает.

export const SPINTAX_CLASS = "spintax";
export const VARIABLE_CLASS = "variable";
const HIGHLIGHT_SELECTOR = `span.${SPINTAX_CLASS}, span.${VARIABLE_CLASS}`;

// Спинтакс — только с разделителем: `[текст]` без `|` вариантов не содержит.
// Ни одна из конструкций не пересекает строку и не вкладывается друг в друга.
const PATTERN = /\[[^[\]\n]*\|[^[\]\n]*\]|\{[^{}\n]+\}/g;

/**
 * Перестраивает подсветку в редактируемом элементе.
 *
 * Возвращает true, если разметка перестраивалась, — тогда вызывающему нужно вернуть каретку.
 * Именно перестраивалась, а не изменилась: обёртки собираются из новых текстовых узлов, и после
 * этого прежнее выделение указывает на узлы, которых в дереве уже нет, даже когда разметка вышла
 * ровно такой же. Текст при перестройке не меняется, поэтому смещения совпадают точно.
 */
export function highlight(root: HTMLElement): boolean {
	// В тексте нет ни конструкций, ни прежних обёрток — трогать DOM незачем. Проверка дешёвая
	// и снимает работу с обычного набора, где ни спинтакса, ни переменных нет вовсе.
	const hasMarkup = PATTERN.test(root.textContent ?? "");
	PATTERN.lastIndex = 0;
	if (!hasMarkup && !root.querySelector(HIGHLIGHT_SELECTOR)) return false;

	unwrap(root);
	wrap(root);

	return true;
}

/** Снимает прежние обёртки: разметка могла разъехаться после правки текста. */
function unwrap(root: HTMLElement) {
	root.querySelectorAll<HTMLElement>(HIGHLIGHT_SELECTOR).forEach((span) => {
		span.replaceWith(...Array.from(span.childNodes));
	});

	// после разворачивания соседние текстовые узлы надо склеить, иначе конструкция,
	// разорванная по узлам, не найдётся регулярным выражением
	root.normalize();
}

function wrap(root: HTMLElement) {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	const targets: Text[] = [];

	let node = walker.nextNode() as Text | null;
	while (node) {
		if (PATTERN.test(node.data)) targets.push(node);
		PATTERN.lastIndex = 0; // общий g-объект: сбрасываем позицию между узлами
		node = walker.nextNode() as Text | null;
	}

	targets.forEach(wrapNode);
}

function wrapNode(node: Text) {
	const text = node.data;
	const fragment = document.createDocumentFragment();
	let last = 0;

	for (const match of text.matchAll(PATTERN)) {
		const start = match.index;
		if (start > last) fragment.appendChild(document.createTextNode(text.slice(last, start)));

		const span = document.createElement("span");
		span.className = match[0].startsWith("[") ? SPINTAX_CLASS : VARIABLE_CLASS;
		// Конструкция атомарна: править её текст в поле нельзя, только через своё окно — иначе
		// разметку легко испортить, стерев одну скобку. Ставим атрибутом, а не свойством:
		// свойство не отражается в разметку, и состояние было бы не видно ни в DOM, ни в тестах.
		span.setAttribute("contenteditable", "false");
		span.textContent = match[0];
		fragment.appendChild(span);

		last = start + match[0].length;
	}

	if (last < text.length) fragment.appendChild(document.createTextNode(text.slice(last)));

	node.replaceWith(fragment);
}
