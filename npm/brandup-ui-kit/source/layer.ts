/**
 * Стек слоёв поверх страницы: попап, модальное окно, список dropdown.
 *
 * Слои появляются друг над другом — попап внутри модального окна, список внутри попапа, — и всё,
 * что делается «поверх страницы», обязано считаться с тем, что под ним лежит ещё один такой же.
 * Пока каждый слой держал это сам, расходились три вещи:
 *
 *   Escape. Слушателей было по одному на слой, и все они висели на документе: одно нажатие
 *   доходило до каждого, закрывая заодно и то, что лежит ниже. Здесь слушатель один на стек,
 *   и он закрывает только верхний слой.
 *
 *   Придержанная прокрутка. Класс на body ставил и снимал каждый слой сам, поэтому закрытие
 *   верхнего возвращало прокрутку странице, пока нижний ещё открыт. Здесь класс считается по
 *   числу попросивших: снимается по последнему.
 *
 *   Фокус. Слой поверх страницы обязан держать фокус внутри себя и вернуть его туда, откуда его
 *   взяли; каждому слою заводить это отдельно незачем — см. `trapFocus` и `returnFocus`.
 *
 * Стек не рисует и не показывает: слой сам знает, как ему открыться и закрыться, а сюда отдаёт
 * только `close` — им менеджер и пользуется.
 */

/** Элементы, до которых доходит Tab. Видимость не проверяется — см. {@link focusableItems}. */
const FOCUSABLE_SELECTOR = [
	"a[href]",
	"area[href]",
	"button:not([disabled])",
	"input:not([disabled]):not([type=hidden])",
	"select:not([disabled])",
	"textarea:not([disabled])",
	"iframe",
	"[contenteditable=''], [contenteditable='true']",
	"[tabindex]:not([tabindex='-1'])",
].join(",");

export interface LayerOptions {
	/**
	 * Закрыть слой. Зовётся менеджером — по Escape для верхнего слоя и из {@link ILayerManager.closeAll}.
	 * Слой закрывается своим обычным путём и в конце снимает себя со стека ({@link Layer.release}).
	 */
	close: () => void;

	/**
	 * Корень слоя: по нему решается, внутри ли сейчас фокус, и по нему ходит его ловушка.
	 * Без него слой считается пустым — фокус ни удержать, ни вернуть.
	 */
	element?: HTMLElement | null;

	/**
	 * Класс на `body`, пока слой открыт: им придерживают прокрутку страницы. Ставится по первому
	 * слою, который его попросил, и снимается по последнему — вложенные слои не разблокируют
	 * друг друга.
	 *
	 * По соглашению кита такие классы начинаются с `body-`, а не с `ui-`: `body-popup-opened`,
	 * `body-modal-opened`, `body-dropdown-opened`. Префикс отделяет состояние страницы от классов
	 * самих элементов — по имени видно, что класс ищут на `body`, а не на компоненте.
	 */
	bodyClass?: string | null;

	/** Держать фокус внутри {@link element}: Tab не уходит из слоя на страницу под ним. */
	trapFocus?: boolean;

	/**
	 * Куда вернуть фокус после закрытия. По умолчанию — туда, где он был в момент открытия;
	 * `false` — не возвращать вовсе.
	 *
	 * Возврат делается, только если фокус к моменту закрытия остался внутри слоя (или потерялся
	 * на `body`): ушедший в другое место фокус — это выбор пользователя, забирать его нельзя.
	 */
	returnFocus?: HTMLElement | null | false;

	/** Закрывать по Escape (по умолчанию да). */
	closeOnEscape?: boolean;
}

export interface Layer {
	/** Верхний ли слой в стеке — то есть ему ли достанется Escape. */
	readonly isTop: boolean;
	/** Открыт ли слой (снятый со стека — нет). */
	readonly isOpened: boolean;
	/**
	 * Снять слой со стека. Не закрывает его: зовётся из закрытия самого слоя, когда оно уже
	 * случилось. Повторный вызов ничего не делает.
	 */
	release: () => void;
}

interface LayerEntry {
	options: LayerOptions;
	handle: Layer;
	/** Куда возвращать фокус: разрешено в момент постановки, пока прежний активный элемент известен. */
	focusReturn: HTMLElement | null;
	released: boolean;
}

const stack: LayerEntry[] = [];
/** Сколько открытых слоёв просили каждый класс на body. */
const bodyClassCount = new Map<string, number>();

const top = (): LayerEntry | undefined => stack[stack.length - 1];

/**
 * Элементы слоя, до которых доходит Tab.
 *
 * Видимость не проверяется намеренно: единственный надёжный способ — размеры коробки, а их
 * не отдаёт ни jsdom (там всё нулевое), ни ещё не отрисованный слой. Скрытый элемент внутри
 * открытого окна — случай редкий, и худшее, что он даёт, — лишняя остановка Tab.
 */
function focusableItems(root: HTMLElement): HTMLElement[] {
	return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
		(elem) => !elem.hasAttribute("hidden") && elem.getAttribute("aria-hidden") !== "true"
	);
}

/** Верхний слой с ловушкой фокуса: Tab ограничивает он, даже если сверху лежит слой без ловушки. */
function topTrap(): LayerEntry | undefined {
	for (let i = stack.length - 1; i >= 0; i--)
		if (stack[i].options.trapFocus && stack[i].options.element) return stack[i];

	return undefined;
}

function onKeyDown(e: KeyboardEvent) {
	// Слой сам разобрался с клавишей — строка ввода ссылки в панели, поиск в списке: их Escape
	// про своё, а не про закрытие слоя. Проверяем на всё сразу: наш слушатель на документе
	// и приходит последним, после обработчиков внутри слоя.
	if (e.defaultPrevented) return;

	if (e.key === "Escape") {
		const entry = top();
		if (!entry || entry.options.closeOnEscape === false) return;

		// Гасим событие: страница под слоями не должна принять это нажатие на свой счёт
		// (снять выделение, отменить перетаскивание), раз оно ушло на закрытие слоя.
		e.preventDefault();

		closeEntry(entry);

		return;
	}

	if (e.key === "Tab") trapTab(e);
}

/** Не выпустить Tab из слоя: с последнего элемента — на первый, с первого назад — на последний. */
function trapTab(e: KeyboardEvent) {
	const entry = topTrap();
	const root = entry?.options.element;
	if (!root) return;

	const items = focusableItems(root);
	const active = document.activeElement as HTMLElement | null;
	const inside = !!active && root.contains(active);

	if (!items.length) {
		// В слое нечего фокусировать (окно с одним текстом): Tab всё равно не должен уводить
		// на страницу под ним — оставляем фокус на самом слое.
		e.preventDefault();
		focusElement(root);

		return;
	}

	const first = items[0];
	const last = items[items.length - 1];

	if (e.shiftKey) {
		if (!inside || active === first || active === root) {
			e.preventDefault();
			focusElement(last);
		}
	} else if (!inside || active === last) {
		e.preventDefault();
		focusElement(first);
	}
}

/**
 * Поставить фокус, добавив `tabindex` тому, кто сам его не принимает: корень слоя — обычный `div`,
 * а фокус ему достаётся, когда внутри фокусировать нечего.
 */
function focusElement(elem: HTMLElement) {
	if (!elem.hasAttribute("tabindex") && !elem.matches(FOCUSABLE_SELECTOR)) elem.setAttribute("tabindex", "-1");

	elem.focus();
}

function addBodyClass(name: string) {
	const count = bodyClassCount.get(name) ?? 0;
	bodyClassCount.set(name, count + 1);

	if (!count) document.body.classList.add(name);
}

function removeBodyClass(name: string) {
	const count = bodyClassCount.get(name) ?? 0;
	if (count <= 1) {
		bodyClassCount.delete(name);
		document.body.classList.remove(name);
	} else bodyClassCount.set(name, count - 1);
}

function push(options: LayerOptions): Layer {
	const entry: LayerEntry = {
		options,
		focusReturn: null,
		released: false,
		handle: {
			get isTop() {
				return top() === entry;
			},
			get isOpened() {
				return !entry.released;
			},
			release: () => release(entry),
		},
	};

	if (options.returnFocus !== false) {
		const active = document.activeElement as HTMLElement | null;
		// Прежний активный элемент запоминаем сейчас: к закрытию слоя его уже не найти.
		// body в этой роли бесполезен — фокус на нём и так окажется сам.
		entry.focusReturn = options.returnFocus ?? (active && active !== document.body ? active : null);
	}

	if (!stack.length) document.addEventListener("keydown", onKeyDown);

	stack.push(entry);

	if (options.bodyClass) addBodyClass(options.bodyClass);

	// Фокус заводим внутрь только у слоя с ловушкой: попап у кнопки фокус не забирает — его
	// открывают, не отпуская каретку в поле (панель смайликов), и увести её значило бы сбить ввод.
	//
	// Не сразу, а следующей микрозадачей: слой ставят из конструктора, а содержимое в него
	// наполняет наследник уже после — фокусировать в этот момент было бы нечего, кроме рамки.
	// К микрозадаче слой наполнен, и если он успел сам поставить фокус, {@link focusInside}
	// его не тронет.
	if (options.trapFocus && options.element)
		queueMicrotask(() => {
			if (!entry.released && options.element) focusInside(options.element);
		});

	return entry.handle;
}

/** Первый шаг ловушки: фокус переносится в слой, иначе Tab пошёл бы от страницы под ним. */
function focusInside(root: HTMLElement) {
	if (root.contains(document.activeElement)) return;

	const items = focusableItems(root);
	focusElement(items.length ? items[0] : root);
}

function release(entry: LayerEntry) {
	if (entry.released) return;
	entry.released = true;

	const index = stack.indexOf(entry);
	if (index >= 0) stack.splice(index, 1); // не обязательно верхний: слой мог закрыться сам

	if (entry.options.bodyClass) removeBodyClass(entry.options.bodyClass);

	if (!stack.length) document.removeEventListener("keydown", onKeyDown);

	// Уже без себя в стеке: возврат фокуса смотрит на слои, которые остались открытыми.
	restoreFocus(entry);
}

/**
 * Держит ли фокус какой-то из ещё открытых слоёв.
 *
 * Спрашиваем именно про фокус, а не про то, есть ли слой выше: слой выше бывает и без каретки —
 * попап, раскрытый в модальном окне, пока правят поле самого окна. Закрой тогда окно, и возврат,
 * отменённый «потому что сверху кто-то есть», не сделал бы никто: попап при снятии вернул бы
 * фокус в уже удалённое окно (или, как список dropdown, не возвращает его вовсе).
 */
function heldByOpenLayer(active: HTMLElement | null): boolean {
	return !!active && stack.some((other) => other.options.element?.contains(active));
}

/** Возвращает фокус туда, откуда слой открыли. */
function restoreFocus(entry: LayerEntry) {
	const target = entry.focusReturn;
	if (!target?.isConnected) return;

	const active = document.activeElement as HTMLElement | null;

	// Каретка у другого ещё открытого слоя — попапа внутри окна, списка внутри попапа. Забрать
	// её значит выдернуть фокус из того, что никто не закрывал; своё этот слой получит обратно,
	// когда снимется тот. Проверки «наш ли фокус» ниже для этого не хватает: корень верхнего
	// слоя обычно лежит ВНУТРИ корня нижнего, и `contains` считает такой фокус своим.
	if (heldByOpenLayer(active)) return;

	// Фокус мог уйти мимо слоя — пользователь сам ткнул в другое поле, а закрытие пришло следом.
	// Забирать такой фокус нельзя; возвращаем только свой — оставшийся внутри слоя или потерянный
	// на body вместе со снятым слоем.
	const root = entry.options.element;
	const ours = !active || active === document.body || (!!root && root.contains(active));
	if (!ours) return;

	focusElement(target);
}

function closeEntry(entry: LayerEntry) {
	entry.options.close();

	// Слой обязан сняться сам в своём close(); если не снялся — снимаем, иначе стек остался бы
	// с мёртвым слоем наверху и следующий Escape уходил бы в никуда.
	release(entry);
}

function closeTop(): boolean {
	const entry = top();
	if (!entry) return false;

	closeEntry(entry);

	return true;
}

function closeAll(): void {
	// Сверху вниз, и всегда по текущей вершине: закрытие слоя может утянуть за собой соседний.
	while (stack.length) closeTop();
}

export interface ILayerManager {
	push: (options: LayerOptions) => Layer;
	/** Закрыть верхний слой; `false` — закрывать было нечего. */
	closeTop: () => boolean;
	/** Закрыть все слои сверху вниз — например при навигации приложения. */
	closeAll: () => void;
	/** Сколько слоёв открыто. */
	readonly count: number;
}

export const LayerManager: ILayerManager = {
	push,
	closeTop,
	closeAll,
	get count() {
		return stack.length;
	},
};
