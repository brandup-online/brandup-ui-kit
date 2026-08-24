import { InputControl } from "@brandup/ui-input";
import { DOM } from "@brandup/ui";
import { LayerManager, type Layer } from "@brandup/ui-kit";
import { UIKIT } from "@brandup/ui-kit/names";
import { DROPDOWN } from "./names";
import { detectLanguage, transcriptText } from "./utils/utilities";

import "./dropdown.less"; // стили компонента

import arrowBottomIcon from "./svg/arrow-down.svg";
import checkIcon from "./svg/tick.svg";
import searchIcon from "./svg/search.svg";
import closeIcon from "./svg/cancel.svg";

/** Сокращения для самых частых имён — за пределы модуля не выходят. */
const { ELEMENT: ELEM, STATE } = DROPDOWN.CLASS;

/** Кнопка показа ссылается на список через aria-controls, поэтому идентификатор ему нужен свой. */
let listIdSeq = 0;

// Метаданные транслитерации, привязанные к <li>-элементам. WeakMap не мешает GC очищать удалённые li,
// в отличие от прежнего `(elem as any)['wsdd_transcript'] = ...` (грязно и без типов).
const itemTranscripts = new WeakMap<Element, ReturnType<typeof transcriptText>>();

type DropDownEvents = {
	[DROPDOWN.EVENT.CHANGE]: (data: ChangeEventData) => void;
};

class DropDown extends InputControl<HTMLSelectElement, DropDownEvents> {
	/**
	 * Раскрытый список на странице один. Открытие следующего закрывает предыдущий: нажатие, которым
	 * его открыли, до закрывающего слушателя прежнего уже не дойдёт, а оставленный список держал бы
	 * и свой слой в стеке, и придержанную им прокрутку.
	 */
	private static __opened: DropDown | null = null;

	private __container: HTMLElement;
	private __viewElem: HTMLElement;
	private __popupElem: HTMLElement;
	private __listElem: HTMLElement;
	private __textElem: HTMLElement;
	private __emptyElem: HTMLElement;
	private __searchInput: HTMLInputElement;
	private __pressPopupFunc: (e: MouseEvent) => void;
	private __closePopupFunc: (e: MouseEvent) => void;
	private __pressedInPopup = false;
	private __reposAbort?: AbortController;
	private __layer?: Layer;
	private __hasEmptyValue: boolean = false;

	readonly placeholder: string;
	readonly emptyText: string;
	readonly searchPlaceholder: string;
	readonly searchEmpty: string;
	readonly cancelText: string;
	readonly searchOn: number | boolean;

	constructor(selectElem: HTMLSelectElement) {
		const placeholder = selectElem.dataset.placeholder || DROPDOWN.TEXT.PLACEHOLDER;
		const emptyText = selectElem.dataset.emptytext || DROPDOWN.TEXT.EMPTY;
		const searchPlaceholder = selectElem.dataset.searchPlaceholder || DROPDOWN.TEXT.SEARCH;
		const searchEmpty = selectElem.dataset.searchEmpty || DROPDOWN.TEXT.SEARCH_EMPTY;
		const cancelText = selectElem.dataset.cancel || DROPDOWN.TEXT.CANCEL;

		let searchOn: number | boolean = DROPDOWN.VALUE.SEARCH_ON;
		const se = selectElem.dataset.searchOn;
		if (se) {
			switch (se.toLowerCase()) {
				case "true":
					searchOn = true;
					break;
				case "false":
					searchOn = false;
					break;
				default:
					searchOn = parseInt(se);
					break;
			}
		}

		// текст из option/data-* атрибутов вставляем через textContent, чтобы не получить XSS через DOM.tag
		const textElem = DOM.tag("span", null);
		textElem.textContent = placeholder;

		const headerLabel = DOM.tag("span", null);
		headerLabel.textContent = placeholder;

		const emptyElem = DOM.tag("div", { class: ELEM.EMPTY });
		emptyElem.textContent = emptyText;

		const cancelButton = DOM.tag("button", { type: "button", class: ELEM.CANCEL, command: DROPDOWN.COMMAND.CLOSE });
		cancelButton.textContent = cancelText;

		const searchInput = DOM.tag("input", {
			type: "search",
			maxlength: DROPDOWN.VALUE.SEARCH_MAX_LENGTH,
			placeholder: searchPlaceholder,
		});
		// Список объявляется списком выбора: фокус в нём ходит по самим пунктам (см. keydown),
		// поэтому роль option — на них, а не на кнопке показа. Имя списку даёт заголовок контрола.
		const listElem = DOM.tag("ul", {
			class: UIKIT.SCROLLABLE.CLASS,
			role: "listbox",
			"aria-label": placeholder,
			id: `${DROPDOWN.LIST_ID}${++listIdSeq}`,
		});

		const popupElem = DOM.tag("div", { class: ELEM.POPUP, tabindex: 0 }, [
			DOM.tag("div", { class: ELEM.CONTENT }, [
				DOM.tag("div", { class: ELEM.HEADER }, [
					headerLabel,
					DOM.tag(
						"button",
						{ type: "button", title: cancelText, command: DROPDOWN.COMMAND.CLOSE },
						closeIcon
					),
				]),
				DOM.tag("div", { class: ELEM.SEARCH }, [searchIcon, searchInput]),
				listElem,
				emptyElem,
				cancelButton,
			]),
		]);

		// Кнопка показа объявляет, чем она управляет и раскрыт ли список: класс `expanded`
		// на контейнере видят стили, состояние кнопки — озвучка.
		const viewElem = DOM.tag(
			"button",
			{
				type: "button",
				class: ELEM.VIEW,
				command: DROPDOWN.COMMAND.TOGGLE,
				"aria-haspopup": "listbox",
				// ссылается на сам список, а не на коробку попапа: кнопка раскрывает именно его
				"aria-controls": listElem.id,
				"aria-expanded": "false",
			},
			[textElem, arrowBottomIcon]
		);

		const container = DOM.tag("div", { class: DROPDOWN.CLASS.ROOT }, [viewElem, popupElem]);

		DropDown.prepareValueElem(selectElem, container, DROPDOWN.CLASS.INPUT);

		if (selectElem.nextElementSibling) {
			const nextElem = selectElem.nextElementSibling as HTMLElement;
			if (nextElem.classList.contains(DROPDOWN.CLASS.MINIATURE)) nextElem.remove();
		}

		selectElem.insertAdjacentElement("beforebegin", container);
		container.insertAdjacentElement("beforeend", selectElem);

		// класс вернёт базовый класс при destroy — без этого поле осталось бы скрытым
		super("BrandUp.DropDown", container, selectElem, { class: DROPDOWN.CLASS.INPUT });

		this.placeholder = placeholder;
		this.emptyText = emptyText;
		this.searchPlaceholder = searchPlaceholder;
		this.searchEmpty = searchEmpty;
		this.cancelText = cancelText;
		this.searchOn = searchOn;

		this.__container = container;
		this.__viewElem = viewElem;
		this.__popupElem = popupElem;
		this.__listElem = listElem;
		this.__textElem = textElem;
		this.__emptyElem = emptyElem;
		this.__searchInput = searchInput;

		// Список закрывает нажатие мимо него, и решает это начало нажатия, а не место, где
		// отпустили: перетаскивание полосы прокрутки списка и выделение текста заканчиваются
		// где угодно, а список при этом закрываться не должен.
		this.__pressPopupFunc = (e: MouseEvent) => {
			this.__pressedInPopup = this.__popupElem.contains(e.target as Node);
		};

		this.__closePopupFunc = () => {
			const pressedInPopup = this.__pressedInPopup;
			this.__pressedInPopup = false; // жест закончился, следующий начнётся со своего нажатия

			// внутри списка работают с ним самим: прокрутка, поиск, промах мимо пункта
			if (pressedInPopup) return;

			this.__closePopup();
			this.__clearSearch();
		};

		this.__renderItems();
		this.__initLogic();

		this.__applyAutoFocus(); // автофокус — вместе с прокруткой к контролу; условия у базового класса
	}

	/**
	 * Поле-носитель уведено с экрана и фокус не принимает — ведём его в кнопку показа списка:
	 * с неё же начинается работа с клавиатуры (пробел и Enter открывают список).
	 */
	protected override __focusValue(): void {
		this.__focusView();
	}

	// рендер элементов; текущий выбор отмечает __renderSelection, когда список уже в DOM
	private __renderItems() {
		const optionsCount = this.__valueElem.options.length;

		if (!optionsCount) this.__textElem.innerText = this.placeholder;

		if (!optionsCount) {
			this.element.classList.add(STATE.EMPTY);
			return;
		}

		// определяем можно ли делать поиск по элементам в списке
		// явная проверка типа: для false `optionsCount >= false` коэрсится в `>= 0` и всегда true
		const isSearchable =
			this.searchOn === true || (typeof this.searchOn === "number" && optionsCount >= this.searchOn);
		if (isSearchable) this.element.classList.add(STATE.SEARCHABLE);

		// вставляем элементы меню в фрагмент, чтобы не нагружать процессор
		const popupItemsFragment = document.createDocumentFragment();

		// исключаем дубликаты: значение, уже добавленное в список, повторно не рендерим
		const addedValues = new Set<string>();

		let elemCount = 0;
		for (let i = 0; i < optionsCount; i++) {
			const optionElem = this.__valueElem.options.item(i);
			if (!optionElem) continue;

			const itemText = optionElem.textContent?.trim() || "";
			const itemValue = optionElem.value;

			if (i === 0 && !itemValue) {
				// Если первый элемент, это пустое значение

				this.__hasEmptyValue = true;
				continue;
			}

			// такое значение уже есть в списке — пропускаем дубликат
			if (addedValues.has(itemValue)) continue;
			addedValues.add(itemValue);

			const itemSpan = DOM.tag("span", { tabindex: "0", role: "option", "aria-selected": "false" });
			itemSpan.textContent = itemText; // безопасно: textContent не парсит HTML

			// li — только носитель команды и значения: роль option стоит на том, что принимает
			// фокус, а промежуточный элемент между списком и пунктом объявляется пустым.
			const itemElem = DOM.tag(
				"li",
				{
					command: DROPDOWN.COMMAND.SELECT,
					role: "presentation",
					dataset: { value: itemValue, index: i.toString() },
				},
				[itemSpan, checkIcon]
			);

			itemTranscripts.set(itemElem, transcriptText(itemText));

			popupItemsFragment.append(itemElem);

			elemCount++;
		}

		if (this.__hasEmptyValue && !elemCount) this.element.classList.add(STATE.EMPTY);

		this.__listElem.append(popupItemsFragment);

		this.__renderSelection(); // список уже в DOM — отметку и текст ставит общий с setValue путь
	}

	private __initLogic() {
		this.registerCommand(DROPDOWN.COMMAND.TOGGLE, () => this.__togglePopup());
		this.registerCommand(DROPDOWN.COMMAND.CLOSE, () => this.__closePopup());

		this.registerCommand(DROPDOWN.COMMAND.SELECT, (context) => {
			this.__clearSearch();
			this.__closePopup();
			this.__focusView();

			const index = Number(context.target.dataset.index);
			if (!Number.isInteger(index)) return; // пункт без своего индекса выбрать нечем

			this.__applySelection(index);
		});

		this.__searchInput.addEventListener("input", () => {
			const query = this.__searchInput.value;

			this.__search(query);
		});

		this.__popupElem.addEventListener("keydown", (e: KeyboardEvent) => {
			const target = <HTMLElement>e.target;
			const isSpan = target.tagName == "SPAN";

			switch (e.key) {
				case "ArrowUp": {
					if (isSpan) {
						// Если есть предыдущий элемент, то переводим фокус на него
						const prevItemElem = target.parentElement?.previousElementSibling;
						if (prevItemElem) (<HTMLElement>prevItemElem.firstElementChild).focus();

						e.preventDefault();
					}
					break;
				}
				case "ArrowDown": {
					if (isSpan) {
						// Если есть следующий элемент, то переводим фокус на него
						const nextItemElem = target.parentElement?.nextElementSibling;
						if (nextItemElem) (<HTMLElement>nextItemElem.firstElementChild).focus();

						e.preventDefault();
					}
					break;
				}
				case "Tab": {
					if (target == this.__popupElem && this.element.classList.contains(STATE.EMPTY)) {
						// если список пустой, то фокус уйдёт от компанента на следующий и нужно закрыть popup
						this.__closePopup();
					} else if (target == this.__searchInput && this.__listElem.classList.contains(STATE.NOT_FOUND)) {
						// если не найдено, то фокус уйдёт от компанента на следующий и нужно закрыть popup
						this.__closePopup();
					} else if (isSpan && !target.parentElement?.nextElementSibling) {
						// если фокус на последнем элементе списка, то фокус уйдёт от компанента на следующий и нужно закрыть popup
						this.__closePopup();
					}
					break;
				}
				case "Enter": {
					// так как теперь мы обрабатываем не <a>
					e.preventDefault(); // чтобы Enter в поле поиска не сабмитил форму, в которой может находиться dropdown
					if (isSpan) target.click();
					this.__closePopup();
					break;
				}
			}
		});
	}

	/** Фокус в кнопку показа списка: с неё начинается работа с контролом с клавиатуры. */
	private __focusView() {
		this.__viewElem.focus();
	}

	private __onChange() {
		this.trigger(DROPDOWN.EVENT.CHANGE, {
			dropdown: this,
			index: this.getSelectedIndex(),
			value: this.getValue(),
			title: this.getSelectedTitle(),
		});
	}

	/**
	 * Выключенный контрол не работает целиком, а только-для-чтения — показывает значение, но
	 * менять его не даёт: гейт закрывает открытие списка и выбор пункта. Состояние читаем
	 * с поля-носителя, а не по классу-отражению: атрибут могли переключить после инициализации.
	 *
	 * Закрытие списка не запрещаем никогда: гейт в `@brandup/ui` общий на все команды элемента,
	 * а поле могли выключить уже с открытым списком (например, форма гасит поля на время отправки) —
	 * тогда запрет запер бы открытый список, и на узком экране, где это лист во весь экран,
	 * выхода с клавиатуры не осталось бы вовсе.
	 */
	protected override _onCanExecCommand(name: string): boolean {
		if (name.toLowerCase() === DROPDOWN.COMMAND.CLOSE) return true;

		return !this.disabled && !this.readonly;
	}

	private __togglePopup() {
		if (this.element.classList.contains(STATE.EXPANDED)) {
			// уже открыт — закрываем чисто, чтобы и body-класс, и mouseup-листенер ушли
			this.__closePopup();
			return;
		}

		// Прежний список закрываем целиком, а не снятием класса: у него остаются свои слушатели
		// закрытия и свой слой в стеке (см. __opened).
		const opened = DropDown.__opened;
		if (opened && opened !== this) opened.__closePopup();

		this.element.classList.add(STATE.EXPANDED);
		this.__viewElem.setAttribute("aria-expanded", "true");
		DropDown.__opened = this;

		this.__popupElem.focus({ preventScroll: true });

		this.__positionPopup();

		// пока popup открыт, перепозиционируем при изменении окна/скролле страницы
		this.__reposAbort = new AbortController();
		const reposition = () => this.__positionPopup();
		window.addEventListener("resize", reposition, { signal: this.__reposAbort.signal });
		window.addEventListener("scroll", reposition, {
			signal: this.__reposAbort.signal,
			passive: true,
			capture: true,
		});

		// Escape и класс на body — за менеджером слоёв кита: список бывает раскрыт внутри
		// модального окна, и одно нажатие Escape не должно уносить их оба.
		this.__layer = LayerManager.push({
			close: () => {
				// с клавиатуры выход из списка обязан вернуть на кнопку показа: на узком экране
				// список занимает весь экран, и уйти с него больше не на что
				const fromInside = this.__popupElem.contains(document.activeElement);

				this.__closePopup();
				this.__clearSearch();

				if (fromInside) this.__focusView();
			},
			element: this.__popupElem,
			bodyClass: DROPDOWN.CLASS.BODY,
			returnFocus: false, // фокус ведём сами: список открывают, уже стоя на кнопке показа
		});

		const selectedElem = this.__getSelectedElem();
		const itemHeight = selectedElem?.own?.clientHeight || 0;
		const itemTop = selectedElem?.own?.offsetTop || 0;

		const top = itemTop - this.__listElem.clientHeight / 2 + itemHeight;

		this.__listElem.scrollTo({ left: 0, top: top, behavior: "instant" });

		document.body.addEventListener("mousedown", this.__pressPopupFunc);
		document.body.addEventListener("mouseup", this.__closePopupFunc);
	}

	private __positionPopup() {
		this.__popupElem.classList.remove(STATE.TOP, STATE.RIGHT);

		if (document.body.clientWidth <= DROPDOWN.VALUE.TABLET_WIDTH) return;

		const bodyHeight = document.body.clientHeight;
		const popupRect = this.__popupElem.getBoundingClientRect();

		if (popupRect.y + popupRect.height > bodyHeight) {
			this.__popupElem.classList.add(STATE.TOP);
		}

		if (popupRect.x < 0) {
			this.__popupElem.classList.add(STATE.RIGHT);
		}
	}

	private __closePopup() {
		this.__pressedInPopup = false; // от прошлого показа не наследуем
		this.__layer?.release(); // класс на body снимает менеджер — по последнему слою, который его просил
		this.__layer = undefined;
		this.element.classList.remove(STATE.EXPANDED);
		this.__viewElem.setAttribute("aria-expanded", "false"); // кнопка остаётся переключателем и в закрытом виде
		if (DropDown.__opened === this) DropDown.__opened = null;
		document.body.removeEventListener("mousedown", this.__pressPopupFunc);
		document.body.removeEventListener("mouseup", this.__closePopupFunc);
		this.__reposAbort?.abort();
		this.__reposAbort = undefined;
	}

	private __search(query: string) {
		if (!query) {
			this.__clearSearch();
			return;
		}

		query = query.toLowerCase();

		this.__listElem.classList.add(STATE.RESULT);
		const items = DOM.queryElements(this.__listElem, "li span");

		let findedCount = 0;
		items.forEach((it) => {
			const item = it.parentElement;
			if (!item) return;

			// textContent надёжнее: innerText в браузерах может возвращать пусто/неожиданное для скрытых элементов
			if ((it.textContent ?? "").toLowerCase().startsWith(query)) {
				item.classList.add(STATE.MATCH);
				findedCount++;
			} else item.classList.remove(STATE.MATCH);
		});

		if (!findedCount) {
			// если ничего не найдено по оригинальному тексту, то ищем в других раскладках клавиатуры

			const queryLang = detectLanguage(query);

			if (queryLang) {
				for (let i = 0; i < this.__listElem.children.length; i++) {
					const item = this.__listElem.children.item(i);
					if (!item) continue;
					const transcript = itemTranscripts.get(item);
					if (transcript && transcript[queryLang] && transcript[queryLang].startsWith(query)) {
						item.classList.add(STATE.MATCH);
						findedCount++;
					} else item.classList.remove(STATE.MATCH);
				}
			}
		}

		if (findedCount > 0) {
			this.__emptyElem.innerText = this.emptyText;
			this.__listElem.classList.remove(STATE.NOT_FOUND);
		} else {
			this.__emptyElem.innerText = this.searchEmpty;
			this.__listElem.classList.add(STATE.NOT_FOUND);
		}
	}

	private __clearSearch() {
		if (!this.__listElem.classList.contains(STATE.RESULT)) return;

		this.__emptyElem.innerText = this.emptyText;
		this.__listElem.classList.remove(STATE.RESULT, STATE.NOT_FOUND);
		DOM.removeClass(this.__listElem, `li.${STATE.MATCH}`, STATE.MATCH);
		this.__searchInput.value = "";
	}

	private __getElems(selector: string): { own: HTMLElement } | null {
		const elem = DOM.queryElement<HTMLElement>(this.element, selector);
		return elem ? { own: elem } : null;
	}

	private __getElemsByIndex(index: number) {
		return this.__getElems(`[data-index="${index}"]`);
	}

	private __getSelectedElem() {
		return this.__getElems(".hasvalue[data-index]");
	}

	/** Индекс пункта, отмеченного сейчас в списке; -1 — контрол показывает placeholder. */
	private __shownIndex(): number {
		const index = this.__getSelectedElem()?.own.dataset.index;
		return index === undefined ? -1 : Number(index);
	}

	/**
	 * Переносит выбор в поле-носитель и показывает его; событие изменения поднимается только
	 * при действительной смене показанного пункта.
	 *
	 * Работаем индексом, а не значением: значение в списке может повторяться — пустой пункт-подсказка
	 * и свой вариант вроде «Не указано» оба с пустым value, — а присваивание `value` выбрало бы ПЕРВЫЙ
	 * совпавший option, то есть не тот пункт, что нажали.
	 *
	 * С показанным пунктом сравниваем, а не с полем: значение могли записать в поле напрямую
	 * (так делает восстановление черновика формы), и сравнение с полем сделало бы такой вызов пустым.
	 */
	private __applySelection(index: number) {
		// Пункта в списке может и не быть: пустой пункт-подсказка своего <li> не получает, как и
		// дубликат уже добавленного значения. На экране это то же самое, что «не выбрано ничего»,
		// — приводим к одному виду, иначе повторная установка выглядела бы сменой выбора.
		const target = this.__getElemsByIndex(index) ? index : -1;
		if (target === this.__shownIndex()) return; // показанный выбор остался таким же

		this.__valueElem.selectedIndex = index;

		this.element.classList.remove(STATE.INVALID);
		this.__renderSelection();
		this.__onChange();
	}

	/** Отражает текущее значение поля-носителя в контроле: отметка в списке и текст на кнопке. */
	private __renderSelection() {
		// removeClass обходит потомков — класс контейнера снимаем отдельно
		DOM.removeClass(this.element, `.${STATE.HAS_VALUE}`, STATE.HAS_VALUE);
		this.__container.classList.remove(STATE.HAS_VALUE);
		this.__textElem.innerText = this.placeholder;

		// отметка выбора: класс на пункте видят стили, aria-selected на нём же — озвучка
		for (const option of DOM.queryElements(this.__listElem, "li > span"))
			option.setAttribute("aria-selected", "false");

		const selected = this.__getElemsByIndex(this.__valueElem.selectedIndex);
		if (!selected) return; // пустое или неизвестное значение — контрол показывает placeholder

		selected.own.classList.add(STATE.HAS_VALUE);
		selected.own.firstElementChild?.setAttribute("aria-selected", "true");
		this.__container.classList.add(STATE.HAS_VALUE);
		this.__textElem.innerText = (selected.own.firstElementChild?.textContent ?? "").trim();
	}

	getValue(): string | null {
		return this.__valueElem.value || null;
	}

	/**
	 * Программная установка значения — например, восстановление черновика формы. Пишет значение
	 * в поле-носитель и показывает его в контроле; значение без своего пункта в списке даёт
	 * пустой выбор. Событие изменения поднимается, только когда показанный выбор действительно
	 * сменился: сравниваем с UI, а не с полем — вызывающий мог записать значение в поле сам.
	 */
	setValue(value: string | null): void {
		// значение ищем средствами самого поля: оно встанет на первый подходящий option,
		// а дальше выбор переносится и показывается уже по индексу
		this.__valueElem.value = value ?? "";

		this.__applySelection(this.__valueElem.selectedIndex);
	}

	getSelectedIndex(): number {
		return this.__valueElem.selectedIndex;
	}

	getSelectedTitle(): string | null {
		const selected = this.__getSelectedElem();
		return (selected && selected.own.firstElementChild?.textContent?.trim()) || null;
	}

	// Правила проверяет браузер по атрибутам самого select; контрол отражает результат классом.
	// Обязательность закрывает нативный required — для этого у пустого пункта value должно
	// быть пустым, как и требует стандарт.
	override validate(): boolean {
		const isValid = super.validate();

		this.element.classList.toggle(STATE.INVALID, !isValid);

		return isValid;
	}

	override destroy(): void {
		this.__closePopup();

		super.destroy(); // снимет слушатели формы и вернёт поле-носитель в исходный вид
	}
}

export interface ChangeEventData {
	dropdown: DropDown;
	index: number;
	value: string | null;
	title: string | null;
}

export default DropDown;
