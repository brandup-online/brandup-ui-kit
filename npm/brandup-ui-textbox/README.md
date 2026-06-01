# @brandup/ui-textbox

[![Build Status](https://dev.azure.com/brandup/BrandUp%20Core/_apis/build/status%2FBrandUp%2Fbrandup-ui-kit?branchName=main)](https://dev.azure.com/brandup/BrandUp%20Core/_build/latest?definitionId=81&branchName=main)

Компонент текстового поля на базе `contenteditable`. Заменяет стандартные `<input>` и `<textarea>`, добавляя расширенное поведение: счётчик символов, кнопку копирования, фильтрацию ввода по типу и валидацию.

## Установка

```
npm i @brandup/ui-textbox
```

## Использование

```html
<input id="name" type="text" placeholder="Введите имя" />
```

```typescript
import TextBox from "@brandup/ui-textbox";
import { CHANGE_EVENT, ChangeEventData } from "@brandup/ui-textbox";

const inputElem = document.getElementById("name") as HTMLInputElement;
const textbox = new TextBox(inputElem);

textbox.on(CHANGE_EVENT, (data: ChangeEventData) => {
    console.log(data.value);
});
```

## Поддерживаемые типы

`TextBox` принимает `<input>` со следующими значениями атрибута `type`:

| Тип | Поведение |
|---|---|
| `text` | Обычный текст |
| `email` | Фильтрует недопустимые символы, ограничивает длину до 256 символов (RFC 5321) |
| `url` | URL-адрес |
| `tel` | Телефон |
| `number` | Только цифры, вставка фильтруется |

Для многострочного ввода передайте `<textarea>`.

## Data-атрибуты

| Атрибут | Описание |
|---|---|
| `data-symbolcounter` | Показывает счётчик введённых символов (и максимума, если задан `maxlength`) |
| `data-autofocus` | Автофокус при инициализации (игнорируется на touch-устройствах) |
| `data-copy-button` | Добавляет кнопку копирования значения в буфер обмена |
| `data-allow-empty-strings` | Разрешает значение из одних пробелов |
| `data-readonly` | Альтернативный способ задать режим только для чтения |

## API

### Методы

| Метод | Описание |
|---|---|
| `getValue(): string` | Возвращает текущее значение (обрезает пробелы по краям) |
| `setValue(value: string): void` | Устанавливает значение программно |
| `hasValue(): boolean` | `true`, если значение не пустое |
| `validate(): boolean` | Валидирует значение, добавляет/снимает класс `invalid` |
| `focus(): void` | Устанавливает фокус, прокручивает в видимую область |
| `destroy(): void` | Восстанавливает исходный DOM-элемент и освобождает ресурсы |

### Свойства

| Свойство | Тип | Описание |
|---|---|---|
| `type` | `TextBoxType` | Тип ввода: `"text"` \| `"email"` \| `"url"` \| `"tel"` \| `"number"` |
| `multyline` | `boolean` | `true` для `<textarea>` |
| `maxlength` | `number` | Максимальная длина (из атрибута `maxlength`) |
| `copyButton` | `boolean` | Наличие кнопки копирования |
| `symbolCounter` | `boolean` | Наличие счётчика символов |
| `placeholder` | `string \| null` | Текст-заглушка |

### Событие textbox-change

Генерируется при каждом изменении значения.

```typescript
import { CHANGE_EVENT, ChangeEventData } from "@brandup/ui-textbox";

textbox.on(CHANGE_EVENT, (data: ChangeEventData) => {
    console.log(data.value);   // текущее значение
    console.log(data.textbox); // ссылка на экземпляр TextBox
});

// Или через helper-метод
textbox.onChange((data) => { ... });
```

## CSS-классы состояний

| Класс | Условие |
|---|---|
| `focused` | Поле в фокусе |
| `invalid` | Значение не прошло валидацию |
| `incorrect` | Введён недопустимый символ (мигает, затем снимается) |
| `required` | Атрибут `required` задан |
| `readonly` | Режим только для чтения |
| `disabled` | Элемент отключён |
