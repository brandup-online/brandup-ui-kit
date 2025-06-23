# brandup-ui-textbox

[![Build Status](https://dev.azure.com/brandup/BrandUp%20Core/_apis/build/status%2FBrandUp%2Fbrandup-ui-kit?branchName=master)]()

## Installation

Install NPM package [@brandup/ui-textbox](https://www.npmjs.com/package/@brandup/ui-textbox).

```
npm i @brandup/ui-textbox@latest
```

## TextBox

`Textbox` - это класс компонента для ввода текста, который расширяет возможности стандартных элементов `input` и `textarea`.
Наследуется от `InputControl`.

```html
<input id="name" type="text" />
```

```TypeScript
const inputElem = document.getElementById("name");
const textbox = new Textbox(inputElem);

textbox.on(CHANGE_EVENT, (e: ChangeEventData) => { });
```