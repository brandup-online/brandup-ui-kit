import { Page } from "./base";
import html from "./textbox.html";
import "./textbox.less";
import TextBox from "@brandup/ui-textbox";

export default class TextboxPage extends Page {
    get typeName(): string { return "TextboxPage" }
    get header(): string { return "Textbox" }

    protected async onRenderContent(container: HTMLElement) {
        container.insertAdjacentHTML("beforeend", html);

        const elements = container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
            'input[data-content-script="textbox"], textarea[data-content-script="textbox"]'
        );

        elements.forEach(element => {
            new TextBox(element);
        });
    }
}