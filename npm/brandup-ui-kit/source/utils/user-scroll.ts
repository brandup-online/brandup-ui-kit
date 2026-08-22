/**
 * Прокручивал ли пользователь страницу сам с момента её показа.
 *
 * Нужно отложенным действиям, которые двигают вид: автофокус контрола ввода ставится в конце
 * его инициализации, а она бывает и отложенной (ленивый content script, вставка разметки
 * из кода). Если к этому моменту пользователь ушёл смотреть другое место страницы, забирать
 * у него вид и клавиатуру нельзя.
 *
 * Считаем жесты прокрутки, а не событие scroll: scroll поднимает и программная прокрутка,
 * и восстановление позиции браузером при перезагрузке или возврате назад — намерения
 * пользователя в них нет.
 */
let userScrolled = false;

/** Клавиши, которыми прокручивают страницу. */
const SCROLL_KEYS = new Set(["PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown"]);

const setScrolled = () => (userScrolled = true);

/**
 * Попало ли нажатие мимо клиентской области — то есть в саму полосу прокрутки. Нулевые размеры
 * не проверяем: страницы без разметки (и jsdom) иначе считали бы полосой любое нажатие.
 */
function isScrollbarPress(e: MouseEvent): boolean {
	const root = window.document.documentElement;

	return (
		(root.clientWidth > 0 && e.clientX >= root.clientWidth) ||
		(root.clientHeight > 0 && e.clientY >= root.clientHeight)
	);
}

// Слушатели живут всё время работы приложения: признак общий на страницу, снимать его вместе
// с каким-то одним контролом нечего. Пассивные — прокрутку они только замечают, останавливать
// её не собираются.
if (typeof window !== "undefined") {
	// Колесо и свайп — в фазе перехвата: докуда бы событие ни дошло, прокрутка уже случилась.
	window.addEventListener("wheel", setScrolled, { passive: true, capture: true });
	window.addEventListener("touchmove", setScrolled, { passive: true, capture: true });

	// Полосу прокрутки и автопрокрутку средней кнопкой ни колесом, ни свайпом не поймать, а
	// событие scroll поднимает и программная прокрутка. Обе начинаются с нажатия мыши: средняя
	// кнопка — это автопрокрутка, а нажатие мимо клиентской области попадает в полосу.
	window.addEventListener(
		"mousedown",
		(e: MouseEvent) => {
			if (e.button === 1 || isScrollbarPress(e)) setScrolled();
		},
		{ passive: true, capture: true }
	);

	// Клавиатуру, в отличие от остального, слушаем на всплытии: страницу двигает только та
	// клавиша, действие которой никто не отменил. Виджет, которому клавиша своя, — список
	// dropdown, меню, карусель — гасит её сам, и это работа внутри виджета, а не прокрутка.
	window.addEventListener("keydown", (e: KeyboardEvent) => {
		if (e.defaultPrevented || !SCROLL_KEYS.has(e.key)) return;

		// в поле ввода те же клавиши двигают каретку, а не страницу, и отменять их полю незачем
		const target = e.target as HTMLElement | null;
		if (
			target?.isContentEditable ||
			target instanceof HTMLInputElement ||
			target instanceof HTMLTextAreaElement ||
			target instanceof HTMLSelectElement
		)
			return;

		setScrolled();
	});
}

/** Прокручивал ли пользователь страницу сам с момента её показа. */
export const hasUserScrolled = (): boolean => userScrolled;

/**
 * Забыть прокрутку пользователя — показана другая страница. Зовёт {@link UiKitMiddleware}
 * при навигации; первую навигацию она пропускает: это показ той же страницы, с которой
 * приложение стартовало, и прокрутка во время его загрузки остаётся в силе.
 */
export const resetUserScroll = (): void => {
	userScrolled = false;
};
