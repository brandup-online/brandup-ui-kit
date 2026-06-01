# brandup-ui-input

[![Build Status](https://dev.azure.com/brandup/BrandUp%20Core/_apis/build/status%2FBrandUp%2Fbrandup-ui-kit?branchName=main)](https://dev.azure.com/brandup/BrandUp%20Core/_build/latest?definitionId=81&branchName=main)

## Installation

Install NPM package [@brandup/ui-input](https://www.npmjs.com/package/@brandup/ui-input).

```
npm i @brandup/ui-input@latest
```

## InputControl

`InputControl<InputType>` - это базовый абстрактный класс для элементов пользовательсково ввода в форме. Реализуется 
относительно `HTMLInputElement`, `HTMLTextAreaElement`, `HTMLSelectElement`.

`InputControl` наследует интерфейс `IInputControl`, чтобы можно было абстрагироваться от реализации.