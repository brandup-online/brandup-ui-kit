import { UIElement } from "@brandup/ui";
import { AjaxQueue, AjaxResponse } from "@brandup/ui-ajax";
import { DOM } from "@brandup/ui-dom";
import closeIcon from "./svg/cancel.svg";
import "./randomizer.less";

const ignoreKeys = ['[', ']', '|'];

interface TextRandomizerElements {
    ownVariant: HTMLElement;
    otherList: HTMLElement;
    newVariant: HTMLElement;
    candidateList: HTMLElement;
}

class TextRandomizer extends UIElement {
    private api: string;
    private _randomizerQueue = new AjaxQueue();
    private _elements: TextRandomizerElements;
    private _successFunc: (text: string) => void;
    private _cancelFunc: () => void;

    private _firstUpper = false;
    private _formatPrefix: string | null = null;
    private _lastCandidatesText: string | null = null;
    private _isDestroyed = false;
    private _req: XMLHttpRequest | null = null;

    get typeName(): string { return "BrandUp.TextRandomizer" }

    constructor(container: HTMLElement, inputApi: string, text: string | null = null, successFunc: (text: string) => void, cancelFunc: () => void) {
        super();

        this.api = inputApi;
        this._successFunc = successFunc;
        this._cancelFunc = cancelFunc;

        this._elements = this._render(container);
        this._initCommands();
        this._initEditables();

        this.setText(text);
    }

    private _render(container: HTMLElement): TextRandomizerElements {
        let ownVariantElem: HTMLElement;
        let otherListElem: HTMLElement;
        let newVariantElem: HTMLElement;
        let candidateListElem: HTMLElement;

        const rootElem = DOM.tag("div", { class: "text-randomizer" },
            DOM.tag("div", { class: "dialog" }, [
                DOM.tag("div", { class: "dialog-header" }, DOM.tag("span", null, "Конструктор рандомизации текста")),
                DOM.tag("div", { class: "word-own" },
                    ownVariantElem = DOM.tag("div", { class: "editable", contenteditable: true, "data-editor-type": "own", "data-placeholder": "Введите основное слово или фразу" })
                ),
                DOM.tag("div", { class: "word-variants" }, [
                    DOM.tag("div", { class: "variants other" }, [
                        DOM.tag("div", { class: "list-name" }, "Варианты рандомизации:"),
                        otherListElem = DOM.tag("ul", null,
                            DOM.tag("li", { class: "new" }, newVariantElem = DOM.tag("div", { class: "editable", contenteditable: true, "data-editor-type": "variant-new", "data-placeholder": "Новый вариант замены" }))
                        )
                    ]),
                    DOM.tag("div", { class: "variants candidates" }, [
                        DOM.tag("div", { class: "list-name" }, "Подходящие варианты:"),
                        candidateListElem = DOM.tag("ul")
                    ])
                ]),
                DOM.tag("div", { class: "dialog-warning" }, "Максимум можно добавить 10 вариантов рандомизации."),
                DOM.tag("div", { class: "dialog-buttons" }, [
                    DOM.tag("button", { class: "app-button", command: "ok" }, "Вставить"),
                    DOM.tag("button", { class: "app-button secondary", command: "cancel" }, "Отмена")
                ])
            ])
        );

        this.setElement(rootElem);

        container.insertAdjacentElement("afterend", rootElem);
        document.body.classList.add("opened-randomizing-dialog");

        return {
            ownVariant: ownVariantElem,
            otherList: otherListElem,
            newVariant: newVariantElem,
            candidateList: candidateListElem
        };
    }

    private _initCommands() {
        this.registerCommand("choice-candidate", context => {
            const text = context.target.textContent?.trim() || "";
            if (!text)
                return;

            if (this._uiRefreshMaxVariants())
                return;

            context.target.remove();
            this._elements.newVariant.parentElement?.insertAdjacentElement("beforebegin", this._createVariantItem(text));
        });

        this.registerCommand("delete-variant", context => {
            if (context.target.parentElement) {
                const nextElem = context.target.parentElement.nextElementSibling;
                if (nextElem instanceof HTMLElement)
                    this._focusEditor(nextElem);
                context.target.parentElement?.remove();
            }

            this._uiRefreshMaxVariants();
        });

        this.registerCommand("ok", () => {
            this._successFunc(this.getText());
            this.destroy();
        });

        this.registerCommand("cancel", () => {
            this.destroy();
            this._cancelFunc();
        });
    }

    private _initEditables() {
        if (!this.element)
            return;

        this.element.addEventListener("keydown", (e: KeyboardEvent) => {
            const srcElem = e.target as HTMLElement;
            if (!srcElem.classList.contains("editable"))
                return;

            const editorType = srcElem.getAttribute("data-editor-type");

            if (ignoreKeys.indexOf(e.key) >= 0) {
                e.preventDefault();
                return false;
            }

            if (e.key == 'U+000A' || e.key == 'Enter' || e.keyCode == 13) {
                // Нажали Enter

                switch (editorType) {
                    case "own": {
                        let ownText = srcElem.textContent?.trim() || "";
                        if (ownText)
                            this._elements.newVariant.focus();
                        break;
                    }
                    case "variant-new":
                    case "variant": {
                        if (this._uiRefreshMaxVariants()) {
                            e.preventDefault();
                            return false;
                        }

                        let newVariantText = this._correctUpperLower(srcElem.textContent || "");
                        if (newVariantText) {
                            srcElem.parentElement?.insertAdjacentElement("beforebegin", this._createVariantItem(newVariantText));
                            srcElem.innerText = '';

                            this._uiRefreshMaxVariants();
                        }
                        break;
                    }
                }

                e.preventDefault();
                return false;
            }
            else if (e.key == 'Escape' || e.keyCode == 27) {
                switch (editorType) {
                    case "own":
                        this._elements.ownVariant.blur();
                        break;
                    case "variant": {
                        this._placeCaretAtEnd(<HTMLElement>srcElem.parentElement?.nextElementSibling);
                        srcElem.parentElement?.remove();

                        this._uiRefreshMaxVariants();

                        break;
                    }
                    case "variant-new":
                        srcElem.textContent = '';
                        break;
                }
            }
            else if (e.key == 'Backspace' || e.keyCode == 8) {
                switch (editorType) {
                    case "variant": {
                        let text = srcElem.textContent;
                        if (text?.length === 0) {
                            let nextEditor: HTMLElement | null = null;
                            if (srcElem.parentElement?.previousElementSibling)
                                nextEditor = (<HTMLElement>(srcElem.parentElement.previousElementSibling));
                            else if (srcElem.parentElement?.nextElementSibling)
                                nextEditor = (<HTMLElement>(srcElem.parentElement.nextElementSibling));

                            if (nextEditor)
                                this._placeCaretAtEnd(nextEditor);
                            srcElem.parentElement?.remove();

                            this._uiRefreshMaxVariants();

                            e.preventDefault();
                            return false;
                        }
                        break;
                    }
                    case "variant-new":
                        let text = srcElem.textContent;
                        if (!text && srcElem.parentElement?.previousElementSibling) {
                            let nextEditor = (<HTMLElement>(srcElem.parentElement.previousElementSibling));
                            this._placeCaretAtEnd(nextEditor);
                        }
                        break;
                }
            }
            else if (e.keyCode === 38 /* Up key */) {
                switch (editorType) {
                    case "variant":
                    case "variant-new": {
                        if (srcElem.parentElement && this._elements.ownVariant)
                            if (srcElem.parentElement.previousElementSibling)
                                this._placeCaretAtEnd(<HTMLElement>srcElem.parentElement.previousElementSibling);
                            else
                                this._placeCaretAtEnd(this._elements.ownVariant);
                        break;
                    }
                    case "own": {
                        break;
                    }
                }

                e.preventDefault();
                return false;
            }
            else if (e.keyCode === 40 /* Down key */) {
                switch (editorType) {
                    case "variant":
                    case "variant-new": {
                        if (srcElem.parentElement?.nextElementSibling)
                            this._placeCaretAtEnd(<HTMLElement>srcElem.parentElement.nextElementSibling);
                        break;
                    }
                    case "own": {
                        this._placeCaretAtEnd(<HTMLElement>this._elements.otherList.firstElementChild);
                        break;
                    }
                }

                e.preventDefault();
                return false;
            }
        });

        this.element.addEventListener("paste", (e) => {
            e.preventDefault();
            const pastedData = e.clipboardData?.getData('text/plain');
            if (pastedData) {
                const lines = pastedData.split(/\n/);
                const output = lines.map((line) => {
                    return line.trim();
                });
                let insertText = output.join(' ');

                document.execCommand('insertHtml', false, insertText);
            }
        });

        this._elements.ownVariant.addEventListener("blur", () => {
            this._refreshCandidates();
        });

        this._elements.newVariant.addEventListener("blur", () => {
            const editorType = this._elements.newVariant.getAttribute("data-editor-type");
            switch (editorType) {
                case "variant-new":
                    let newVariantText = this._correctUpperLower(this._elements.newVariant.textContent);
                    if (newVariantText) {
                        this._elements.newVariant.parentElement?.insertAdjacentElement("beforebegin", this._createVariantItem(newVariantText));
                        this._elements.newVariant.innerText = '';
                    }
                    break;
            }
        });

        this.element.addEventListener("input", (e: Event) => {
            const srcElem = e.target as HTMLElement;
            if (!srcElem.classList.contains("editable"))
                return;

            const editorType = srcElem.getAttribute("data-editor-type");
            switch (editorType) {
                case "own": {
                    let text = srcElem.textContent?.trim() || "";
                    if (!text.charAt(0)) return;
                    let firstChar = text.charAt(0);
                    const prevValue = this._firstUpper;
                    this._firstUpper = firstChar === firstChar.toUpperCase();

                    if (prevValue !== this._firstUpper) {
                        DOM.queryElements(this._elements.otherList, ".editable[data-editor-type=variant]").forEach((item) => {
                            item.textContent = this._correctUpperLower(item.textContent);
                        });

                        DOM.queryElements(this._elements.candidateList, "li").forEach((item) => {
                            item.textContent = this._correctUpperLower(item.textContent);
                        });
                    }

                    break;
                }
            }
        });
    }

    private _uiRefreshMaxVariants(): boolean {
        const countVariants = DOM.queryElements(this._elements.otherList, "li .editable[data-editor-type=variant]").length;
        if (countVariants >= 10) {
            this.element?.classList.add("max-variants");
            return true;
        }
        else {
            this.element?.classList.remove("max-variants");
            return false;
        }
    }

    private _focusEditor(elem: HTMLElement) {
        if (!elem.classList.contains("editable"))
            elem = DOM.queryElement(elem, ".editable") ?? elem;
        elem.focus();
    }

    setText(text: string | null) {
        if (text)
            text = text.trim();

        if (!text) {
            this._firstUpper = false;
            this._elements.ownVariant.innerText = '';
            this._placeCaretAtEnd(this._elements.ownVariant);
            return;
        }

        if (text.startsWith("*") && text.endsWith("*")) {
            text = text.substring(1, text.length - 1);
            this._formatPrefix = "*";
        }
        else if (text.startsWith("_") && text.endsWith("_")) {
            text = text.substring(1, text.length - 1);
            this._formatPrefix = "_";
        }
        else if (text.startsWith("~") && text.endsWith("~")) {
            text = text.substring(1, text.length - 1);
            this._formatPrefix = "~";
        }
        else if (text.startsWith("```") && text.endsWith("```")) {
            text = text.substring(3, text.length - 3);
            this._formatPrefix = "```";
        }

        if (text.startsWith("[") && text.endsWith("]")) {
            text = text.substring(1, text.length - 1);
            let variants = text.split("|");
            let setOwn = false;
            let countVariants = 0;
            variants.forEach((value) => {
                if (!value)
                    return;

                if (!setOwn) {
                    text = value;
                    setOwn = true;
                    return;
                }

                if (countVariants >= 10)
                    return;

                this._elements.newVariant.parentElement?.insertAdjacentElement("beforebegin", this._createVariantItem(value));
                countVariants++;
            });
        }

        let firstChar = text.charAt(0);
        this._firstUpper = firstChar === firstChar.toUpperCase();

        this._elements.ownVariant.innerText = text;
        this._placeCaretAtEnd(this._elements.ownVariant);

        this._uiRefreshMaxVariants();
        this._refreshCandidates();
    }

    getText(): string {
        const variants: Array<string> = [];
        const variantsLowers: Array<string> = [];
        const ownVariant = this._elements.ownVariant.textContent?.trim();
        if (ownVariant) {
            variants.push(ownVariant);
            variantsLowers.push(ownVariant.toLowerCase());
        }

        DOM.queryElements(this._elements.otherList, "li .editable[data-editor-type=variant]").forEach((item) => {
            let variantText = item.textContent?.trim();
            if (variantText && !variantsLowers.includes(variantText.toLocaleLowerCase())) {
                variants.push(variantText);
                variantsLowers.push(variantText.toLocaleLowerCase());
            }
        });

        const newVariant = this._elements.newVariant.textContent?.trim();
        if (newVariant)
            variants.push(newVariant);

        let output = "";

        if (variants.length > 1)
            output = `[${variants.join("|")}]`;
        else if (variants.length == 1)
            output = variants[0];

        if (this._formatPrefix)
            output = `${this._formatPrefix}${output}${this._formatPrefix}`;

        return output;
    }

    private _placeCaretAtEnd(elem: HTMLElement) {
        if (!elem.classList.contains("editable"))
            elem = DOM.queryElement(elem, ".editable") ?? elem;

        elem.focus();
        if (typeof window.getSelection != "undefined"
            && typeof document.createRange != "undefined") {
            var range = document.createRange();
            range.selectNodeContents(elem);
            range.collapse(false);
            var sel = window.getSelection();
            if (!sel) throw "window selection is undefined";

            sel.removeAllRanges();
            sel.addRange(range);
        } else if (typeof (document.body as any)["createTextRange"] != "undefined") {
            var textRange = (document.body as any)["createTextRange"]();
            textRange.moveToElementText(elem);
            textRange.collapse(false);
            textRange.select();
        }
    }

    private _createVariantItem(text: string | null = null): HTMLElement {
        let editorElem: HTMLElement;
        const itemElem = DOM.tag("li", null, [
            DOM.tag("button", { command: "delete-variant", tabindex: "-1" }, closeIcon),
            editorElem = DOM.tag("div", { class: "editable", contenteditable: true, "data-editor-type": "variant" }, text ? text : "")
        ]);
        editorElem.addEventListener("blur", () => {
            const content = editorElem.textContent?.trim() || "";
            editorElem.textContent = content;
            if (!content) {
                itemElem.remove();
                return;
            }

            editorElem.textContent = this._correctUpperLower(content);
        });
        return itemElem;
    }

    private _correctUpperLower(text: string | null): string {
        if (text === null)
            return "";
        text = text.trim();
        if (!text)
            return text;

        let firstChar = text.substring(0, 1);
        if (this._firstUpper && firstChar !== firstChar.toUpperCase())
            // Нужно сделать заглавной
            return firstChar.toUpperCase() + text.substring(1);
        else if (!this._firstUpper && firstChar !== firstChar.toLowerCase())
            // Нужно сделать не заглавной
            return firstChar.toLowerCase() + text.substring(1);

        return text;
    }

    private _refreshCandidates() {
        let text = this._elements.ownVariant.textContent || "";
        if (text !== null)
            text = text.trim();

        if (text.length <= 3) {
            DOM.empty(this._elements.candidateList);
            this.element?.classList.remove("has-condidates");
            return;
        }

        if (this._lastCandidatesText && this._lastCandidatesText.toLowerCase() === text.toLowerCase())
            return;
        this._lastCandidatesText = text;

        if (this._req) {
            this._req.abort();
            this._req = null;
        }

        let headers: { [key: string]: string } = {};
        //if (this.page.website.validationToken !== null)
        //	headers[this.page.website.antiforgery.headerName] = this.page.website.validationToken;

        this._randomizerQueue.enque({
            method: "POST",
            url: this.api,
            headers: headers,
            query: { words: text },
            success: (response: AjaxResponse<LookupModel>) => {
                if (!this.element)
                    return;

                if (response.status != 200 || !response.data)
                    return;

                DOM.empty(this._elements.candidateList);

                var hasCondidates = false;
                for (let iWord = 0; iWord < response.data.words.length; iWord++) {
                    let word = response.data.words[iWord];

                    for (let iCandidate = 0; iCandidate < word.synonyms.length; iCandidate++) {
                        let candidate = word.synonyms[iCandidate];
                        this._elements.candidateList.insertAdjacentElement("beforeend", DOM.tag("li", { command: "choice-candidate" }, this._correctUpperLower(candidate)));
                        hasCondidates = true;
                    }
                }

                if (hasCondidates)
                    this.element.classList.add("has-condidates");
                else
                    this.element.classList.remove("has-condidates");
            }
        });
    }

    close() {
        if (!this.element)
            return;

        if (this._req) {
            this._req.abort();
            this._req = null;
        }

        this.element.remove();
    }

    destroy() {
        if (this._isDestroyed)
            return;
        this._isDestroyed = true;

        document.body.classList.remove("opened-randomizing-dialog");
        this.close();

        this._randomizerQueue.destroy();
        super.destroy();
    }
}

interface LookupModel {
    words: Array<WordModel>;
}

interface WordModel {
    value: string;
    synonyms: Array<string>;
}

export default TextRandomizer;