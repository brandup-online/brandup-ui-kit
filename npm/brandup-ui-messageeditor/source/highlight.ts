// Подсветка доменной разметки прямо в тексте: спинтакс `[раз|два]` и переменные `{ИМЯ}`.
// Обёртки — обычные <span>, редактор их не знает и при сериализации отбрасывает, оставляя
// текст, поэтому в значение подсветка не попадает.

import { textTag } from "@brandup/ui-kit";
import { SPINTAX_OPEN, SPINTAX_SEPARATOR } from "./randomizer";
import { buildVariable, isVariableKey, parseVariable, plainVariableKey, VARIABLE_OPEN } from "./variables";

export const SPINTAX_CLASS = "spintax";
export const VARIABLE_CLASS = "variable";
/** Ключ переменной внутри обёртки: на экране его подменяет название, но в тексте он остаётся. */
export const KEY_CLASS = "key";
/** Символ самой конструкции — скобка или разделитель вариантов: оформляется отдельно от содержимого. */
export const MARK_CLASS = "mark";
/** Пустая обёртка подписи: название выводится её оформлением, а не текстом (см. buildMarkup). */
export const LABEL_CLASS = "label";
/** Переменная с ключом, которого нет в объявленном списке, — в строгом режиме это ошибка. */
export const UNKNOWN_CLASS = "unknown";
/** То же в режиме новых переменных: не ошибка, а ещё не заведённая переменная. */
export const NEW_CLASS = "new";

/** Подсказка на неизвестной переменной: почему она выделена не так, как остальные. */
export const UNKNOWN_TITLE = "Переменная не объявлена — при отправке не подставится.";

/** Подсказка на новой переменной: почему она выделена не так, как объявленные. */
export const NEW_TITLE = "Новая переменная — её ещё нет в списке.";

/**
 * Объявленные переменные: ключ → название (`null` — названия нет, показывается ключ).
 *
 * Он же набор известных ключей: чего в нём нет, то в тексте помечается неизвестным. Один
 * источник на обе задачи — отдельный список ключей разъезжался бы с названиями.
 */
export type VariableNames = ReadonlyMap<string, string | null>;

export interface HighlightOptions {
	/** Объявленные переменные; без них показывается ключ и ничего не проверяется. */
	names?: VariableNames;
	/** Подсвечивать ли переменные (по умолчанию да): выключенная персонализация их не выделяет. */
	variables?: boolean;
	/**
	 * Режим новых переменных: необъявленный ключ — не ошибка, а заявка на переменную, которую
	 * заведёт хост. Помечается своим классом ({@link NEW_CLASS}), а не как чужая.
	 */
	newVariables?: boolean;
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

/**
 * Конструкция, которую стирает нажатие Backspace или Delete: та, к которой каретка прижата
 * с нужной стороны, либо та, внутри которой она стоит.
 *
 * Прижата — значит между кареткой и конструкцией нет набранного текста: опоры каретки
 * (см. {@link CARET_ANCHOR}) не в счёт, их никто не набирал, и отдельного нажатия они не стоят.
 * Иначе стереть конструкцию в конце строки было бы нечем: нажатие уходило бы на опору, а её тут
 * же возвращала бы подсветка — клавиша выглядела бы сломанной.
 *
 * @param back Backspace — смотрим перед кареткой; иначе Delete — за ней.
 */
export function markupBeside(root: HTMLElement, selection: Selection, back: boolean): HTMLElement | null {
	if (!selection.isCollapsed) return null;

	const node = selection.anchorNode;
	if (!node || !root.contains(node)) return null;

	// каретка внутри конструкции: стирается она целиком — по частям её не правят
	const inside = markupAt(node);
	if (inside) return inside;

	let neighbour: Node | null;

	if (node.nodeType === Node.TEXT_NODE) {
		const data = (node as Text).data;
		// между кареткой и соседом есть набранное — его и стирает браузер, как обычно
		if (!isAnchorText(back ? data.slice(0, selection.anchorOffset) : data.slice(selection.anchorOffset)))
			return null;

		neighbour = back ? node.previousSibling : node.nextSibling;
	} else {
		// каретка в самом элементе: сосед — его ребёнок по смещению каретки
		neighbour = node.childNodes[back ? selection.anchorOffset - 1 : selection.anchorOffset] ?? null;
	}

	// опоры проскакиваем: за конструкцией, которой кончается строка, стоит как раз одна из них
	while (neighbour?.nodeType === Node.TEXT_NODE && isAnchorText((neighbour as Text).data))
		neighbour = back ? neighbour.previousSibling : neighbour.nextSibling;

	if (neighbour?.nodeType !== Node.ELEMENT_NODE) return null;

	const elem = neighbour as HTMLElement;

	return elem.matches(MARKUP_SELECTOR) ? elem : null;
}

/**
 * Опора каретки, стоящая сразу за конструкцией: вместе с конструкцией уходит и она — держать
 * место больше не за чем, а каретке она давала бы лишнюю позицию (см. {@link CARET_ANCHOR}).
 *
 * Только собственный узел опоры: дописанный за конструкцией текст попадает в тот же узел,
 * и опора в нём — лишь один символ, который сообщению не мешает и так (его снимает хост).
 */
export function anchorAfter(span: HTMLElement): Text | null {
	const next = span.nextSibling;
	if (next?.nodeType !== Node.TEXT_NODE) return null;

	const text = next as Text;

	return text.data && isAnchorText(text.data) ? text : null;
}

// Спинтакс — только с разделителем: `[текст]` без `|` вариантов не содержит.
// Ни одна из конструкций не пересекает строку и не вкладывается друг в друга.
const SPINTAX_PATTERN = /\[[^[\]\n]*\|[^[\]\n]*\]/;
// Переменная — только то, что и правда может ею быть: буква, цифра или подчёркивание по краям
// ключа (см. isVariableKey в ./variables), между ними что угодно в пределах строки. Иначе `{ }`
// и `{...}` становились бы конструкцией — неделимой, кликабельной и просящейся в список,
// хотя завести такую переменную нельзя.
const VARIABLE_PATTERN = /\{[\p{L}\p{N}_](?:[^{}\n]*[\p{L}\p{N}_])?\}/u;

// Выключенная персонализация не подсвечивает переменные вовсе: подсвеченная конструкция неделима,
// и без своего окна её нельзя было бы ни поправить, ни разобрать по частям.
// Флаг u — ради `\p{L}` и `\p{N}` в переменной; спинтаксу он безразличен, но выражение общее.
const WITH_VARIABLES = new RegExp(`${SPINTAX_PATTERN.source}|${VARIABLE_PATTERN.source}`, "gu");
const SPINTAX_ONLY = new RegExp(SPINTAX_PATTERN.source, "gu");

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
	if (!mayHaveMarkup(root, options)) return false;

	// Разметка уже на месте — а перестройка не бесплатна: она пересобирает обёртки всего текста
	// и заставляет вызывающего возвращать каретку по смещениям. Печать рядом с конструкцией даёт
	// это на каждый символ, и каждый раз каретка проходила бы через восстановление зря.
	if (isHighlighted(root, pattern)) {
		anchorMarkup(root);
		return false;
	}

	unwrap(root);
	wrap(root, pattern, options);
	anchorMarkup(root);

	return true;
}

/**
 * Может ли подсветке найтись работа: в тексте есть похожее на конструкцию либо остались
 * прежние обёртки. Дешёвая верхняя оценка для раннего выхода — по `textContent`, который
 * склеивает строки, поэтому она бывает ложно-положительной (`{` в конце одной строки и `}`
 * в начале следующей); точен уже {@link isHighlighted}, он строки различает. Вынесена наружу,
 * чтобы хост мог выйти ещё до снятия снимка каретки — оно тоже не бесплатно.
 */
export function mayHaveMarkup(root: HTMLElement, options: HighlightOptions = {}): boolean {
	const pattern = options.variables === false ? SPINTAX_ONLY : WITH_VARIABLES;

	pattern.lastIndex = 0;
	const found = pattern.test(root.textContent ?? "");
	pattern.lastIndex = 0;

	return found || !!root.querySelector(MARKUP_SELECTOR);
}

/**
 * Символ нулевой ширины, которым конструкция заканчивает строку. В значение не идёт — его
 * снимает хост, читая значение (см. `MessageEditor`).
 */
export const CARET_ANCHOR = "​";

// Текст из одних опор каретки (пустой — тоже): набранного тут нет, и для правки его как бы нет.
const ANCHORS_ONLY = new RegExp(`^${CARET_ANCHOR}*$`);
const ANCHORS = new RegExp(CARET_ANCHOR, "g");

function isAnchorText(text: string): boolean {
	return ANCHORS_ONLY.test(text);
}

/** Снимает опоры каретки: в поле они нужны, в сообщении — нет (их там никто не набирал). */
export function withoutAnchors(value: string): string {
	return value.replace(ANCHORS, "");
}

/**
 * Ставит опору за конструкцией, которой нечем закончиться.
 *
 * Конструкция не редактируется, и каретку сразу за ней браузер рисует, только если там есть
 * текст. Иначе стоять после неё каретке негде: она уезжает в начало строки, и дописать за
 * вставленной переменной становится нечем — а вставляют её как раз в пустое поле.
 *
 * Опору не видно, и на разбор она не влияет: конструкции она не касается, под их выражения
 * не подпадает и в значение не попадает. Ставится один раз — дальше за конструкцией уже есть
 * текстовый узел, и повторный проход её не удваивает.
 */
function anchorMarkup(root: HTMLElement) {
	for (const span of Array.from(root.querySelectorAll<HTMLElement>(MARKUP_SELECTOR)))
		if (!span.nextSibling) span.after(document.createTextNode(CARET_ANCHOR));
}

// Элементы, разрывающие строку на экране: <br> и блоки. Конструкция строку не пересекает,
// поэтому текст по обе стороны разрыва склеивать нельзя — склейка давала бы ложное совпадение
// на каждый ввод, а с ним и вечную пересборку. Инлайновая разметка (жирный и т.п.) строку
// не рвёт, её узлы остаются в общей строке.
const LINE_BREAK_TAGS = new Set(["BR", "P", "DIV", "BLOCKQUOTE", "PRE", "LI", "UL", "OL"]);

/**
 * Соответствует ли текущая разметка тексту: каждая обёртка содержит ровно одну конструкцию,
 * а вне обёрток конструкция целиком не собирается.
 *
 * Текст собирается в одну строку — включая идущие подряд текстовые узлы (конструкция могла
 * разорваться между ними: правка вставляет узлы) и текст самих обёрток. Разрывы строк входят
 * переносами: выражения конструкций перенос не пропускают, и склеенное через него не совпадёт.
 *
 * Границы обёрток запоминаются: совпадение, точно совпавшее с обёрткой, уже подсвечено, а любое
 * другое — повод пересобрать разметку. Другим бывает и совпадение шире обёртки — конструкция,
 * дописанная вокруг готовой (`{A` перед подсвеченным `[x|y]` и `}` после): пересборка склеит её
 * в одну, ровно как свежий разбор того же значения.
 */
function isHighlighted(root: HTMLElement, pattern: RegExp): boolean {
	for (const span of Array.from(root.querySelectorAll<HTMLElement>(MARKUP_SELECTOR))) {
		const text = span.textContent ?? "";
		pattern.lastIndex = 0;
		const match = pattern.exec(text);
		pattern.lastIndex = 0;

		if (!match || match[0] !== text) return false;
	}

	const { run, wrapped } = collectRun(root);

	pattern.lastIndex = 0; // общий g-объект: matchAll стартует с его lastIndex

	for (const match of run.matchAll(pattern)) {
		const start = match.index;
		const end = start + match[0].length;

		if (!wrapped.some(([from, to]) => from === start && to === end)) return false;
	}

	return true;
}

/**
 * Текст содержимого одной строкой — так, как его видят выражения конструкций: идущие подряд
 * текстовые узлы склеены, текст обёрток входит целиком, а разрывы строк — переносами
 * (конструкция строку не пересекает, и склейка через разрыв давала бы ложное совпадение).
 *
 * Вместе с текстом отдаются границы обёрток в нём: они нужны проверке соответствия разметки
 * ({@link isHighlighted}), а собирать их отдельным обходом значило бы пройти дерево дважды.
 */
function collectRun(root: HTMLElement): { run: string; wrapped: Array<[number, number]> } {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
	let run = "";
	const wrapped: Array<[number, number]> = [];

	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		if (node.nodeType === Node.ELEMENT_NODE) {
			const elem = node as HTMLElement;

			if (elem.matches(MARKUP_SELECTOR)) {
				const text = elem.textContent ?? "";
				wrapped.push([run.length, run.length + text.length]);
				run += text;
			} else if (LINE_BREAK_TAGS.has(elem.tagName)) run += "\n";

			continue;
		}

		// текст обёртки уже добавлен целиком, когда обход прошёл её саму
		if (markupAt(node)) continue;

		run += (node as Text).data;
	}

	return { run, wrapped };
}

/** Сколько символов отводится переменной при подсчёте длины, пока хост не задал своего. */
export const DEFAULT_VARIABLE_LENGTH = 30;

// Из настроек подсветки длине нужна одна: объявленные переменные на счёт не влияют — считается
// подставляемое значение, а не название. Приняв их, счёт обещал бы поправку, которой не делает.
export interface LengthOptions extends Pick<HighlightOptions, "variables"> {
	/**
	 * Сколько символов считать вместо переменной: подставленное значение длиннее ключа,
	 * и точной длины у сообщения с переменными нет — только оценка.
	 * По умолчанию — {@link DEFAULT_VARIABLE_LENGTH}.
	 */
	variableLength?: number;
}

/**
 * Длина сообщения с поправкой на конструкции: спинтакс считается самым длинным вариантом
 * (в отправку уйдёт один из них, и лимит обязан выдержать любой), переменная — условной длиной
 * подставляемого значения. Вложенных конструкций нет (см. {@link writtenVariables}): переменная
 * внутри варианта спинтакса — часть его текста и считается по буквам.
 *
 * Длина оценивается по видимому тексту, как в textbox: в сериализованном значении маркеры
 * форматирования, и они получателю не показываются. Обрезана по краям — ровно как значение,
 * которое уходит хосту (`getValue()` контрола возвращает его обрезанным).
 *
 * С выключенной подсветкой переменных (`variables: false`) `{ИМЯ}` — обычный текст,
 * и считается он по буквам, ровно как показывается.
 */
export function messageLength(root: HTMLElement, options: LengthOptions = {}): number {
	const pattern = options.variables === false ? SPINTAX_ONLY : WITH_VARIABLES;
	const variableLength = options.variableLength ?? DEFAULT_VARIABLE_LENGTH;

	// опоры каретки — служебные символы поля: в сообщение они не уходят и в длину не входят
	const text = withoutAnchors(collectRun(root).run).trim();

	let length = text.length;

	pattern.lastIndex = 0; // общий g-объект: matchAll стартует с его lastIndex

	for (const match of text.matchAll(pattern)) {
		const construct = match[0];
		const key = variableKey(construct);
		const counted =
			key === null
				? Math.max(
						...construct
							.slice(1, -1)
							.split(SPINTAX_SEPARATOR)
							.map((variant) => variant.length)
					)
				: variableLength;

		length += counted - construct.length;
	}

	return length;
}

/**
 * Ключ переменной по тексту найденной конструкции; null — это спинтакс, а не переменная.
 *
 * Общее выражение находит обе конструкции, и различать их приходится каждому, кто по нему идёт.
 * Пусть различают одинаково: разойдись подсветка с проверкой — поле помечало бы одно, а сообщало
 * другое.
 */
function variableKey(text: string): string | null {
	return text.startsWith(SPINTAX_OPEN) ? null : parseVariable(text);
}

/**
 * Написанные в тексте переменные: что стоит в скобках и где сама конструкция. Спинтакс
 * не выдаётся — переменных внутри него нет: он матчится целиком, и скобки внутри него часть
 * его текста, а не отдельная конструкция.
 *
 * Общий обход на всех, кто разбирает написанное: проверка объявленных и подмена названий
 * обязаны видеть в тексте ровно то же, что и подсветка, — иначе поле правит не то, что помечает.
 */
function* writtenVariables(text: string): Generator<{ written: string; start: number; end: number }> {
	// Общий g-объект: matchAll стартует с его lastIndex (сам его не двигает, поэтому хватает
	// одного сброса на текст). Сбрасываем на случай, если позицию оставил сдвинутой чужой вызов.
	WITH_VARIABLES.lastIndex = 0;

	for (const match of text.matchAll(WITH_VARIABLES)) {
		const written = variableKey(match[0]);
		if (written === null) continue;

		yield { written, start: match.index, end: match.index + match[0].length };
	}
}

/**
 * Объявленный ключ, совпавший с написанным без оглядки на регистр, или null.
 * Он же ответ на вопрос «объявлена ли такая переменная» — один источник на обе задачи.
 */
function declaredKey(written: string, names?: VariableNames): string | null {
	if (!names?.size) return null;

	return keysByPlain(names).get(plainVariableKey(written)) ?? null;
}

/**
 * Объявлена ли переменная с таким ключом.
 *
 * В строгом режиме пустой список — не повод считать чужими все: он может быть ещё не известен
 * (переменные появляются после выбора аудитории), и тогда проверять не по чему. Помечать
 * в этом случае весь текст значило бы кричать там, где приложение само не знает набора.
 *
 * В режиме новых переменных пустой список ничему не мешает: необъявленный ключ там не ошибка,
 * а заявка, и цена ошибки — другой цвет вместо остановленной отправки. Начинают в этом режиме
 * как раз с пустого списка — переменные заводятся по мере того, как их набирают.
 */
function isUnknown(key: string, names?: VariableNames, newVariables?: boolean): boolean {
	return newVariables ? !declaredKey(key, names) : !!names?.size && !declaredKey(key, names);
}

/**
 * Новая ли переменная: необъявленная — и такая, какой её и правда можно завести.
 *
 * Ключ с символами разметки объявить нельзя вовсе, а пробелы по краям при объявлении срезаются
 * (см. {@link isVariableKey}) — заявка на такой ключ никогда не была бы выполнена, и написанное
 * осталось бы новым навсегда. Помечаем такие по-прежнему чужими: подставить их и правда нечем.
 */
function isNewVariable(key: string, names?: VariableNames, newVariables?: boolean): boolean {
	return !!newVariables && !declaredKey(key, names) && isVariableKey(key);
}

/**
 * Ключи переменных из текста, которых нет среди объявленных, — в порядке появления, без повторов.
 * Пустой список объявленных даёт пустой результат, пока не включён режим новых: см. {@link isUnknown}.
 * В режиме новых отдаются только те ключи, которые можно завести как есть: остальные — не заявка,
 * а ошибка (см. {@link isNewVariable}).
 *
 * Текст берётся из тех же узлов, что и подсветка, и тем же выражением: результат обязан совпадать
 * с тем, что видно в поле. Обойти узлы по отдельности здесь так же важно, как и там — по
 * `textContent` всего элемента `{` в конце одного абзаца склеилась бы с `}` в начале следующего.
 * Готовая обёртка при этом разбирается целиком: её текст разложен по узлам оформления
 * (см. buildMarkup), и по отдельности ни один из них конструкцией не выглядит.
 */
export function unknownVariables(root: HTMLElement, names?: VariableNames, newVariables?: boolean): string[] {
	// Проверка идёт на каждое чтение значения снаружи, а открывающей скобки в тексте обычно нет
	// вовсе — тогда и обходить нечего. Так же дёшево выходит и сама highlight().
	if ((!names?.size && !newVariables) || !(root.textContent ?? "").includes(VARIABLE_OPEN)) return [];

	// Один предикат на весь обход: в строгом режиме нужны все необъявленные, в режиме новых —
	// только те, что помечены новыми, иначе список звал бы завести незаводимое.
	const wanted = (key: string) =>
		newVariables ? isNewVariable(key, names, newVariables) : isUnknown(key, names, newVariables);

	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	const found: string[] = [];
	// Повторы снимаем по сравнимому виду: `{Скидка}` и `{СКИДКА}` — одна переменная, и звать
	// завести её дважды значило бы просить два поля вместо одного. Остаётся написанное первым.
	const seen = new Set<string>();
	let wrapper: HTMLElement | null = null;

	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		const span = markupAt(node);
		// узлы одной обёртки идут подряд: её текст уже разобран на первом из них
		if (span && span === wrapper) continue;

		wrapper = span;

		for (const { written } of writtenVariables(span?.textContent ?? (node as Text).data)) {
			const plain = plainVariableKey(written);
			if (!wanted(written) || seen.has(plain)) continue;

			seen.add(plain);
			found.push(written);
		}
	}

	return found;
}

/**
 * Приводит написанное в скобках к объявленному ключу: `{Имя клиента}` и `{имя}` становятся
 * `{ИМЯ}`. Возвращает true, если текст изменился.
 *
 * И в поле, и в списке переменная показывается названием — набирают её с экрана, тем, что
 * видно. Само по себе название подставить нечем: в сообщение уходит ключ, и получателю такая
 * переменная ушла бы скобками наружу. Поэтому написанное название приводим к ключу сразу,
 * пока пишущий видит, что вышло, — на экране от этого ничего не меняется: там снова название.
 *
 * Ключ набирают руками, поэтому его регистр тоже приводим к объявленному: сверяется он без
 * оглядки на регистр (см. plainVariableKey в ./variables), а уходить в сообщение обязан
 * объявленным — подстановка ищет его буква в букву.
 *
 * Ключ новой переменной приводим к верхнему регистру: объявлять его нечему, но заводить будут
 * ровно то, что набрано, и `{Скидка}` рядом с `{СКИДКА}` развели бы два поля вместо одного.
 *
 * Ключ важнее названия: написанное, совпавшее с объявленным ключом, остаётся как есть — иначе
 * одна переменная превращалась бы в другую. Лишние пробелы в написанном названии не важны:
 * название — человеческий текст, а не код.
 *
 * Текст от подмены меняется, поэтому она идёт до подсветки, а не внутри неё: подсветка обязана
 * текст сохранять — по нему она возвращает каретку. Свою каретку подмена правит сама: правка
 * местная, смещения в соседних узлах остаются верными.
 */
export function mapVariableNames(root: HTMLElement, names?: VariableNames, newVariables?: boolean): boolean {
	// Ни объявленных названий, ни открывающей скобки в тексте — подменять нечего. Проверка идёт
	// на каждый ввод, а скобки в обычном наборе не встречаются вовсе. В режиме новых переменных
	// пустой список работе не мешает: регистр новой переменной правится и без объявленных.
	if ((!names?.size && !newVariables) || !(root.textContent ?? "").includes(VARIABLE_OPEN)) return false;

	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	let mapped = false;

	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		// в готовой обёртке лежит уже ключ — её собрала подсветка
		if (markupAt(node)) continue;

		if (mapNode(node as Text, names, newVariables)) mapped = true;
	}

	return mapped;
}

/** Замена в тексте узла: начало и конец написанного и длина вставшего на его место ключа. */
type Replacement = [start: number, end: number, length: number];

function mapNode(node: Text, names?: VariableNames, newVariables?: boolean): boolean {
	const text = node.data;
	if (!text.includes(VARIABLE_OPEN)) return false;

	const done: Replacement[] = [];
	let mapped = "";
	let last = 0;

	for (const { written, start, end } of writtenVariables(text)) {
		const key = keyFor(written, names, newVariables);
		if (!key) continue;

		const construct = buildVariable(key);

		mapped += text.slice(last, start) + construct;
		last = end;
		done.push([start, end, construct.length]);
	}

	if (!done.length) return false;

	// каретку снимаем до правки: после неё смещения в этом узле уже другие
	const restore = shiftSelection(node, done);
	node.data = mapped + text.slice(last);
	restore?.();

	return true;
}

/**
 * Возвращает выделение в правленый узел по сдвинутым смещениям. Снимок берётся до правки:
 * живые смещения она уже сдвинула. Соседние узлы правка не трогает — концы выделения в них
 * остаются как есть.
 */
function shiftSelection(node: Text, done: Replacement[]): (() => void) | null {
	const selection = node.ownerDocument.defaultView?.getSelection();
	if (!selection?.rangeCount) return null;

	const { anchorNode, anchorOffset, focusNode, focusOffset } = selection;
	if (anchorNode !== node && focusNode !== node) return null;

	const anchor = anchorNode === node ? shiftOffset(done, anchorOffset) : anchorOffset;
	const focus = focusNode === node ? shiftOffset(done, focusOffset) : focusOffset;

	return () => selection.setBaseAndExtent(anchorNode!, anchor, focusNode!, focus);
}

/** Смещение в узле после подмены: сдвиг на разницу длин всего, что переписано до него. */
function shiftOffset(done: Replacement[], offset: number): number {
	let shift = 0;

	for (const [start, end, length] of done) {
		// замены идут по порядку: началась за смещением — дальше только такие же
		if (start >= offset) break;

		// каретка стояла внутри переписанного: ставим её за конструкцией — внутрь неё она
		// всё равно не встанет, конструкция неделима
		if (end > offset) return start + shift + length;

		shift += length - (end - start);
	}

	return offset + shift;
}

/**
 * Ключ, которым надо заменить написанное в скобках, или null, если менять нечего.
 *
 * Три случая по убыванию точности: написан ключ объявленной переменной (пусть и в другом
 * регистре), написано её название, написан ключ новой переменной не в верхнем регистре.
 *
 * Ключ важнее названия — сверяем его первым: иначе написанное, совпавшее с ключом одной
 * переменной и с названием другой, превращалось бы в другую. Новая — последней: объявленное
 * название важнее догадки о новой переменной.
 */
function keyFor(written: string, names?: VariableNames, newVariables?: boolean): string | null {
	const declared = declaredKey(written, names);
	// написанное слово в слово менять не на что: оно и уходит в сообщение
	if (declared) return declared === written ? null : declared;

	const named = names?.size ? keysByName(names).get(plainName(written)) : null;
	if (named) return named;

	if (!isNewVariable(written, names, newVariables)) return null;

	// Ключ новой — верхним регистром: объявить его пока нечем, а заведут ровно то, что набрано.
	const upper = written.toUpperCase();

	return upper === written ? null : upper;
}

// Название сверяем без оглядки на регистр и лишние пробелы: его набирают с экрана по памяти,
// и «имя клиента» — то же самое название, что «Имя клиента».
function plainName(value: string): string {
	return value.replace(/\s+/g, " ").trim().toLowerCase();
}

// Объявленные ключи по сравнимому виду: сверка идёт без оглядки на регистр, а отдать нужно
// объявленный ключ как есть. Считаются один раз на список — как и ключи по названиям.
const KEYS_BY_PLAIN = new WeakMap<VariableNames, ReadonlyMap<string, string>>();

function keysByPlain(names: VariableNames): ReadonlyMap<string, string> {
	const cached = KEYS_BY_PLAIN.get(names);
	if (cached) return cached;

	const keys = new Map<string, string>();

	// Два ключа, различающихся только регистром, — дело хоста: в тексте они неразличимы,
	// и выбирать между ними не по чему. Берём первый объявленный, как и с названиями.
	for (const key of names.keys()) {
		const plain = plainVariableKey(key);
		if (!keys.has(plain)) keys.set(plain, key);
	}

	KEYS_BY_PLAIN.set(names, keys);

	return keys;
}

// Ключи по названиям — обратная сторона объявленного списка. Считаются один раз на список:
// подмена идёт на каждый ввод, а сам список за жизнь поля не меняется.
const KEYS_BY_NAME = new WeakMap<VariableNames, ReadonlyMap<string, string>>();

function keysByName(names: VariableNames): ReadonlyMap<string, string> {
	const cached = KEYS_BY_NAME.get(names);
	if (cached) return cached;

	const keys = new Map<string, string>();

	// Одно название у двух переменных — дело хоста: на экране они неразличимы, и выбирать
	// между ними не по чему. Берём первую объявленную — ту же, что выбрали бы в списке.
	for (const [key, name] of names) {
		const plain = name ? plainName(name) : "";
		if (plain && !keys.has(plain)) keys.set(plain, key);
	}

	KEYS_BY_NAME.set(names, keys);

	return keys;
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

function wrap(root: HTMLElement, pattern: RegExp, options: HighlightOptions) {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	const targets: Text[] = [];

	let node = walker.nextNode() as Text | null;
	while (node) {
		if (pattern.test(node.data)) targets.push(node);
		pattern.lastIndex = 0; // общий g-объект: сбрасываем позицию между узлами
		node = walker.nextNode() as Text | null;
	}

	targets.forEach((target) => wrapNode(target, pattern, options));
}

function wrapNode(node: Text, pattern: RegExp, options: HighlightOptions) {
	const text = node.data;
	const fragment = document.createDocumentFragment();
	let last = 0;

	for (const match of text.matchAll(pattern)) {
		const start = match.index;
		if (start > last) fragment.appendChild(document.createTextNode(text.slice(last, start)));

		fragment.appendChild(buildMarkup(match[0], options));

		last = start + match[0].length;
	}

	if (last < text.length) fragment.appendChild(document.createTextNode(text.slice(last)));

	node.replaceWith(fragment);
}

/**
 * Обёртка конструкции. Текст внутри — всегда сама конструкция: из него собирается значение
 * сообщения, и подсветка его не меняет.
 *
 * Символы самой конструкции — скобки и разделитель вариантов — раскладываются по своим
 * обёрткам: оформляются они не так, как содержимое между ними (см. `.mark` в messageeditor.less).
 * Текст от этого прежний: сериализация вложенные обёртки отбрасывает, оставляя их текст, а
 * нормализация пробелов границ инлайновых узлов не знает.
 *
 * У переменной с названием ключ прячется, а на экран выводится оформлением подпись из атрибута
 * (см. `data-label` там же) — так текст остаётся нетронутым.
 */
function buildMarkup(text: string, options: HighlightOptions = {}): HTMLElement {
	const { names, newVariables } = options;
	const span = document.createElement("span");
	const key = variableKey(text);

	span.className = key === null ? SPINTAX_CLASS : VARIABLE_CLASS;
	// Конструкция атомарна: править её текст в поле нельзя, только через своё окно — иначе
	// разметку легко испортить, стерев одну скобку. Ставим атрибутом, а не свойством:
	// свойство не отражается в разметку, и состояние было бы не видно ни в DOM, ни в тестах.
	span.setAttribute("contenteditable", "false");

	if (key === null) {
		fillSpintax(span, text);
		return span;
	}

	// Ключа нет среди объявленных. В строгом режиме подставить такую переменную будет нечем,
	// и получателю она уйдёт скобками наружу; выглядит она при этом ровно как рабочая, поэтому
	// помечаем — опечатка в ключе иначе замечается уже по отправленному сообщению. В режиме
	// новых переменных это не ошибка, а ещё не заведённая переменная: пометка другая — своим
	// цветом и своей подсказкой, — но она нужна не меньше, ведь заводить её кому-то придётся.
	if (isUnknown(key, names, newVariables)) {
		const isNew = isNewVariable(key, names, newVariables);

		span.classList.add(isNew ? NEW_CLASS : UNKNOWN_CLASS);
		span.setAttribute("title", isNew ? NEW_TITLE : UNKNOWN_TITLE);
		fillVariable(span, text, key);
		return span;
	}

	// Написанное могло отличаться от объявленного регистром: подмена приводит его к объявленному
	// до подсветки, но полагаться на порядок здесь незачем — название берём по объявленному ключу.
	const name = names?.get(declaredKey(key, names) ?? key);
	// ключ спрятан, а знать его иногда нужно — например когда у двух переменных одно название
	if (name) span.setAttribute("title", text);

	fillVariable(span, text, key, name);

	return span;
}

/** Обёртка символа конструкции: скобки и разделитель оформляются отдельно от содержимого. */
function mark(char: string): HTMLElement {
	const span = document.createElement("span");
	span.className = MARK_CLASS;
	span.textContent = char;

	return span;
}

/**
 * Переменная: скобки — своими обёртками, между ними ключ.
 *
 * С названием ключ уезжает в свою обёртку и прячется, а подпись рисуется оформлением пустой:
 * узел с текстом названия попал бы в текст поля, а из него собирается значение сообщения.
 * Название — данные хоста, поэтому идёт атрибутом, а не разметкой (см. textTag).
 */
function fillVariable(span: HTMLElement, text: string, key: string, name?: string | null) {
	span.appendChild(mark(text.slice(0, 1)));

	if (name) {
		span.appendChild(textTag("span", { class: KEY_CLASS }, key));

		const label = document.createElement("span");
		label.className = LABEL_CLASS;
		label.dataset.label = name;
		span.appendChild(label);
	} else span.appendChild(document.createTextNode(key));

	span.appendChild(mark(text.slice(-1)));
}

/** Спинтакс: скобки и разделители — своими обёртками, варианты между ними — обычным текстом. */
function fillSpintax(span: HTMLElement, text: string) {
	span.appendChild(mark(text.slice(0, 1)));

	// Вложенных конструкций внутри спинтакса не бывает (см. SPINTAX_PATTERN), поэтому текст
	// между скобками делится разделителем без остатка. Пустой вариант узла не получает —
	// пустого текстового узла в разметке быть не должно.
	text.slice(1, -1)
		.split(SPINTAX_SEPARATOR)
		.forEach((variant, index) => {
			if (index) span.appendChild(mark(SPINTAX_SEPARATOR));
			if (variant) span.appendChild(document.createTextNode(variant));
		});

	span.appendChild(mark(text.slice(-1)));
}
