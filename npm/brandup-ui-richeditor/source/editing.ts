// Низкоуровневые операции редактирования на чистом Selection/Range: абзацы, мягкие переносы,
// каретка, расширение/обрезка выделения, разбор вставляемого содержимого. Без состояния
// редактора и без истории — вызывающий сам решает, когда записывать undo-шаг.

import { deserialize } from "./serialize";
import { blockAt, blockTypeOf, blocksInRange, createBlock, isBlock } from "./paragraphs";
import { documentSelection, innerSelection, linkAt, literalAncestor } from "./selection";
import { BLOCK_TYPES, DEFAULT_BLOCK, type BlockType, type FormatMarkers, type FormatTool } from "./format-config";

// убирает пустые текст-узлы и ставит <br>-заполнитель в пустой абзац (для видимости и каретки)
function fillEmptyParagraph(p: HTMLElement) {
	p.normalize(); // удаляет пустые Text-узлы, склеивает соседние
	if (!p.firstChild) p.appendChild(document.createElement("br"));
}

function caretToStart(node: Node) {
	const range = document.createRange();
	range.setStart(node, 0);
	range.collapse(true);
	const selection = documentSelection(node);
	if (selection) {
		selection.removeAllRanges();
		selection.addRange(range);
	}
}

/** Каретка в конец содержимого: в multiline — в конец последнего абзаца, иначе в конец редактора. */
export function caretToEnd(editable: HTMLElement, multiline: boolean) {
	const range = document.createRange();
	// multiline: каретку в конец последнего абзаца (а не на уровень редактора),
	// иначе и ввод, и Enter попадают мимо <p>
	const last = multiline ? editable.lastElementChild : null;
	range.selectNodeContents(last && isBlock(last) ? last : editable);
	range.collapse(false);
	const sel = documentSelection(editable);
	if (sel) {
		sel.removeAllRanges();
		sel.addRange(range);
	}
}

/** Фокус и выделение всего содержимого (например, readonly-режим). */
export function selectAllContent(editable: HTMLElement) {
	editable.focus();
	documentSelection(editable)?.selectAllChildren(editable);
}

/** Что сделала правка блоков: менялось ли содержимое и не появился ли блок из части строк. */
export interface BlockChange {
	changed: boolean;
	/** Блок, собранный из выделенных строк (разделение); null — блоки меняли целиком. */
	created: HTMLElement | null;
}

/**
 * Меняет тип блоков, которых касается выделение. `changed: false` — менять было нечего:
 * тогда ни содержимое, ни история не трогаются.
 *
 * У типа без инлайновой разметки (код) форматирование снимается: внутри него написанное
 * остаётся буквальным, и сохранить его всё равно было бы негде.
 */
export function applyBlocks(editable: HTMLElement, range: Range, type: BlockType): BlockChange {
	const blocks = blocksInRange(editable, range);

	// Пустой редактор: блоков ещё нет, но тип задать можно — иначе в пустое поле его было бы
	// не поставить вовсе, а набор блока обычно с этого и начинают.
	if (!blocks.length && !editable.firstChild && type !== DEFAULT_BLOCK) {
		const block = createBlock(type);
		editable.appendChild(block);
		caretToStart(block);

		return { changed: true, created: block };
	}

	// Выделена часть строк блока — правим их, а не весь блок: иначе в мессенджерском режиме,
	// где всё сообщение это один блок, кодом становился бы весь текст.
	if (blocks.length === 1 && type !== DEFAULT_BLOCK && blockTypeOf(blocks[0]) !== type) {
		const created = splitLines(blocks[0], range, type);
		if (created) return { changed: true, created };
	}

	let changed = false;

	for (const block of blocks) {
		if (blockTypeOf(block) === type) continue;

		const replacement = retagBlock(block, type);
		if (!BLOCK_TYPES[type].inline) unwrapFormatting(replacement);

		block.replaceWith(replacement);
		fillEmptyParagraph(replacement);
		changed = true;
	}

	return { changed, created: null };
}

/**
 * Собирает блок нужного типа из строк, которых коснулось выделение; остальные строки остаются
 * блоками прежнего типа до и после. Строки берутся целиком: код из половины строки — это уже
 * моноширинный, а не блок.
 *
 * null — делить нечего: выделение и так захватило все строки блока.
 */
function splitLines(block: HTMLElement, range: Range, type: BlockType): HTMLElement | null {
	const breaks = Array.from(block.querySelectorAll("br"));

	// последний перенос перед выделением и первый после него — по ним и режем
	const head = breaks.filter((br) => range.comparePoint(br, 0) < 0).pop();
	const tail = breaks.find((br) => range.comparePoint(br, 0) > 0);
	if (!head && !tail) return null;

	const original = blockTypeOf(block) ?? DEFAULT_BLOCK;

	// Хвост выносим первым: он дальше по дереву, и вынос головы сдвинул бы его границы.
	// Сам перенос-разделитель уходит вместе с ним — строки разъезжаются по блокам.
	const cut = (from: "before" | "after", br: HTMLElement): HTMLElement => {
		const part = document.createRange();

		if (from === "after") {
			part.setStartAfter(br);
			part.setEnd(block, block.childNodes.length);
		} else {
			part.setStart(block, 0);
			part.setEndBefore(br);
		}

		const piece = document.createElement(BLOCK_TYPES[original].tag);
		piece.appendChild(part.extractContents());
		br.remove();
		fillEmptyParagraph(piece);

		return piece;
	};

	const after = tail ? cut("after", tail) : null;
	const before = head ? cut("before", head) : null;

	const created = retagBlock(block, type);
	if (!BLOCK_TYPES[type].inline) unwrapFormatting(created);

	block.replaceWith(created);
	fillEmptyParagraph(created);

	if (before) created.before(before);
	if (after) created.after(after);

	return created;
}

// Разворачивает инлайновые теги, оставляя текст и мягкие переносы. Список снимается заранее:
// разворот внешнего тега поднимает вложенные к блоку, и обойти их нужно тоже.
function unwrapFormatting(block: HTMLElement) {
	for (const el of Array.from(block.querySelectorAll<HTMLElement>("*"))) {
		if (el.tagName === "BR") continue;
		el.replaceWith(...Array.from(el.childNodes));
	}
	block.normalize();
}

/**
 * Стоит ли каретка в начале своего блока — по тексту до неё, а не по узлу: началом считается
 * и позиция перед вложенным форматированием, и позиция в его первом текстовом узле.
 */
export function atBlockStart(editable: HTMLElement, range: Range): boolean {
	if (!range.collapsed) return false;

	const block = blockAt(editable, range.startContainer);
	if (!block) return false;

	// В пустом блоке каретка всегда в его начале: <br> там — заполнитель, он делает строку
	// видимой, но строкой не является. Иначе из опустевшей цитаты было бы не выйти — каретка
	// стоит за заполнителем, и проверка ниже приняла бы его за конец первой строки.
	if (!(block.textContent ?? "").length) return true;

	const before = document.createRange();
	before.selectNodeContents(block);
	before.setEnd(range.startContainer, range.startOffset);

	// Начало блока — это и начало его первой строки. Перед кареткой стоит перенос — значит
	// строка не первая, и удалять нужно сам перенос, а не тип блока.
	if (before.cloneContents().querySelector("br")) return false;

	return before.toString().length === 0;
}

/**
 * Block the caret sits in, or null when it stands at the editor level — an empty editor, or text
 * that has not been wrapped into a paragraph yet.
 */
function blockOf(editable: HTMLElement, node: Node): HTMLElement | null {
	let current: Node | null = node;
	while (current && current !== editable && !isBlock(current)) current = current.parentNode;

	return current && current !== editable ? (current as HTMLElement) : null;
}

/**
 * Where to insert at the editor level: the node the new content goes before (null — at the end).
 *
 * A position addresses a child only when the container is the editor itself. A caret inside stray
 * top-level text sits in a text node, and there the offset counts characters rather than children:
 * taken as a child index it would send the insertion to an arbitrary place. From such a node we
 * measure the node itself and insert after it, which is what a caret inside it asks for.
 */
function topLevelRef(editable: HTMLElement, range: Range): ChildNode | null {
	const container = range.startContainer;
	if (container === editable) return editable.childNodes[range.startOffset] ?? null;

	let node: Node = container;
	while (node.parentNode && node.parentNode !== editable) node = node.parentNode;

	return node.parentNode === editable ? (node as ChildNode).nextSibling : null;
}

/** Enter в multiline: разбить текущий блок по каретке; хвост становится блоком типа `type`. */
export function insertParagraph(editable: HTMLElement, type: BlockType = DEFAULT_BLOCK) {
	const selection = innerSelection(editable);
	if (!selection) return;

	const range = selection.getRangeAt(0);
	range.deleteContents();

	// Ссылку абзац разорвал бы пополам, а её текст в разметке — один кусок. Выводим хвост
	// из неё до разбиения: в новом абзаце останется обычный текст (см. splitLinkOut).
	splitLinkOut(editable, range);

	// текущий блок (ближайший блочный предок внутри редактора)
	const para = blockOf(editable, range.startContainer);

	// каретка не внутри абзаца — создаём абзац сразу с видимым результатом (иначе Enter «срабатывает со 2-го раза»)
	if (!para) {
		const next = createBlock(type);
		if (editable.childNodes.length === 0) {
			// пустой редактор: пустая строка-источник + новая строка с кареткой
			editable.appendChild(createBlock(DEFAULT_BLOCK));
			editable.appendChild(next);
		} else {
			// каретка на уровне редактора между/после абзацев — вставляем новый абзац в эту позицию
			editable.insertBefore(next, topLevelRef(editable, range));
		}
		caretToStart(next);
		return;
	}

	// выносим содержимое от каретки до конца абзаца в новый <p>
	const tail = document.createRange();
	tail.selectNodeContents(para);
	tail.setStart(range.endContainer, range.endOffset);
	const fragment = tail.extractContents();

	// Выходим из блока, а за ним уже стоит пустой абзац — переходим в него. Иначе одно нажатие
	// давало бы две пустые строки: одна тут заводится, вторая уже была заведена под каретку.
	const following = para.nextElementSibling;
	const empty = !(fragment.textContent ?? "") && !fragment.querySelector("br");

	if (empty && following && blockTypeOf(following) === type && !(following.textContent ?? "")) {
		fillEmptyParagraph(para);
		caretToStart(following);

		return;
	}

	const next = document.createElement(BLOCK_TYPES[type].tag);
	next.appendChild(fragment);
	para.after(next);

	// хвост уехал в блок другого типа — его правила распространяются и на содержимое
	if (!BLOCK_TYPES[type].inline) unwrapFormatting(next);

	// extractContents в конце абзаца оставляет пустой текст-узел → <p></p> без заполнителя
	// (невидим/нефокусируем, каретка не встаёт). Чистим и ставим <br> в опустевшие абзацы.
	fillEmptyParagraph(para);
	fillEmptyParagraph(next);

	caretToStart(next);
}

/**
 * Разрезает элемент по каретке: содержимое после неё уходит в такой же элемент следом,
 * а диапазон встаёт между половинами — вставленное туда окажется снаружи обоих. Пустые
 * половины не оставляем: печатать в них было бы нечего, а каретка попадала бы внутрь.
 */
/**
 * Выводит хвост ссылки из неё, разрезав по каретке: перед переносом строки.
 *
 * Ссылку разрывать нельзя — в разметке её текст один кусок, — а продолжать на новой строке
 * нечем: адрес у ссылки один, и вторая ссылка с тем же адресом появилась бы сама собой,
 * хотя её никто не заводил. Поэтому за переносом остаётся обычный текст.
 */
function splitLinkOut(editable: HTMLElement, range: Range) {
	const link = linkAt(editable, range);
	if (!link) return;

	// Разрезаем и снимаем с хвоста обёртку: каретка стоит ровно перед ним, и разворачивание
	// её не сдвигает — на месте одного узла оказываются его дети, с того же места.
	const tail = splitElement(link, range);
	if (tail) tail.replaceWith(...Array.from(tail.childNodes));
}

/** Разрезает элемент по каретке; возвращает хвост, если в нём что-то осталось. */
function splitElement(el: HTMLElement, range: Range): HTMLElement | null {
	const tail = document.createRange();
	tail.selectNodeContents(el);
	tail.setStart(range.startContainer, range.startOffset);

	const rest = el.cloneNode(false) as HTMLElement;
	rest.appendChild(tail.extractContents());

	const kept = !!rest.textContent;
	if (kept) el.after(rest);

	range.setStartAfter(el);
	range.collapse(true);

	if (!el.textContent) el.remove();

	return kept ? rest : null;
}

/** Shift/Ctrl+Enter в multiline: вставить мягкий перенос <br>. */
export function insertSoftBreak(editable: HTMLElement) {
	const selection = innerSelection(editable);
	if (!selection) return;

	const range = selection.getRangeAt(0);
	range.deleteContents();

	// Перенос не живёт в моноширинном: значение берёт оттуда голый текст, и новая строка
	// пропала бы — поле показывало бы две, а получатель увидел одну. Разрезаем тег и ставим
	// перенос между половинами: форматирование продолжается на новой строке, только если
	// там что-то осталось.
	const literal = literalAncestor(range.startContainer, editable);
	if (literal) splitElement(literal, range);

	// Перенос не живёт и в ссылке: её текст — один сплошной кусок, разметкой разорванный
	// не выражается. Разрезаем так же, но продолжения на новой строке не оставляем: адрес
	// у неё один, а второй ссылки никто не заводил.
	splitLinkOut(editable, range);

	const br = document.createElement("br");
	range.insertNode(br);

	// insertNode в конце текст-узла расщепляет его и оставляет пустой хвост — убираем,
	// иначе br.nextSibling != null и заполнитель не ставится (перенос в конце строки не виден)
	const next = br.nextSibling;
	if (next && next.nodeType === Node.TEXT_NODE && (next.textContent ?? "") === "") next.remove();

	const after = document.createRange();
	if (!br.nextSibling) {
		// перенос в конце строки — нужен второй <br>-заполнитель, иначе новая строка не отображается
		// (хвостовой <br> отбрасывается при сериализации)
		const pad = document.createElement("br");
		br.after(pad);
		after.setStartBefore(pad);
	} else {
		after.setStartAfter(br);
	}
	after.collapse(true);
	selection.removeAllRanges();
	selection.addRange(after);
}

/** Вставляет санитизированные абзацы <p> в позицию каретки, разбивая текущий абзац. */
export function insertPastedParagraphs(editable: HTMLElement, paras: HTMLElement[], range: Range) {
	const block = blockOf(editable, range.startContainer);

	// каретка не внутри абзаца (пустой редактор / уровень редактора) — вставляем абзацы как есть
	if (!block) {
		const ref = topLevelRef(editable, range);
		for (const p of paras) editable.insertBefore(p, ref);
		return;
	}

	// Вставка в цитату или код остаётся в них: разорвать блок посреди вставки — не то,
	// чего ждут, а тип целевого блока диктует и правила его содержимого.
	const type = blockTypeOf(block) ?? DEFAULT_BLOCK;

	// хвост текущего абзаца после каретки — выносим, чтобы вернуть в конец вставки
	const tailRange = document.createRange();
	tailRange.selectNodeContents(block);
	tailRange.setStart(range.startContainer, range.startOffset);
	const tail = tailRange.extractContents();

	if (!BLOCK_TYPES[type].inline) for (const p of paras) unwrapFormatting(p);

	// первый вставляемый абзац вливается в текущий (после содержимого до каретки)
	while (paras[0].firstChild) block.appendChild(paras[0].firstChild);

	if (paras.length === 1) {
		block.appendChild(tail); // один абзац: содержимое-до + вставка + хвост в одном <p>
		return;
	}

	// остальные абзацы — отдельными блоками того же типа после текущего; хвост — в конец последнего
	let anchor: ChildNode = block;
	for (let i = 1; i < paras.length; i++) {
		paras[i] = retagBlock(paras[i], type);
		anchor.after(paras[i]);
		anchor = paras[i];
	}
	paras[paras.length - 1].appendChild(tail);
}

// Тот же блок, но другим тегом. Содержимое переносится как есть — правила типа к нему
// применяет вызывающий, он же знает, откуда это содержимое взялось.
function retagBlock(block: HTMLElement, type: BlockType): HTMLElement {
	if (blockTypeOf(block) === type) return block;

	const replacement = document.createElement(BLOCK_TYPES[type].tag);
	while (block.firstChild) replacement.appendChild(block.firstChild);

	return replacement;
}

/** Обрезает пробелы по краям абзаца (после схлопывания) — у крайних текстовых узлов. */
function trimParagraphEdges(p: HTMLElement) {
	const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
	const texts: Text[] = [];
	for (let t = walker.nextNode() as Text | null; t; t = walker.nextNode() as Text | null) texts.push(t);
	if (!texts.length) return;

	// неразрывный пробел режем наравне с обычным — из буфера обмена он приходит регулярно
	texts[0].textContent = (texts[0].textContent ?? "").replace(/^[ \u00A0]/, "");
	const last = texts[texts.length - 1];
	last.textContent = (last.textContent ?? "").replace(/[ \u00A0]$/, "");
}

/**
 * Строки вставляемого текста → абзацы `<p>` с мягкими переносами `<br>` внутри.
 *
 * При `blocks` абзацы разделяет пустая строка (режим `block` многострочного редактора);
 * иначе весь текст — один абзац, а все переносы мягкие: так вставка ложится в ту же модель,
 * которую даёт Enter, и значение после неё разбирается обратно.
 */
export function buildParagraphs(lines: string[], blocks: boolean): HTMLElement[] {
	const groups: string[][] = [];

	if (blocks) {
		let group: string[] = [];
		for (const line of lines) {
			if (line !== "") group.push(line);
			else if (group.length) {
				groups.push(group);
				group = [];
			}
		}
		if (group.length) groups.push(group);
	} else if (lines.length) groups.push(lines);

	return groups.map((group) => {
		const p = document.createElement("p");
		group.forEach((line, index) => {
			if (index > 0) p.appendChild(document.createElement("br"));
			p.appendChild(document.createTextNode(line));
		});

		return p;
	});
}

/**
 * Разбирает HTML из буфера обмена в абзацы `<p>`, оставляя только разрешённые инструменты.
 * Пустой результат — вставлять нечего (вызывающий откатится на простой текст).
 */
export function sanitizePastedHtml(
	html: string,
	tools: FormatTool[],
	markers: FormatMarkers,
	types: BlockType[] = [DEFAULT_BLOCK]
): HTMLElement[] {
	// убираем мусорные элементы (Word/браузер: стили, скрипты, заголовок документа)
	const source = document.createElement("template");
	source.innerHTML = html;
	source.content.querySelectorAll("script, style, head, meta, link, title, noscript").forEach((el) => el.remove());

	// единый источник санитизации — deserialize (теги-синонимы → канонические, лишнее развёрнуто)
	const holder = document.createElement("template");
	holder.innerHTML = deserialize(source.innerHTML, "html", tools, markers, true, types);

	// внешний HTML: пробелы/переводы строк между тегами не значимы — схлопываем,
	// иначе литеральные \n (pre-wrap) и отступы дают лишние переносы
	const walker = document.createTreeWalker(holder.content, NodeFilter.SHOW_TEXT);
	for (let t = walker.nextNode(); t; t = walker.nextNode())
		t.textContent = (t.textContent ?? "").replace(/\s+/g, " ");

	const paras = Array.from(holder.content.children) as HTMLElement[];
	for (const p of paras) trimParagraphEdges(p);

	// отбрасываем пустые краевые абзацы (ведущие/хвостовые \n и <br>-обёртки из буфера),
	// иначе перед и после вставленного текста появляются пустые строки
	while (paras.length && (paras[0].textContent ?? "").trim() === "") paras.shift();
	while (paras.length && (paras[paras.length - 1].textContent ?? "").trim() === "") paras.pop();

	return paras;
}

/**
 * Диапазон, расширенный до целых слов на границах (для применения формата к слову целиком).
 * Возвращает новый Range и не трогает выделение — вызывающий сам решает, править ли по нему
 * и когда двигать каретку.
 */
export function expandRangeToWords(editable: HTMLElement, range: Range): Range {
	const { startContainer, endContainer } = range;
	let startOffset = range.startOffset;
	let endOffset = range.endOffset;

	if (startContainer.nodeType === Node.TEXT_NODE && editable.contains(startContainer)) {
		const text = startContainer.textContent ?? "";
		while (startOffset > 0 && !/\s/.test(text[startOffset - 1])) startOffset--;
	}

	if (endContainer.nodeType === Node.TEXT_NODE && editable.contains(endContainer)) {
		const text = endContainer.textContent ?? "";
		while (endOffset < text.length && !/\s/.test(text[endOffset])) endOffset++;
	}

	const expanded = document.createRange();
	expanded.setStart(startContainer, startOffset);
	expanded.setEnd(endContainer, endOffset);
	return expanded;
}

/** Убирает пробелы по краям выделения (например, после двойного клика по слову). */
export function trimSelectionWhitespace(editable: HTMLElement) {
	const selection = innerSelection(editable);
	if (!selection || selection.isCollapsed) return;

	// внутри редактора должно быть не только начало выделения, но и его конец
	const range = selection.getRangeAt(0);
	if (!editable.contains(range.startContainer) || !editable.contains(range.endContainer)) return;

	const { startContainer, endContainer } = range;
	let startOffset = range.startOffset;
	let endOffset = range.endOffset;

	if (startContainer.nodeType === Node.TEXT_NODE) {
		const text = startContainer.textContent ?? "";
		while (startOffset < text.length && /\s/.test(text[startOffset])) startOffset++;
	}
	if (endContainer.nodeType === Node.TEXT_NODE) {
		const text = endContainer.textContent ?? "";
		while (endOffset > 0 && /\s/.test(text[endOffset - 1])) endOffset--;
	}

	if (startContainer === endContainer && startOffset >= endOffset) return;
	if (startOffset === range.startOffset && endOffset === range.endOffset) return;

	const trimmed = document.createRange();
	trimmed.setStart(startContainer, startOffset);
	trimmed.setEnd(endContainer, endOffset);
	selection.removeAllRanges();
	selection.addRange(trimmed);
}
