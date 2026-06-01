# @brandup/ui-kit

[![Build Status](https://dev.azure.com/brandup/BrandUp%20Core/_apis/build/status%2FBrandUp%2Fbrandup-ui-kit?branchName=main)](https://dev.azure.com/brandup/BrandUp%20Core/_build/latest?definitionId=81&branchName=main)

Базовый пакет UI-кита: сброс стилей, типографика, стили полей ввода, PopupManager и middleware для `@brandup/ui-app`.

## Установка

```
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
```

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
