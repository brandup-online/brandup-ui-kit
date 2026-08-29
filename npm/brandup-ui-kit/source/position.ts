/**
 * Позиционирование всплывающей поверхности у якоря: попап у кнопки, подсказка у слова, список
 * у поля.
 *
 * До этого модуля координаты писал каждый сам. Потребитель кита — правилом вида
 * `left: calc(100% + 10px)`, и такой попап у правого края экрана просто уезжал за него;
 * а внутри самого набора расчёт написан дважды и по-разному: панель форматирования редактора
 * зажимает себя по краям, но не переворачивается, список дропдауна переворачивается, но себя
 * не зажимает. Здесь то и другое разом и в одном месте.
 *
 * Расчёт отделён от DOM намеренно: {@link computePosition} получает прямоугольники числами
 * и числа возвращает. Так его видно целиком и можно проверить все углы — а углов тут больше,
 * чем кажется: не влезает вниз, не влезает ни вниз ни вверх, шире экрана, якорь за краем.
 * DOM-часть ({@link positionElement}, {@link trackPosition}) остаётся тонкой: измерить,
 * позвать расчёт, записать.
 *
 * Координаты считаются относительно вьюпорта, и элемент ставится `position: fixed`. Иначе
 * пришлось бы искать ближайшего позиционированного родителя и вычитать его смещение, а всякий
 * `overflow: hidden` по дороге обрезал бы попап. Плата — при прокрутке страницы якорь уезжает,
 * а попап остаётся; за это и отвечает {@link trackPosition}.
 */

/** Сторона якоря, к которой прижимается элемент. */
export type Side = "top" | "bottom" | "left" | "right";

/**
 * Выравнивание вдоль стороны: `start` — по левому (верхнему) краю якоря, `end` — по правому
 * (нижнему), `center` — по середине.
 */
export type Align = "start" | "center" | "end";

/** Куда ставить: сторона и, через дефис, выравнивание вдоль неё. */
export type Placement = Side | `${Side}-${Align}`;

/** Прямоугольник во вьюпортных координатах — то же, что отдаёт `getBoundingClientRect`. */
export interface Rect {
	left: number;
	top: number;
	width: number;
	height: number;
}

export interface PositionOptions {
	/** Куда ставить, если места хватает. По умолчанию `bottom-start`. */
	placement?: Placement;
	/** Зазор между якорем и элементом. По умолчанию 4. */
	gap?: number;
	/** Насколько близко к краю экрана позволено подойти. По умолчанию 8. */
	viewportPadding?: number;
	/** Переворачивать на противоположную сторону, когда на своей не помещается. По умолчанию да. */
	flip?: boolean;
	/** Сдвигать вдоль стороны, чтобы не вылезти за край экрана. По умолчанию да. */
	shift?: boolean;
}

export interface PositionResult {
	left: number;
	top: number;
	/** Сторона, на которой элемент оказался: после переворота она не та, что просили. */
	placement: Placement;
}

const OPPOSITE: Record<Side, Side> = { top: "bottom", bottom: "top", left: "right", right: "left" };

const parse = (placement: Placement): [Side, Align] => {
	const [side, align] = placement.split("-") as [Side, Align | undefined];

	return [side, align ?? "center"];
};

/** Ставит элемент у стороны якоря, пока не заботясь о краях экрана. */
function place(anchor: Rect, size: { width: number; height: number }, side: Side, align: Align, gap: number) {
	const alongX = () => {
		if (align === "start") return anchor.left;
		if (align === "end") return anchor.left + anchor.width - size.width;

		return anchor.left + (anchor.width - size.width) / 2;
	};

	const alongY = () => {
		if (align === "start") return anchor.top;
		if (align === "end") return anchor.top + anchor.height - size.height;

		return anchor.top + (anchor.height - size.height) / 2;
	};

	switch (side) {
		case "top":
			return { left: alongX(), top: anchor.top - size.height - gap };
		case "bottom":
			return { left: alongX(), top: anchor.top + anchor.height + gap };
		case "left":
			return { left: anchor.left - size.width - gap, top: alongY() };
		case "right":
			return { left: anchor.left + anchor.width + gap, top: alongY() };
	}
}

/** Помещается ли коробка целиком между краями с отступом. */
const fits = (start: number, length: number, limit: number, padding: number) =>
	start >= padding && start + length <= limit - padding;

/** Прижимает координату к краям; коробку шире доступного места ставит по ближнему краю. */
const clamp = (start: number, length: number, limit: number, padding: number) => {
	const max = limit - padding - length;
	// Верхняя граница может оказаться левее нижней — элемент шире экрана. Тогда `Math.min`
	// сначала уводит его в минус, и `Math.max` возвращает к отступу: видно начало, а не середину.
	return Math.max(padding, Math.min(start, max));
};

/**
 * Считает, где встать элементу.
 *
 * Порядок такой: сперва выбираем сторону — на своей ли остаёмся или переворачиваемся, — и только
 * потом сдвигаем вдоль неё. Наоборот было бы неверно: сдвиг вдоль стороны не влияет на то,
 * помещается ли элемент поперёк, а вот выбранная сторона задаёт, вдоль чего сдвигать.
 */
export function computePosition(
	anchor: Rect,
	size: { width: number; height: number },
	viewport: { width: number; height: number },
	options: PositionOptions = {}
): PositionResult {
	const { gap = 4, viewportPadding: padding = 8, flip = true, shift = true } = options;
	const [wanted, align] = parse(options.placement ?? "bottom-start");

	let side = wanted;

	if (flip) {
		const vertical = wanted === "top" || wanted === "bottom";
		const limit = vertical ? viewport.height : viewport.width;
		const length = vertical ? size.height : size.width;

		const room = (s: Side) => {
			const at = place(anchor, size, s, align, gap);

			return fits(vertical ? at.top : at.left, length, limit, padding);
		};

		// Переворачиваем, только если на своей стороне не помещаемся, а на другой помещаемся:
		// не влезая нигде (низкий экран, длинный список) остаёмся на запрошенной — там элемент
		// хотя бы ожидаем, а прижмёт его к краю уже сдвиг ниже.
		if (!room(wanted) && room(OPPOSITE[wanted])) side = OPPOSITE[wanted];
	}

	const at = place(anchor, size, side, align, gap);
	const placement: Placement = `${side}-${align}`;

	if (!shift) return { left: at.left, top: at.top, placement };

	// Сдвигаем только вдоль стороны: поперёк элемент прижат к якорю зазором, и подвинуть его
	// там значило бы оторвать от кнопки, к которой он относится.
	const vertical = side === "top" || side === "bottom";

	return {
		left: vertical ? clamp(at.left, size.width, viewport.width, padding) : at.left,
		top: vertical ? at.top : clamp(at.top, size.height, viewport.height, padding),
		placement,
	};
}

/** Размеры вьюпорта без полосы прокрутки: `innerWidth` считает и её, и край уходил бы под полосу. */
const viewportOf = (elem: HTMLElement) => {
	const root = elem.ownerDocument.documentElement;

	return { width: root.clientWidth, height: root.clientHeight };
};

/**
 * Ставит элемент у якоря. Возвращает выбранную сторону — по ней рисуют хвостик подсказки
 * и направление появления.
 *
 * Размеры читаются со снятыми координатами: коробка, ужатая прошлым показом у края экрана,
 * померилась бы уже, чем ей нужно, и осталась бы такой навсегда.
 */
export function positionElement(elem: HTMLElement, anchor: HTMLElement, options: PositionOptions = {}): PositionResult {
	elem.style.position = "fixed";
	elem.style.left = "0";
	elem.style.top = "0";
	elem.style.right = "auto";
	elem.style.bottom = "auto";
	elem.style.margin = "0";

	const at = computePosition(
		anchor.getBoundingClientRect(),
		{ width: elem.offsetWidth, height: elem.offsetHeight },
		viewportOf(elem),
		options
	);

	elem.style.left = `${Math.round(at.left)}px`;
	elem.style.top = `${Math.round(at.top)}px`;

	return at;
}

/** Снимает всё, что записал {@link positionElement}: элемент возвращается к своим стилям. */
export function clearPosition(elem: HTMLElement): void {
	for (const name of ["position", "left", "top", "right", "bottom", "margin"]) elem.style.removeProperty(name);
}

export interface TrackOptions extends PositionOptions {
	/**
	 * Позиционировать ли сейчас. Спрашивается на каждом пересчёте, поэтому ответ может меняться
	 * по ходу — окно то шире порога, то уже.
	 *
	 * Нужно тому, у кого на узком экране вид другой: попап кита ниже `@adaptive-tablet-small`
	 * показывается окном по центру, и координаты у кнопки ему тогда не нужны — больше того,
	 * вредны, потому что инлайновый стиль сильнее правила и растащил бы окно обратно к кнопке.
	 */
	enabled?: () => boolean;
}

/**
 * Ставит элемент у якоря и держит его там, пока не позовут возвращённую отписку.
 *
 * Координаты вьюпортные, поэтому прокрутка любого предка уводит якорь из-под элемента —
 * слушаем её в фазе перехвата, чтобы поймать и прокрутку внутреннего контейнера, которая
 * до документа не всплывает.
 */
export function trackPosition(elem: HTMLElement, anchor: HTMLElement, options: TrackOptions = {}): () => void {
	const update = () => {
		// Снимаем написанное раньше: пока элемент не позиционируется, свои координаты должны
		// остаться за ним, а не за прошлым пересчётом.
		if (options.enabled && !options.enabled()) return clearPosition(elem);

		positionElement(elem, anchor, options);
	};

	// Первый раз — сразу: элемент уже показан, и ждать кадра значило бы дать ему мигнуть
	// на прежнем месте.
	update();

	const view = elem.ownerDocument.defaultView;
	if (!view) return () => clearPosition(elem);

	// Дальше — не чаще кадра. Пересчёт пишет элементу стили и тут же читает его размеры,
	// то есть заставляет браузер считать раскладку прямо в обработчике; делать это на каждое
	// событие прокрутки незачем — до отрисовки всё равно доживёт только последнее значение.
	let frame = 0;
	const schedule = () => {
		if (frame) return;

		frame = view.requestAnimationFrame(() => {
			frame = 0;
			update();
		});
	};

	view.addEventListener("scroll", schedule, { passive: true, capture: true });
	view.addEventListener("resize", schedule, { passive: true });

	return () => {
		if (frame) view.cancelAnimationFrame(frame);

		view.removeEventListener("scroll", schedule, { capture: true });
		view.removeEventListener("resize", schedule);
		clearPosition(elem);
	};
}
