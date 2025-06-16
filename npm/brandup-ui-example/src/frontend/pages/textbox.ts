import { Page } from "./base";
import html from "./textbox.html";
import "./textbox.less";

export default class TextboxPage extends Page {
    get typeName(): string { return "TextboxPage" }
    get header(): string { return "Textbox" }

    protected async onRenderContent(container: HTMLElement) {
        container.insertAdjacentHTML("beforeend", html);
    }
}