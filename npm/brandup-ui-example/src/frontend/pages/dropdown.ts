import { Page } from "./base";
import html from "./dropdown.html";
import "./dropdown.less";
import DropDown from '@brandup/ui-dropdown';

export default class DropDownPage extends Page {
    get typeName(): string { return "DropDownPage" }
    get header(): string { return "DropDown" }

    protected async onRenderContent(container: HTMLElement) {
        container.insertAdjacentHTML("beforeend", html);

        const elements = container.querySelectorAll<HTMLSelectElement>(
            'select[data-content-script="dropdown"]'
        );

        elements.forEach(element => {
            new DropDown(element);
        });
    }
}