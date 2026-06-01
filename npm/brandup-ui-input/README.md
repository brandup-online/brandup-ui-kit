# @brandup/ui-input

[![Build Status](https://dev.azure.com/brandup/BrandUp%20Core/_apis/build/status%2FBrandUp%2Fbrandup-ui-kit?branchName=main)](https://dev.azure.com/brandup/BrandUp%20Core/_build/latest?definitionId=81&branchName=main)

Абстрактный базовый класс для компонентов ввода в форме. Обеспечивает единый интерфейс для `HTMLInputElement`, `HTMLTextAreaElement` и `HTMLSelectElement`.

## Установка

```
npm i @brandup/ui-input
```

## InputControl

`InputControl<T, TEvents>` — абстрактный класс, от которого наследуются все компоненты ввода (`TextBox`, `DropDown`). Расширяет `UIElementBound` из `@brandup/ui`.

### Свойства

| Свойство | Тип | Описание |
|---|---|---|
| `form` | `HTMLFormElement \| null` | Форма, к которой привязан элемент |
| `disabled` | `boolean` | Элемент отключён |
| `required` | `boolean` | Элемент обязателен для заполнения |
| `readonly` | `boolean` | Элемент только для чтения (`readonly` или `data-readonly`) |

### Методы

| Метод | Описание |
|---|---|
| `validate(): boolean` | Проверяет значение через нативный `checkValidity()`. Возвращает `true`, если значение валидно |
| `focus(): void` | Устанавливает фокус и прокручивает элемент в видимую область |
| `destroy(): void` | Снимает все обработчики и освобождает ресурсы |

### Поведение

- Добавляет CSS-класс `ui-input` на корневой элемент.
- При инициализации добавляет классы `required`, `readonly`, `disabled` в зависимости от состояния элемента.
- Перехватывает событие `invalid` нативного поля и делегирует валидацию через `validate()`.
- Перехватывает `submit` формы: если элемент невалиден — останавливает отправку и вызывает `focus()`.

### Интерфейс IInputControl

```typescript
import { IInputControl } from "@brandup/ui-input";

interface IInputControl {
    get form(): HTMLFormElement | null;
    get disabled(): boolean;
    get required(): boolean;
    get readonly(): boolean;

    validate(): boolean;
    focus(): void;
    destroy(): void;
}
```

### Создание собственного компонента

```typescript
import { InputControl } from "@brandup/ui-input";

class MyInput extends InputControl<HTMLInputElement> {
    constructor(inputElem: HTMLInputElement) {
        const wrapper = document.createElement("div");
        inputElem.insertAdjacentElement("afterend", wrapper);
        wrapper.appendChild(inputElem);

        super("MyInput", wrapper, inputElem);
    }

    getValue(): string {
        return this.__valueElem.value;
    }
}
```
