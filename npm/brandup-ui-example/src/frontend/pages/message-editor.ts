import { Page } from "./base";
import html from "./message-editor.html";
import "./message-editor.less";
import { MessageEditor } from "@brandup/ui-message-editor";

export default class NavigationPage extends Page {
    get typeName(): string { return "MessageEditorModel" }
    get header(): string { return "MessageEditor" }

    protected async onRenderContent(container: HTMLElement) {
        container.insertAdjacentHTML("beforeend", html);

        const elements = container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
            'input[data-content-script="message-editor"], textarea[data-content-script="message-editor"]'
        );

        elements.forEach(element => {
            new MessageEditor(element);
        });
    }
}