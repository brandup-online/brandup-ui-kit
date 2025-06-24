import "./dropdown.less"; // стили компонента

import { InputControl } from "@brandup/ui-input";
import { DOM } from "@brandup/ui-dom";
import arrowBottomIcon from "./svg/arrow-down.svg";
import checkIcon from "./svg/tick.svg";
import searchIcon from "./svg/search.svg";
import closeIcon from "./svg/cancel.svg";
import { detectLanguage, transcriptText } from "./utils/utilities";

export const ROOT_CLASS = "ui-dropdown";
export const INPUT_CLASS = "ui-dropdown-input";
export const MINIATURE_CLASS = "ui-dropdown-miniature";
export const CHANGE_EVENT = "dropdown-change";

const TABLET_WIDTH = 1030;
const BODY_EXPANDED = "ui-dropdown-opened";

interface Structure {
    container: HTMLElement;
    otherItem: HTMLElement;
    popup: HTMLElement;
    otherList: HTMLElement;
    otherText: HTMLElement;
    otherEmpty: HTMLElement;
    searchInput: HTMLInputElement;
}

class DropDown extends InputControl<HTMLSelectElement> {
    private __structure?: Structure;
    private __otherItemElem: HTMLElement;
    private __popupElem: HTMLElement;
    private __otherListElem: HTMLElement;
    private __otherTextElem: HTMLElement;
    private __otherEmptyElem: HTMLElement;
    private __searchInput: HTMLInputElement;
    private __closeOtherFunc: (e: MouseEvent) => void;
    private __invalidTimeout?: number;
    private __hasEmptyValue: boolean = false;

    readonly fastCount: number = 0;
    readonly placeholder: string;
    readonly moreText: string;
    readonly emptyText: string;
    readonly searchPlaceholder: string;
    readonly searchEmpty: string;
    readonly searchOn: number | boolean = 15;

    get typeName(): string { return "BrandUp.DropDown"; }

    constructor(selectElem: HTMLSelectElement) {
        super(selectElem);

        this.__valueElem.classList.add(INPUT_CLASS);

        if (this.__valueElem.hasAttribute("data-fast"))
            this.fastCount = parseInt(this.__valueElem.getAttribute("data-fast") || "0");
        this.placeholder = this.__valueElem.getAttribute("data-placeholder") || "Select";
        this.moreText = this.__valueElem.getAttribute("data-moretext") || "Other";
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
        const container = DOM.tag("div", { class: [ROOT_CLASS].concat(Array.from(this.__valueElem.classList)) }, [
            DOM.tag("ul", null, [
                this.__otherItemElem = DOM.tag("li", { class: "other" }, [
                    DOM.tag("a", { href: "", command: "open-other" }, [this.__otherTextElem = DOM.tag("span", null, [this.moreText.trim()]), arrowBottomIcon]),
                    this.__popupElem = DOM.tag("div", { class: "popup", tabindex: 0 }, [
                        DOM.tag("div", "content", [
                            DOM.tag("div", "header", [
                                DOM.tag("h3", null, this.placeholder),
                                DOM.tag("button", { command: "close-other" }, closeIcon)]
                            ),
                            DOM.tag("div", { class: "search" }, [
                                searchIcon,
                                this.__searchInput = <HTMLInputElement>DOM.tag("input", { type: "search", maxlength: 50, placeholder: this.searchPlaceholder })
                            ]),
                            this.__otherListElem = DOM.tag("ul"),
                            this.__otherEmptyElem = DOM.tag("div", { class: "empty" }, this.emptyText),
                            DOM.tag("button", { class: ["cancel", "app-button", "secondary"], command: "close-other" }, "Отмена")
                        ])
                    ])
                ])
            ])
        ]);

        container.classList.remove(INPUT_CLASS);

        if (this.fastCount > 0)
            container.classList.add("fast");
        else
            container.classList.add("select");

        this.setElement(container);

        if (this.__valueElem.nextElementSibling) {
            // Если следующий элемент это миниатюра пока combobox не отрисован
            const nextElem = <HTMLElement>this.__valueElem.nextElementSibling;
            if (nextElem.classList.contains(MINIATURE_CLASS)) nextElem.remove();
        }

        this.__valueElem.insertAdjacentElement("beforebegin", container);
        container.insertAdjacentElement("beforeend", this.__valueElem);

        this.__closeOtherFunc = (e: MouseEvent) => {
            const t = <HTMLElement>e.target;
            const dd = t.closest(".other");
            if (!dd || dd != this.__otherItemElem || (dd == this.__otherItemElem && (t.closest("li[data-index]") || t.closest("button")))) {
                this.__closeOther();
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
        let fastMax = this.fastCount;

        if (!optionsCount || !this.fastCount)
            this.__otherTextElem.innerText = this.placeholder;

        if (!optionsCount) {
            this.element?.classList.add("empty");
            return;
        }

        // определяем можно ли делать поиск по элементам в списке
        let isSearchable = false;
        if (this.searchOn === true || (optionsCount - fastMax) >= <number>this.searchOn) {
            this.element?.classList.add("searchable");
            isSearchable = true;
        }

        // вставляем элементы меню в фрагмент, чтобы не нагружать процессор
        const otherItemsFragment = document.createDocumentFragment();

        let otherCount = 0;
        //const createFasted = optionsCount > fastMax && isSearchable;
        for (let i = 0; i < optionsCount; i++) {
            const optionElem = this.__valueElem.options.item(i);
            if (!optionElem)
                continue;

            const itemText = optionElem.textContent?.trim() || "";
            const itemValue = optionElem.value;

            if (i === 0 && !itemValue) {
                // Если первый элемент, это пустое значение

                if (fastMax)
                    fastMax++;

                this.__hasEmptyValue = true;

                continue;
            }

            let itemElem = DOM.tag("li", { dataset: { value: itemValue, index: i.toString() } },
                DOM.tag("a", { href: "", command: "select" }, [DOM.tag("span", null, itemText), checkIcon])
            );

            const transcript = (<any>itemElem)['wsdd_transcript'] = transcriptText(itemText);

            const isSelected = selectedIndex === i;
            if (isSelected)
                itemElem.classList.add("has-value");

            if (i < fastMax) {
                this.__otherItemElem.insertAdjacentElement("beforebegin", itemElem);

                if (i == optionsCount - 1)
                    this.element?.classList.add("noother");

                if (isSearchable) {
                    // дублируем быстрый элемент в общем списке, чтобы находить его при поиске
                    itemElem = itemElem.cloneNode(true) as HTMLLIElement;
                    (<any>itemElem)['wsdd_transcript'] = transcript;
                    itemElem.classList.add('fasted')
                    otherItemsFragment.append(itemElem);
                }
            }
            else {
                otherItemsFragment.append(itemElem);

                if (isSelected) {
                    this.__otherItemElem.classList.add("has-value");
                    this.__otherTextElem.innerText = itemText;
                }

                otherCount++;
            }
        }

        if (this.__hasEmptyValue && !otherCount)
            this.element?.classList.add("empty");

        this.__otherListElem.append(otherItemsFragment);
    }

    private __initLogic() {
        this.registerCommand("open-other", () => this.__toggleOther());
        this.registerCommand("close-other", () => this.__closeOther());

        this.registerCommand("select", context => {
            if (!this.element)
                return;

            const newIndex = context.target.parentElement?.dataset.index;

            this.element.classList.remove("invalid");
            this.__clearSearch();
            this.__closeOther();

            const currentSelect = this.__getSelectedElem();
            if (currentSelect && newIndex === currentSelect.own.dataset.index)
                return; // если выбор остался таким же

            DOM.removeClass(this.element, '.has-value', 'has-value');

            if (currentSelect && currentSelect.own.closest(".other")) {
                // если предыдущий выбор ТОЛЬКО в дополнительном списке
                this.__otherTextElem.innerText = this.moreText.trim();
            }

            // делаем новый выбор
            this.__valueElem.value = context.target.parentElement?.dataset.value || "";

            const newSelected = this.__getElemsByIndex(Number(newIndex));
            if (newSelected) {
                newSelected.own.classList.add("has-value");
                newSelected.fasted?.classList.add("has-value");

                const newOther = newSelected.own.closest(".other");

                if (newOther) {
                    // если новый выбор в дополнительном списке

                    this.__otherTextElem.innerText = newSelected.own.innerText.trim();
                    newOther.classList.add("has-value");

                    this.__closeOther();

                    // возвращаем фокус на other
                    this.__focusOther();
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
            const isA = target.tagName == "A";

            switch (e.key) {
                case "ArrowUp":
                    if (isA) {
                        // Если есть предыдущий элемент, то переводим фокус на него
                        const prevItemElem = target.parentElement?.previousElementSibling;
                        if (prevItemElem)
                            (<HTMLElement>prevItemElem.firstElementChild).focus();

                        e.preventDefault();
                    }
                    break;
                case "ArrowDown":
                    if (isA) {
                        // Если есть следующий элемент, то переводим фокус на него
                        const nextItemElem = target.parentElement?.nextElementSibling;
                        if (nextItemElem)
                            (<HTMLElement>nextItemElem.firstElementChild).focus();

                        e.preventDefault();
                    }
                    break;
                case "Escape":
                    e.preventDefault();
                    this.__closeOther();
                    this.__focusOther();
                    break;
                case "Tab":
                    if (target == this.__popupElem && this.element?.classList.contains("empty")) {
                        // если список пустой, то фокус уйдёт от компанента на следующий и нужно закрыть popup
                        this.__closeOther();
                    }
                    else if (target == this.__searchInput && this.__otherListElem.classList.contains("notfound")) {
                        // если не найдено, то фокус уйдёт от компанента на следующий и нужно закрыть popup
                        this.__closeOther();
                    }
                    else if (isA && !target.parentElement?.nextElementSibling) {
                        // если фокус на последнем элементе списка, то фокус уйдёт от компанента на следующий и нужно закрыть popup
                        this.__closeOther();
                    }
                    break;
            }
        });
    }

    private __focusOther() {
        (<HTMLElement>this.__otherItemElem.firstElementChild).focus();
    }

    private __onChange() {
        this.trigger(CHANGE_EVENT, {
            dropdown: this,
            index: this.getSelectedIndex(),
            value: this.getValue(),
            title: this.getSelectedTitle()
        });
    }

    private __toggleOther() {
        if (this.element?.classList.contains("disabled")) // проверка чтобы не открывался select если disabled
            return;

        if (!this.element?.classList.toggle("expanded"))
            return;

        this.__popupElem.focus({ preventScroll: true });

        this.__positionOther();

        document.body.classList.add(BODY_EXPANDED);

        // скролл до выбранного элемента или в начало
        let top = 0;
        const selectedElem = this.__getSelectedElem();
        const itemHeight = selectedElem?.own?.clientHeight || 0;
        const itemTop = selectedElem?.own?.offsetTop || 0;

        top = itemTop - this.__otherListElem.clientHeight / 2 + itemHeight;

        if (top !== null)
            this.__otherListElem.scrollTo({ left: 0, top: top, behavior: 'instant' });

        document.body.addEventListener("mouseup", this.__closeOtherFunc);
    }

    private __positionOther() {
        this.__popupElem.classList.remove("top", "right");

        if (document.body.clientWidth <= TABLET_WIDTH)
            return; // если попап на весь экран, то не нужно определять позицию.

        const bodyHeight = document.body.clientHeight;
        const popupRect = this.__popupElem.getBoundingClientRect();

        if (popupRect.y + popupRect.height > bodyHeight) {
            // если popup заходит за нижнюю границу экрана

            this.__popupElem.classList.add("top");
        }

        if (popupRect.x < 0) {
            // если popup заходит за левую границу экрана

            this.__popupElem.classList.add("right");
        }
    }

    private __closeOther() {
        document.body.classList.remove(BODY_EXPANDED);
        this.element?.classList.remove("expanded");
        document.body.removeEventListener("mouseup", this.__closeOtherFunc);
    }

    private __search(query: string) {
        if (!query) {
            this.__clearSearch();
            return;
        }

        query = query.toLowerCase();

        this.__otherListElem.classList.add("result");
        const items = DOM.queryElements(this.__otherListElem, "a span");

        let findedCount = 0;
        items.forEach(it => {
            const item = it.parentElement?.parentElement;
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
                for (let i = 0; i < this.__otherListElem.children.length; i++) {
                    const item = this.__otherListElem.children.item(i);
                    if (!item)
                        continue;

                    const transcript = (<any>item)['wsdd_transcript'];
                    if (transcript && transcript[queryLang].startsWith(query)) {
                        item.classList.add("ok");
                        findedCount++;
                    }
                    else
                        item.classList.remove("ok");
                }
            }
        }

        if (findedCount > 0) {
            this.__otherEmptyElem.innerText = this.emptyText;
            this.__otherListElem.classList.remove("notfound");
        }
        else {
            this.__otherEmptyElem.innerText = this.searchEmpty;
            this.__otherListElem.classList.add("notfound");
        }
    }

    private __clearSearch() {
        if (!this.__otherListElem.classList.contains("result"))
            return;

        this.__otherEmptyElem.innerText = this.emptyText;
        this.__otherListElem.classList.remove("result", "notfound");
        DOM.removeClass(this.__otherListElem, "li.ok", "ok");
        this.__searchInput.value = '';
    }

    private __getElems(selector: string): { own: HTMLElement, fasted?: HTMLElement } | null {
        if (!this.element)
            return null;

        const elems = DOM.queryElements(this.element, selector);
        if (elems.length === 2)
            return { own: elems.item(0), fasted: elems.item(1) };
        else if (elems.length === 1)
            return { own: elems.item(0) };
        return null;
    }

    private __getElemsByIndex(index: number) {
        return this.__getElems(`[data-index="${index}"]`);
    }

    private __getSelectedElem() {
        return this.__getElems(".has-value[data-index]");
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

            if (this.fastCount > 0)
                this.__invalidTimeout = window.setTimeout(clearInvalid, 200);
        }
        else
            clearInvalid();

        return !isInvalid;
    }

    destroy(): void {
        this.__closeOther();

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