import { UIElement } from "@brandup/ui";
import "./input.less";
export class InputUIElement extends UIElement {
    __form;
    __submitEvent;
    __valueElem;
    required;
    disabled;
    readonly;
    constructor(valueElem) {
        super();
        this.__valueElem = valueElem;
        this.__form = valueElem.form;
        this.disabled = this.__valueElem.disabled;
        this.required = this.__valueElem.hasAttribute("required");
        this.readonly = this.__valueElem.hasAttribute("readonly") || this.__valueElem.hasAttribute("data-readonly");
        if (this.__form) {
            this.__submitEvent = (e) => {
                if (e.submitter.formNoValidate || e.target.noValidate)
                    return; // Не делаем валидацию, если она отключена в форме или в инициаторе события submit
                if (this.disabled)
                    return;
                if (!this.validate()) {
                    if (!e.defaultPrevented) {
                        e.stopPropagation();
                        this.focus();
                    }
                    e.preventDefault();
                    return false;
                }
            };
            this.__form.addEventListener("submit", this.__submitEvent);
            this.__valueElem.addEventListener("invalid", (e) => {
                e.preventDefault();
                this.__submitForm();
            });
        }
    }
    __submitForm() {
        if (!this.readonly && !this.disabled && this.__form && this.__form.dispatchEvent(new SubmitEvent("submit", { submitter: this.__form, cancelable: true })))
            this.__form.submit();
    }
    __initState() {
        if (!this.element)
            throw 'Not set element.';
        if (this.required)
            this.element.classList.add("required");
        if (this.readonly)
            this.element.classList.add("readonly");
        if (this.disabled)
            this.element.classList.add("disabled");
    }
    validate() {
        return this.__valueElem.checkValidity();
    }
    focus() {
        this.__valueElem.focus();
    }
    destroy() {
        if (this.__submitEvent)
            this.__form?.removeEventListener("submit", this.__submitEvent);
        super.destroy();
    }
}
//# sourceMappingURL=input.js.map