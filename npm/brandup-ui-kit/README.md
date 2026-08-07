# @brandup/ui-kit

[![Build Status](https://dev.azure.com/brandup/BrandUp%20Core/_apis/build/status%2FBrandUp%2Fbrandup-ui-kit?branchName=main)](https://dev.azure.com/brandup/BrandUp%20Core/_build/latest?definitionId=81&branchName=main)

Базовый пакет UI-кита: сброс стилей, типографика, стили полей ввода, модальное окно, PopupManager и middleware для `@brandup/ui-app`.

## Установка

```bash
npm i @brandup/ui-kit
```

## Подключение middleware

Зарегистрируйте `uiKitMiddlewareFactory` в сборщике приложения. Middleware автоматически регистрирует команду `ui-popup-toggle` для управления попапами.

```typescript
import { ApplicationBuilder } from "@brandup/ui-app";
import { uiKitMiddlewareFactory } from "@brandup/ui-kit";

const builder = new ApplicationBuilder({});
builder.useMiddleware(uiKitMiddlewareFactory);

const app = builder.build({ basePath: "/" });
app.run();
```

## PopupManager

Статический менеджер для управления всплывающими панелями. В каждый момент времени открыт не более одного попапа.

### Разметка

Добавьте CSS-класс `ui-popup` на элемент попапа.

```html
<!-- Кнопка-инициатор рядом с попапом — команда ui-popup-toggle регистрируется middleware -->
<button data-command="ui-popup-toggle">Меню</button>
<div class="ui-popup">...</div>
```

### API

```typescript
import { PopupManager } from "@brandup/ui-kit";

// Открыть попап (закрывает предыдущий, если был открыт другой)
PopupManager.open(popupElem, {
    initiator: buttonElem, // необязательно: повторный клик по initiator закроет попап
    onClose: () => { },    // необязательно: callback при закрытии
});

// Закрыть текущий попап
PopupManager.close();

// Проверить, открыт ли какой-либо попап
PopupManager.isOpened(); // boolean

// ...или именно этот — так после open() узнают, открылся попап или закрылся повторным нажатием
PopupManager.isOpened(popupElem); // boolean
```

### Состояния

Пока попап открыт, классы расставлены так:

| Элемент   | Класс               | Константа                 |
| --------- | ------------------- | ------------------------- |
| Попап     | `opened`            | `POPUP_OPENED_CLASS`      |
| Инициатор | `ui-popup-expanded` | `POPUP_EXPANDED_CLASS`    |
| `body`    | `ui-popup-opened`   | `POPUP_OPENED_BODY_CLASS` |

Класс на `body` — точка расширения для страницы: например, чтобы придержать фон, пока попап открыт.

### Закрытие

Попап закрывается кликом мимо себя, повторным кликом по инициатору, клавишей `Escape` и навигацией
приложения. Свои обработчики `Escape` компоненту не нужны — менеджер снимает попап сам; если нужно
вернуть фокус на инициатор, делайте это в `onClose`.

### Узкий экран

До `@adaptive-tablet-small` (850px) попап позиционируется относительно инициатора. Ниже этой ширины
рядом с кнопкой места уже нет, поэтому попап отрывается от неё и показывается окном по центру экрана
с затемнением — `position: fixed`, ширина по экрану до `--popup-window-max-width`, прокрутка страницы
под ним придержана через `body.ui-popup-opened`. Собственные `top` / `left` / `width` попапа в этом
режиме перекрываются: правила кита идут с `body` в селекторе и весят больше, чем два класса.

Настраивается переменными `--popup-backdrop`, `--popup-window-inset`, `--popup-window-max-width`.

Ловушки фокуса в этом режиме нет: за экраном попапа остаются достижимые с клавиатуры элементы
страницы. Если попап — полноценный диалог, берите `Modal`.

Прокрутку держит `overflow: hidden` на `body` — в Safari на iOS этого не всегда достаточно, страница
под попапом может тянуться. Оговорка общая для попапа, модального окна и списка дропдауна.

## Modal

Базовое модальное окно: затемнение, шапка с заголовком и крестиком, тело. Наследник наполняет `body` в своём конструкторе и живёт до `close()`; само окно знает только про рамку, слои и закрытие.

```typescript
import { Modal } from "@brandup/ui-kit";

class ConfirmModal extends Modal {
    constructor() {
        super({ title: "Удалить?", className: "confirm-modal", closeOnBackdrop: false });

        this.body.append(/* ... */);
    }
}

const modal = new ConfirmModal();
modal.onClosed(() => {
    /* отпустить то, что придержали на время окна */
});
```

| Член | Описание |
| --- | --- |
| `body` | Тело окна — его наполняет наследник |
| `close()` | Закрыть окно (то же делают крестик, Esc и клик по подложке) |
| `onClose()` | Хук наследника перед закрытием |
| `onClosed(handler)` | Подписка на закрытие: срабатывает ровно один раз, чем бы окно ни кончилось; на уже закрытом окне — сразу |

Закрытие идёт через систему команд кита (`ui-modal-close`), поэтому свои кнопки закрытия достаточно объявить тем же `data-command`. Пока окно открыто, на `<body>` висит класс `ui-modal-opened` — страница под ним не прокручивается.

## Прокручиваемые области

Класс `ui-scrollable` оформляет полосу прокрутки одинаково во всех компонентах кита — тонкая, без стрелок, со скруглённым ползунком, «парящая»: не касается краёв коробки. Над полосой курсор всегда обычная стрелка, а не курсор элемента (над полем ввода это была бы текстовая каретка).

```typescript
import { SCROLLABLE_CLASS } from "@brandup/ui-kit";

const list = DOM.tag("div", { class: SCROLLABLE_CLASS });
```

Настраивается CSS-переменными прямо на элементе:

| Переменная | По умолчанию | Что задаёт |
| --- | --- | --- |
| `--scrollbar-size` | `6px` | Толщина видимой полосы (место под неё — толщина плюс `--scrollbar-edge-inset` с обеих сторон) |
| `--scrollbar-thumb` | `#8696a0` | Цвет ползунка |
| `--scrollbar-thumb-radius` | `3px` | Скругление ползунка |
| `--scrollbar-thumb-min` | `30px` | Минимальная длина ползунка — на длинном содержимом он не вырождается в точку |
| `--scrollbar-track-inset` | `6px` | Отступ вдоль полосы: её концы не доходят до углов коробки |
| `--scrollbar-edge-inset` | `6px` | Отступ поперёк: полоса отходит от края коробки |

Оформление держится на `::-webkit-scrollbar`: стандартные `scrollbar-width`/`scrollbar-color` не задаются намеренно — Blink при них отдаёт системную полосу со стрелками. Браузерам без `::-webkit-scrollbar` (Firefox) стандартные свойства выдаются отдельным правилом; отступы и минимальная длина там не действуют — Firefox ими не управляется.

У элемента со скруглением полосу лучше уводить внутрь — на вложенный прокручиваемый элемент, иначе угол выглядит срезанным (так сделаны `TextBox` и `MessageEditor`).

### Полоса прокрутки страницы

Место под полосой прокрутки страницы зарезервировано всегда — `scrollbar-gutter: stable` на `html` и `body`. Без этого страница дёргается по ширине каждый раз, когда прокрутку придерживают (`ui-popup-opened`, `ui-modal-opened`) или контент перестаёт её требовать: полоса пропадает, вьюпорт становится шире на её толщину.

Ценой этого на странице, которой прокрутка не нужна, остаётся пустая полоса. Если такое поведение не нужно, выключите резерв переменной:

```css
:root {
    --scrollbar-gutter: auto;
}
```

Браузеры без поддержки `scrollbar-gutter` (Safari до 18.2) объявление игнорируют, но там, где полосы накладные (iOS, Android), ширина и так не прыгает.

## Утилиты

```typescript
import { IS_TOUCH_DEVICE } from "@brandup/ui-kit";

// true на touch-устройствах (мобильные, планшеты)
if (IS_TOUCH_DEVICE) { ... }
```

## Стили

Подключите стили через импорт в точке входа — они включаются автоматически вместе с пакетом.

### Переменные Less

Переопределите значения в файле `uikit.vars.less` в корне проекта перед сборкой. Файл с переменными по умолчанию: [vars.less](vars.less).

**Адаптивные брейкпоинты:**

```less
@adaptive-desktop-small: 1650px;
@adaptive-notebook:      1550px;
@adaptive-notebook-small: 1370px;
@adaptive-tablet:        1030px;
@adaptive-tablet-small:  850px;
@adaptive-mobile:        500px;
@adaptive-mobile-small:  370px;
```

**Общие:**

```less
@main-background: #fff;
@font-size:       14px;
@font-family:     system-ui, ...;
@font-weight:     400;
@line-height:     130%;
@text-color:      #222;
```

**Заголовки (`h1`–`h5`):**

```less
@h-line-height: 130%;
@h1-font-size:  56px;  @h1-font-weight: 600;
@h2-font-size:  50px;  @h2-font-weight: 600;
@h3-font-size:  28px;  @h3-font-weight: 600;
@h4-font-size:  22px;  @h4-font-weight: 600;
@h5-font-size:  18px;  @h5-font-weight: 600;
```

**SVG:**

```less
@svg-size:   20px;
@svg-fill:   @text-color;
@svg-stroke: none;
```

**Блок контента (класс `content-width`):**

```less
@content-max-width:    1280px;
@content-min-width:    320px;
@content-padding-lr:   40px;
```

**Попапы:**

```less
@popup-fill:          @main-background;
@popup-color:         @text-color;
@popup-border-radius: 5px;
@popup-box-shadow:    0px 4px 8px 2px rgba(0,0,0,0.12);
```

**Поля ввода:**

```less
@input-height:    46px;
@input-padding-lr: 20px;
@input-fill:      #fff;
@input-color:     @text-color;
@input-font-size: 14px;

// Состояния: hover, focus, readonly, disabled, invalid, incorrect
@hover--input-border-color:    #666;
@focus--input-border-color:    #222;
@readonly--input-fill:         #f7f7f7;
@disabled--input-fill:         #eee;
@invalid--input-border-color:  red;
```

### parseLessVars

Утилита для чтения Less-переменных в конфигурации webpack.

```js
const parseLessVars = require("@brandup/ui-kit/build/parse-less-vars.cjs");

// Читает uikit.vars.less из корня проекта
const vars = parseLessVars();

// Или явно указать путь к файлу
const vars = parseLessVars("path/to/variables.less");
// { '@main-color': '#ff0000', '@font-size': '16px', ... }
```

Использование в конфигурации `less-loader`:

```js
{
    loader: "less-loader",
    options: {
        lessOptions: {
            modifyVars: parseLessVars(),
        },
    },
}
```
