# brandup-ui-message-editor

[![Build Status](https://dev.azure.com/brandup/BrandUp%20Core/_apis/build/status%2FBrandUp%2Fbrandup-ui-kit?branchName=master)]()

## Installation

Install NPM package [@brandup/ui-message-editor](https://www.npmjs.com/package/@brandup/ui-message-editor).

```
npm i @brandup/ui-message-editor@latest
```

## MessageEditor

`MessageEditor` - кастомный редактор текста с поддержкой форматирования, вставки эмодзи и рандомизации.
Наследуется от `InputControl`.

```html
<textarea id="message" data-content-script="message-editor"></textarea>
```

```TypeScript
let inputElem = document.getElementById("message");
new MessageEditor(inputElem);
```
