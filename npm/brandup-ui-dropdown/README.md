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
import DropDown, { DROPDOWN, ChangeEventData } from "@brandup/ui-dropdown";

const selectElem = document.getElementById("city") as HTMLSelectElement;
const dropdown = new DropDown(selectElem);

dropdown.on(DROPDOWN.EVENT.CHANGE, (data: ChangeEventData) => {
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
| `setValue(value: string \| null): void` | Выбирает пункт с таким значением и показывает его. Значения без своего пункта в списке (в том числе пустое) сбрасывают выбор в плейсхолдер. `ui:dropdown:change` поднимается только при действительной смене показанного пункта |

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

### Событие ui:dropdown:change

Генерируется при выборе значения из списка.

```typescript
import { DROPDOWN, ChangeEventData } from "@brandup/ui-dropdown";

dropdown.on(DROPDOWN.EVENT.CHANGE, (data: ChangeEventData) => {
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

## Клавиатура и доступность

Список — слой поверх страницы: он встаёт в [стек слоёв](../brandup-ui-kit/README.md#слои) кита, поэтому
`Escape` закрывает именно его (список внутри модального окна закроется один, окно останется), а
придержанную им прокрутку страницы стек считает вместе с остальными слоями. Выход по `Escape` из
списка возвращает фокус на кнопку показа — на узком экране список занимает весь экран, и уйти с него
больше не на что. Раскрытый список на странице один: открытие следующего закрывает предыдущий.

Разметка объявляет то же самое для озвучки:

| Элемент | Что объявлено |
| --- | --- |
| Кнопка показа | `aria-haspopup="listbox"`, `aria-controls` с идентификатором самого списка, `aria-expanded` (`true`/`false` — и в закрытом виде тоже) |
| `ul` списка | `role="listbox"` и `aria-label` с текстом-заглушкой (`data-placeholder`) |
| `li` пункта | `role="presentation"` — носитель команды и значения, между списком и пунктом он пустой |
| `span` пункта | `role="option"` и `aria-selected`; он же принимает фокус, по нему ходят стрелки |

## Вид

Кнопка показа оформлена как поле ввода кита и отвечает на состояния так же: рамка, заливка и цвет
текста берутся из тех же токенов (`--input-*`, `--hover--input-*`, `--focus--input-*`,
`--readonly--input-*`, `--disabled--input-*`, `--invalid--input-*`). Своих цветов у дропдауна нет —
перекрасив поля ввода темой, вы перекрасите и его.

Состояния объявляет базовый `InputControl` классами на корне (`readonly`, `disabled`, `invalid`),
плюс собственные `expanded` и `hasvalue`.

Вид в фокусе висит на всём контроле (`:focus-within`), а не на самой кнопке: открытие списка уводит
фокус на выпадающую панель, и правило на кнопке гасло бы ровно тогда, когда контролом пользуются.

Одно отличие от поля намеренное: у закрытого дропдауна (`readonly`) стрелка приглушена цветом
выключенного поля. Текст при этом обычный, как и у `[readonly]` у поля ввода, — читается в полную
силу; а стрелка обещает раскрыть список, который не раскроется.

Сторона раскрытия выбирается сама, по месту вокруг кнопки: вниз, а вверх — только если снизу список
не помещается и сверху места больше. Место считается по коробке, в которой список видно, — её даёт
`clippingRect` кита: обёртка с `overflow: hidden` режет всё, что раскрывается ниже последнего
элемента страницы, а окно при этом сообщает, что место есть. Пересчитывается на прокрутке и
изменении размера, поэтому сторона меняется на ходу, когда кнопка уезжает к краю. Ниже `1030px` списка нет
вовсе — там он показывается листом по центру экрана, и место не считается.

Список — это элемент с классом `ui-dropdown-popup` (раньше `popup`; имя читается из
`DROPDOWN.CLASS.ELEMENT.POPUP`). Если проект оформлял его своим правилом, класс надо переименовать.

Совпадение с полем ввода не на словах: `test/dropdown-css.test.ts` компилирует оба стиля, разрешает
каскад и сверяет, что в каждом состоянии кнопка и поле красятся одним и тем же токеном. Там же
проверяется, что классы разворота достают до самого списка, а не до коробки внутри него, и что
отступ списка от кнопки в стилях совпадает с числом, по которому считается место.

## Имена

Классы, команды, события, подписи по умолчанию и числа, на которые опирается поведение, пакет
отдаёт одним объектом `DROPDOWN` (модуль `names.ts`) — россыпи `ROOT_CLASS` / `CHANGE_EVENT` /
`*_COMMAND` больше нет. Модуль имён ничего не импортирует: их можно взять, не притаскивая стили
и код контрола. Так же устроены остальные пакеты кита.

```typescript
// коротким путём — без стилей и кода контрола
import { DROPDOWN } from "@brandup/ui-dropdown/names";
// или из общего входа, если пакет и так подключён
import { DROPDOWN } from "@brandup/ui-dropdown";

DROPDOWN.CLASS.ROOT;              // "ui-dropdown" — корень контрола
DROPDOWN.CLASS.INPUT;             // "ui-dropdown-input" — поле-носитель
DROPDOWN.CLASS.MINIATURE;         // "ui-dropdown-miniature"
DROPDOWN.CLASS.BODY;              // "body-dropdown-opened" — на <body>, пока список раскрыт
DROPDOWN.CLASS.ELEMENT.POPUP;     // части разметки: POPUP, CONTENT, HEADER, SEARCH, VIEW, CANCEL, EMPTY
DROPDOWN.CLASS.STATE.EXPANDED;    // состояния: EXPANDED, HAS_VALUE, EMPTY, SEARCHABLE, INVALID,
                                  // RESULT, NOT_FOUND, MATCH, TOP, RIGHT
DROPDOWN.COMMAND.TOGGLE;          // команды разметки (см. ниже)
DROPDOWN.EVENT.CHANGE;            // "ui:dropdown:change"
DROPDOWN.TEXT.CANCEL;             // подписи: PLACEHOLDER, EMPTY, SEARCH, SEARCH_EMPTY, CANCEL
DROPDOWN.VALUE.SEARCH_ON;         // 15 — порог показа строки поиска
DROPDOWN.VALUE.SEARCH_MAX_LENGTH; // 50
DROPDOWN.VALUE.TABLET_WIDTH;      // 1030 — ниже список раскрывается во весь экран
DROPDOWN.LIST_ID;                 // префикс идентификатора списка для aria-controls
```

## Команды

Разметку контрола собирает он сам, но команды в ней объявлены с префиксом кита — свою кнопку
закрытия списка достаточно объявить тем же `data-command`:

| Команда | Имя | Действие |
| --- | --- | --- |
| `ui-dropdown-toggle` | `DROPDOWN.COMMAND.TOGGLE` | Раскрыть или закрыть список |
| `ui-dropdown-close` | `DROPDOWN.COMMAND.CLOSE` | Закрыть список (работает и на выключенном контроле) |
| `ui-dropdown-select` | `DROPDOWN.COMMAND.SELECT` | Выбрать пункт (`data-value`, `data-index`) |

## Адаптивный режим

На экранах шириной менее `1030px` попап открывается в полноэкранном режиме с кнопкой «Отмена».

## Оформление

Список опций прокручивается сам и оформлен общим классом кита `ui-scrollable` — полоса выглядит одинаково во всех компонентах, а её размер и цвет переопределяются переменными `--scrollbar-*` (см. [`@brandup/ui-kit`](../brandup-ui-kit)).
