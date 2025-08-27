import { InputControl } from "@brandup/ui-input";
import { DOM } from "@brandup/ui-dom";
import { detectLanguage, transcriptText } from "./utils/utilities";

import "./dropdown.less"; // стили компонента

import arrowBottomIcon from "./svg/arrow-down.svg";
import checkIcon from "./svg/tick.svg";
import searchIcon from "./svg/search.svg";
import closeIcon from "./svg/cancel.svg";

export const ROOT_CLASS = "ui-dropdown";
export const INPUT_CLASS = "ui-dropdown-input";
export const MINIATURE_CLASS = "ui-dropdown-miniature";
export const CHANGE_EVENT = "dropdown-change";

const TABLET_WIDTH = 1030;
const BODY_EXPANDED = "ui-dropdown-opened";

interface Structure {
	popup: HTMLElement;
	list: HTMLElement;
	text: HTMLElement;
	empty: HTMLElement;
	searchInput: HTMLInputElement;
}

class DropDown extends InputControl<HTMLSelectElement> {
	private __structure?: Structure;
	private __container: HTMLElement;
	private __popupElem: HTMLElement;
	private __listElem: HTMLElement;
	private __textElem: HTMLElement;
	private __emptyElem: HTMLElement;
	private __searchInput: HTMLInputElement;
	private __closePopupFunc: (e: MouseEvent) => void;
	private __invalidTimeout?: number;
	private __hasEmptyValue: boolean = false;

	readonly placeholder: string;
	readonly emptyText: string;
	readonly searchPlaceholder: string;
	readonly searchEmpty: string;
	readonly searchOn: number | boolean = 15;

	get typeName(): string { return "BrandUp.DropDown"; }

	constructor(selectElem: HTMLSelectElement) {
		super(selectElem);

		this.__valueElem.classList.add(INPUT_CLASS);

		this.placeholder = this.__valueElem.getAttribute("data-placeholder") || "Select";
		this.emptyText = this.__valueElem.getAttribute("data-emptytext") || "Empty list";
		this.searchPlaceholder = this.__valueElem.getAttribute("data-search-placeholder") || "Search";
		this.searchEmpty = this.__valueElem.getAttribute("data-search-empty") || "Not found";

		const se = this.__valueElem.getAttribute("data-search-on");
		if (se) {
			switch (se.toLowerCase()) {
				case "true":
					this.searchOn = true;
					break;
				case "false":
					this.searchOn = false;
				default:
					this.searchOn = parseInt(se);
					break;
			}
		}

		// __renderUI
		this.__container = DOM.tag("div", { class: [ROOT_CLASS].concat(Array.from(this.__valueElem.classList)) }, [
			DOM.tag("button", { class: "view", command: "open-popup" }, [this.__textElem = DOM.tag("span", null, this.placeholder ?? ''), arrowBottomIcon]),
			this.__popupElem = DOM.tag("div", { class: "popup", tabindex: 0 }, [
				DOM.tag("div", "content", [
					DOM.tag("div", "header", [
						DOM.tag("span", null, this.placeholder ?? ''),
						DOM.tag("button", { command: "close-popup" }, closeIcon)]
					),
					DOM.tag("div", { class: "search" }, [
						searchIcon,
						this.__searchInput = <HTMLInputElement>DOM.tag("input", { type: "search", maxlength: 50, placeholder: this.searchPlaceholder })
					]),
					this.__listElem = DOM.tag("ul"),
					this.__emptyElem = DOM.tag("div", { class: "empty" }, this.emptyText),
					DOM.tag("button", { class: "cancel", command: "close-popup" }, "Отмена")
				])
			])
		]);

		this.__container.classList.remove(INPUT_CLASS);

		this.setElement(this.__container);

		if (this.__valueElem.nextElementSibling) {
			const nextElem = <HTMLElement>this.__valueElem.nextElementSibling;
			if (nextElem.classList.contains(MINIATURE_CLASS)) nextElem.remove();
		}

		this.__valueElem.insertAdjacentElement("beforebegin", this.__container);
		this.__container.insertAdjacentElement("beforeend", this.__valueElem);

		this.__closePopupFunc = (e: MouseEvent) => {
			const t = <HTMLElement>e.target;
			const dd = t.closest(`.${ROOT_CLASS}`);
			if (!dd || (dd === this.__container && !t.closest("li[data-index]") && t !== this.__searchInput && !t.closest(".search"))) {
				this.__closePopup();
				this.__clearSearch();
			}
		};

		this.__renderItems();
		this.__initLogic();
	}

	// рендер элементов и выбор текущего
	private __renderItems() {
		const optionsCount = this.__valueElem.options.length;
		const selectedIndex = this.__valueElem.selectedIndex;

		if (!optionsCount)
			this.__textElem.innerText = this.placeholder;

		if (!optionsCount) {
			this.element?.classList.add("empty");
			return;
		}

		// определяем можно ли делать поиск по элементам в списке
		let isSearchable = false;
		if (this.searchOn === true || optionsCount >= <number>this.searchOn) {
			this.element?.classList.add("searchable");
			isSearchable = true;
		}

		// вставляем элементы меню в фрагмент, чтобы не нагружать процессор
		const popupItemsFragment = document.createDocumentFragment();

		let elemCount = 0;
		for (let i = 0; i < optionsCount; i++) {
			const optionElem = this.__valueElem.options.item(i);
			if (!optionElem)
				continue;

			const itemText = optionElem.textContent?.trim() || "";
			const itemValue = optionElem.value;

			if (i === 0 && !itemValue) {
				// Если первый элемент, это пустое значение

				this.__hasEmptyValue = true;
				continue;
			}

			let itemElem = DOM.tag("li", { command: "select", dataset: { value: itemValue, index: i.toString() } }, [
				DOM.tag("span", { tabindex: "0" }, itemText),
				checkIcon
			]
			);

			const transcript = (<any>itemElem)['wsdd_transcript'] = transcriptText(itemText);

			const isSelected = selectedIndex === i;
			if (isSelected)
				itemElem.classList.add("selected");

			if (isSearchable) {
				// дублируем быстрый элемент в общем списке, чтобы находить его при поиске

				itemElem = itemElem.cloneNode(true) as HTMLLIElement;
				(<any>itemElem)['wsdd_transcript'] = transcript;
				popupItemsFragment.append(itemElem);
			}

			popupItemsFragment.append(itemElem);

			if (isSelected) {
				this.__container.classList.add("hasvalue");
				this.__textElem.innerText = itemText;
			}

			elemCount++;
		}

		if (this.__hasEmptyValue && !elemCount)
			this.element?.classList.add("empty");

		this.__listElem.append(popupItemsFragment);
	}

	private __initLogic() {
		this.registerCommand("open-popup", () => this.__togglePopup());
		this.registerCommand("close-popup", () => this.__closePopup());

		this.registerCommand("select", context => {
			if (!this.element)
				return;

			const newIndex = context.target.dataset.index;

			this.element.classList.remove("invalid");
			this.__clearSearch();
			this.__closePopup();

			const currentSelect = this.__getSelectedElem();
			if (currentSelect && newIndex === currentSelect.own.dataset.index)
				return; // если выбор остался таким же

			// Удаляем класс selected с предыдущего выбранного элемента
			if (currentSelect) {
				currentSelect.own.classList.remove("selected");
			}

			DOM.removeClass(this.element, '.hasvalue', 'hasvalue');

			if (currentSelect && currentSelect.own.closest(`.${ROOT_CLASS}`))
				this.__textElem.innerText = this.placeholder ?? '';

			// делаем новый выбор
			this.__valueElem.value = context.target.dataset.value || "";

			const newSelected = this.__getElemsByIndex(Number(newIndex));

			if (newSelected) {
				newSelected.own.classList.add("selected");

				const newDropDown = newSelected.own.closest(`.${ROOT_CLASS}`);

				if (newDropDown) {
					this.__textElem.innerText = newSelected.own.innerText.trim();
					newDropDown.classList.add("hasvalue");
					this.__closePopup();
					this.__focusPopup();
				}
			}

			this.__onChange();
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
						if (prevItemElem)
							(<HTMLElement>prevItemElem.firstElementChild).focus();

						e.preventDefault();
					}
					break;
				}
				case "ArrowDown": {
					if (isSpan) {
						// Если есть следующий элемент, то переводим фокус на него
						const nextItemElem = target.parentElement?.nextElementSibling;
						if (nextItemElem)
							(<HTMLElement>nextItemElem.firstElementChild).focus();

						e.preventDefault();
					}
					break;
				}
				case "Escape": {
					e.preventDefault();
					this.__closePopup();
					this.__focusPopup();
					break;
				}
				case "Tab": {
					if (target == this.__popupElem && this.element?.classList.contains("empty")) {
						// если список пустой, то фокус уйдёт от компанента на следующий и нужно закрыть popup
						this.__closePopup();
					}
					else if (target == this.__searchInput && this.__listElem.classList.contains("notfound")) {
						// если не найдено, то фокус уйдёт от компанента на следующий и нужно закрыть popup
						this.__closePopup();
					}
					else if (isSpan && !target.parentElement?.nextElementSibling) {
						// если фокус на последнем элементе списка, то фокус уйдёт от компанента на следующий и нужно закрыть popup
						this.__closePopup();
					}
					break;
				}
				case "Enter": { // так как теперь мы обрабатываем не <a>
					target.click();
					this.__closePopup();
					break;
				}
			}
		});
	}

	private __focusPopup() {
		(<HTMLElement>this.__container.firstElementChild).focus();
	}

	private __onChange() {
		this.trigger(CHANGE_EVENT, {
			dropdown: this,
			index: this.getSelectedIndex(),
			value: this.getValue(),
			title: this.getSelectedTitle()
		});
	}

	private __togglePopup() {
		if (this.element?.classList.contains("disabled"))
			return;

		if (!this.element?.classList.toggle("expanded"))
			return;

		// закрываем все открытые попапы, кроме текущего
		document.querySelectorAll('.ui-dropdown.expanded').forEach((dropdown) => {
			if (dropdown !== this.element) {
				dropdown.classList.remove('expanded');
			}
		});

		this.__popupElem.focus({ preventScroll: true });

		this.__positionPopup();

		document.body.classList.add(BODY_EXPANDED);

		let top = 0;
		const selectedElem = this.__getSelectedElem();
		const itemHeight = selectedElem?.own?.clientHeight || 0;
		const itemTop = selectedElem?.own?.offsetTop || 0;

		top = itemTop - this.__listElem.clientHeight / 2 + itemHeight;

		if (top !== null)
			this.__listElem.scrollTo({ left: 0, top: top, behavior: 'instant' });

		document.body.addEventListener("mouseup", this.__closePopupFunc);
	}

	private __positionPopup() {
		this.__popupElem.classList.remove("top", "right");

		if (document.body.clientWidth <= TABLET_WIDTH)
			return;

		const bodyHeight = document.body.clientHeight;
		const popupRect = this.__popupElem.getBoundingClientRect();

		if (popupRect.y + popupRect.height > bodyHeight) {
			this.__popupElem.classList.add("top");
		}

		if (popupRect.x < 0) {
			this.__popupElem.classList.add("right");
		}
	}

	private __closePopup() {
		document.body.classList.remove(BODY_EXPANDED);
		this.element?.classList.remove("expanded");
		document.body.removeEventListener("mouseup", this.__closePopupFunc);
	}

	private __search(query: string) {
		if (!query) {
			this.__clearSearch();
			return;
		}

		query = query.toLowerCase();

		this.__listElem.classList.add("result");
		const items = DOM.queryElements(this.__listElem, "li span");


		let findedCount = 0;
		items.forEach(it => {
			const item = it.parentElement;
			if (!item)
				return;

			if (it.innerText.toLowerCase().startsWith(query)) {
				item.classList.add("ok");
				findedCount++;
			}
			else
				item.classList.remove("ok");
		});

		if (!findedCount) {
			// если ничего не найдено по оригинальному тексту, то ищем в других раскладках клавиатуры

			const queryLang = detectLanguage(query);

			if (queryLang) {
				for (let i = 0; i < this.__listElem.children.length; i++) {
					const item = this.__listElem.children.item(i);
					if (!item)
						continue;
					const transcript = (<any>item)['wsdd_transcript'];
					if (transcript && transcript[queryLang] && transcript[queryLang].startsWith(query)) {

						item.classList.add("ok");
						findedCount++;
					}
					else
						item.classList.remove("ok");
				}
			}
		}

		if (findedCount > 0) {
			this.__emptyElem.innerText = this.emptyText;
			this.__listElem.classList.remove("notfound");
		}
		else {
			this.__emptyElem.innerText = this.searchEmpty;
			this.__listElem.classList.add("notfound");
		}
	}

	private __clearSearch() {
		if (!this.__listElem.classList.contains("result"))
			return;

		this.__emptyElem.innerText = this.emptyText;
		this.__listElem.classList.remove("result", "notfound");
		DOM.removeClass(this.__listElem, "li.ok", "ok");
		this.__searchInput.value = '';
	}

	private __getElems(selector: string): { own: HTMLElement } | null {
		if (!this.element)
			return null;

		const elems = DOM.queryElements(this.element, selector);
		if (elems.length === 2)
			return { own: elems.item(0) };
		else if (elems.length === 1)
			return { own: elems.item(0) };
		return null;
	}

	private __getElemsByIndex(index: number) {
		return this.__getElems(`[data-index="${index}"]`);
	}

	private __getSelectedElem() {
		return this.__getElems(".selected[data-index]");
	}

	getValue(): string | null {
		return this.__valueElem.value || null;
	}

	getSelectedIndex(): number {
		return this.__valueElem.selectedIndex;
	}

	getSelectedTitle(): string | null {
		const selected = this.__getSelectedElem();
		return (selected && selected.own.firstElementChild?.textContent?.trim()) || null;
	}

	validate(): boolean {
		window.clearTimeout(this.__invalidTimeout);

		let value = this.getValue();
		let isInvalid = !this.__valueElem.validity.valid;

		if (this.required && !value)
			isInvalid = true;

		const clearInvalid = () => this.element?.classList.remove("invalid");

		if (isInvalid) {
			this.element?.classList.add("invalid");
		}
		else
			clearInvalid();

		return !isInvalid;
	}

	destroy(): void {
		this.__closePopup();

		this.element?.insertAdjacentElement("afterend", this.__valueElem);
		this.element?.remove();

		super.destroy();
	}
}

export interface ChangeEventData {
	dropdown: DropDown;
	index: number;
	value: string | null;
	title: string | null;
}

export default DropDown;