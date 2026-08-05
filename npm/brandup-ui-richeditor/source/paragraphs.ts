// Нормализация содержимого редактора: схлопывание пробелов по строкам и приведение
// верхнего уровня к абзацам <p> (модель многострочного режима).

import { cleanupFormatting } from "./selection";

/**
 * Что в содержимом редактора считается абзацем. Единственное определение модели абзацев:
 * по нему идут и разбор с сериализацией, и правки каретки, и нормализация. `<div>` признаём
 * наравне с `<p>` — его приносят вставка и чужой contenteditable, а нормализация приводит к `<p>`.
 */
export function isBlock(node: Node): boolean {
	if (node.nodeType !== Node.ELEMENT_NODE) return false;

	const tag = (node as Element).tagName;
	return tag === "P" || tag === "DIV";
}

// Пробел, таб и неразрывный пробел (U+00A0) — всё это «пробел» при наборе; см. normalizeWhitespace.
// После схлопывания в тексте остаются только обычные пробелы, поэтому дальше по коду хватает " ".
const SPACE_RUN = /[ \t\u00A0]+/g;

/**
 * Нормализует пробелы в редакторе: схлопывает повторяющиеся пробелы/табы в один
 * и обрезает пробелы по краям каждой строки. BR и блочные элементы (DIV/P) —
 * границы строк; инлайновое форматирование (b/i/s/u) на строки не влияет.
 *
 * Неразрывный пробел (U+00A0) считается обычным: браузер сам подставляет его в contenteditable
 * вместо пробела, который иначе схлопнулся бы при отображении. Без этого набранные подряд
 * пробелы не схлопывались бы вовсе, а U+00A0 уезжал бы в сохраняемое значение.
 */
export function normalizeWhitespace(root: HTMLElement) {
	type Item = { kind: "text"; node: Text } | { kind: "break" };
	const items: Item[] = [];

	// Присваивание Text.data — это «replace data» по всему узлу, а оно схлопывает границы
	// живых Range внутри узла в его начало: каретка уезжает в начало строки. Нормализация
	// чаще всего ничего не меняет (вызывается на blur), поэтому пишем только при отличии.
	const setData = (node: Text, text: string) => {
		if (node.data !== text) node.data = text;
	};

	const flatten = (node: Node) => {
		for (const child of Array.from(node.childNodes)) {
			if (child.nodeType === Node.TEXT_NODE) {
				items.push({ kind: "text", node: child as Text });
			} else if (child.nodeType === Node.ELEMENT_NODE) {
				const el = child as HTMLElement;
				if (el.tagName === "BR") {
					items.push({ kind: "break" });
				} else if (isBlock(el)) {
					items.push({ kind: "break" });
					flatten(el);
					items.push({ kind: "break" });
				} else {
					flatten(el); // инлайновый тег — не разрывает строку
				}
			}
		}
	};
	flatten(root);

	let atLineStart = true;
	let pendingSpaceNode: Text | null = null; // узел, заканчивающийся пробелом (возможно хвостовым)

	for (const item of items) {
		if (item.kind === "break") {
			if (pendingSpaceNode) {
				setData(pendingSpaceNode, pendingSpaceNode.data.replace(/ $/, ""));
				pendingSpaceNode = null;
			}
			atLineStart = true;
			continue;
		}

		let text = item.node.data.replace(SPACE_RUN, " ");
		if (atLineStart) text = text.replace(/^ /, ""); // пробел в начале строки
		if (pendingSpaceNode && text.startsWith(" ")) text = text.slice(1); // двойной пробел на границе узлов

		setData(item.node, text);
		if (text.length === 0) continue;

		atLineStart = false;
		pendingSpaceNode = text.endsWith(" ") ? item.node : null;
	}

	if (pendingSpaceNode) setData(pendingSpaceNode, pendingSpaceNode.data.replace(/ $/, "")); // хвост последней строки

	cleanupFormatting(root); // убрать опустевшие теги, склеить узлы
}

/**
 * Нормализует абзацы многострочного режима: удаляет пустые абзацы (без текстового содержимого).
 * Если содержимого нет вовсе — редактор остаётся пустым (показывается placeholder).
 */
export function normalizeParagraphs(root: HTMLElement) {
	for (const el of Array.from(root.children)) {
		if (el.tagName === "P" && (el.textContent ?? "").trim() === "") el.remove();
	}
}

/**
 * Нормализует верхний уровень редактора к абзацам <p>: блуждающие текст/инлайн оборачиваются в <p>,
 * <div> заменяются на <p>, пустые абзацы получают <br>-заполнитель (чтобы строка была видимой).
 */
export function ensureParagraphs(root: HTMLElement) {
	let run: ChildNode[] = [];

	const flushRun = (before: Node | null) => {
		if (!run.length) return;
		const p = document.createElement("p");
		for (const node of run) p.appendChild(node);
		root.insertBefore(p, before);
		run = [];
	};

	for (const node of Array.from(root.childNodes)) {
		const el = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : null;

		if (el && isBlock(el)) {
			flushRun(node);
			if (el.tagName === "DIV") {
				const p = document.createElement("p");
				while (el.firstChild) p.appendChild(el.firstChild);
				root.replaceChild(p, el);
			}
		} else {
			run.push(node);
		}
	}
	flushRun(null);

	for (const p of Array.from(root.querySelectorAll("p"))) {
		if (!p.firstChild) {
			p.appendChild(document.createElement("br")); // пустой абзац — заполнитель для видимости строки
			continue;
		}

		// в непустом абзаце убираем краевые <br>-заполнители: иначе введённый текст
		// оказывается рядом с лишним переносом (символ «съезжает» на новую строку).
		// Внутренние <br> (мягкие переносы) сохраняются.
		if ((p.textContent ?? "").length > 0) {
			while (p.firstChild && p.firstChild.nodeName === "BR") p.removeChild(p.firstChild);
			while (p.lastChild && p.lastChild.nodeName === "BR") p.removeChild(p.lastChild);
		}
	}
}
