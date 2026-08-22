# @brandup/ui-dropdown

[![Build Status](https://dev.azure.com/brandup/BrandUp%20Core/_apis/build/status%2FBrandUp%2Fbrandup-ui-kit?branchName=main)](https://dev.azure.com/brandup/BrandUp%20Core/_build/latest?definitionId=81&branchName=main)

Компонент выпадающего списка, заменяющий стандартный `<select>`. Поддерживает поиск с транслитерацией (EN ↔ RU), адаптивный режим для планшетов и валидацию через форму.

## Установка

```bash
npm i @brandup/ui-dropdown
```

## Использование

```html
<select id="city" data-placeholder="Выберите город" data-search-on="5">
    <option value="">— не выбрано —</option>
    <option value="msk">Москва</option>
    <option value="spb">Санкт-Петербург</option>
</select>
```

```typescript
import DropDown from "@brandup/ui-dropdown";
import { CHANGE_EVENT, ChangeEventData } from "@brandup/ui-dropdown";

const selectElem = document.getElementById("city") as HTMLSelectElement;
const dropdown = new DropDown(selectElem);

dropdown.on(CHANGE_EVENT, (data: ChangeEventData) => {
    console.log(data.value, data.title, data.index);
});
```

## Data-атрибуты

| Атрибут | По умолчанию | Описание |
| --- | --- | --- |
| `data-placeholder` | `"Select"` | Текст при отсутствии выбранного значения |
| `data-emptytext` | `"Empty list"` | Текст при пустом списке опций |
| `data-search-placeholder` | `"Search"` | Плейсхолдер строки поиска |
| `data-search-empty` | `"Not found"` | Текст при отсутствии результатов поиска |
| `data-cancel` | `"Cancel"` | Текст кнопки закрытия (адаптивный режим) |
| `data-search-on` | `15` | Порог отображения поиска: число (минимальное кол-во опций), `"true"` — всегда, `"false"` — никогда |
| `data-autofocus` | — | Автофокус при инициализации; то же делает нативный `autofocus`. Условия отмены — см. [@brandup/ui-input](../brandup-ui-input/README.md#автофокус) |
| `data-readonly` | — | Значение показывается, но сменить его нельзя: список не открывается. У `<select>` нативного `readonly` нет, поэтому режим объявляется этим атрибутом |

## API

### Собственные методы

| Метод | Описание |
| --- | --- |
| `getValue(): string \| null` | Значение выбранного `<option>`; `null`, если не выбрано ничего |
| `getSelectedIndex(): number` | Индекс выбранного `<option>`; `-1`, если не выбрано ничего |
| `getSelectedTitle(): string \| null` | Текст выбранного пункта списка |
| `setValue(value: string \| null): void` | Выбирает пункт с таким значением и показывает его. Значения без своего пункта в списке (в том числе пустое) сбрасывают выбор в плейсхолдер. `dropdown-change` поднимается только при действительной смене показанного пункта |

### Методы (унаследованы от InputControl)

| Метод | Описание |
| --- | --- |
| `validate(): boolean` | Проверяет значение через нативный `checkValidity()` |
| `focus(): void` | Ведёт фокус в кнопку показа списка и прокручивает контрол в видимую область |
| `destroy(): void` | Восстанавливает исходный `<select>` и освобождает ресурсы |

### Свойства

| Свойство | Тип | Описание |
| --- | --- | --- |
| `placeholder` | `string` | Текст-заглушка |
| `emptyText` | `string` | Текст при пустом списке |
| `searchOn` | `number \| boolean` | Настройка отображения строки поиска |

### Событие dropdown-change

Генерируется при выборе значения из списка.

```typescript
import { CHANGE_EVENT, ChangeEventData } from "@brandup/ui-dropdown";

dropdown.on(CHANGE_EVENT, (data: ChangeEventData) => {
    console.log(data.value);  // значение выбранного <option>
    console.log(data.title);  // текст выбранного <option>
    console.log(data.index);  // индекс выбранного элемента в списке
});
```

## Поиск и транслитерация

Когда количество опций превышает порог `data-search-on`, в попапе отображается строка поиска. Поиск выполняется по тексту опций и поддерживает **автоматическую транслитерацию**:

- Ввод на русской раскладке → поиск по английскому тексту
- Ввод на английской раскладке → поиск по русскому тексту

```typescript
import { detectLanguage, transcriptText } from "@brandup/ui-dropdown";

const lang = detectLanguage("hello"); // "english"
const variants = transcriptText("руку"); // { english: "reue" }
```

## Адаптивный режим

На экранах шириной менее `1030px` попап открывается в полноэкранном режиме с кнопкой «Отмена».

## Оформление

Список опций прокручивается сам и оформлен общим классом кита `ui-scrollable` — полоса выглядит одинаково во всех компонентах, а её размер и цвет переопределяются переменными `--scrollbar-*` (см. [`@brandup/ui-kit`](../brandup-ui-kit)).
