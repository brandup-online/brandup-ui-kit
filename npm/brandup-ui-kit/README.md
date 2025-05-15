# brandup-ui-kit

## Installation and use

Install NPM package [@brandup/ui](https://www.npmjs.com/package/@brandup/ui-kit).

```
npm i @brandup/ui-kit@latest
```

Add `@brandup/ui-kit` middleware to your application.

```TypeScript
import { ApplicationBuilder } from "@brandup/ui-app";
import { uiKitMiddlewareFactory } from "@brandup/ui-kit";

const builder = new ApplicationBuilder({});
builder
	.useMiddleware(uiKitMiddlewareFactory)
	.useMiddleware(... other middleware);

const app = builder.build({ basePath: "/" });

app.run();
```

## Styles

### Reset styles

Reset styles for `<ul>`, `<ol>`, `<menu>`, `<img>` and others.

See [reset.less](source/reset.less) file.

### Body styles

Default root styles for `<body>` tag.

```
--main-background
--font-size
--font-family
--font-weight
--line-height
--text-color
```

See [common.less](source/common.less) file.

### Header styles

Default root styles for `<h1>`, `<h2>`, `<h3>`, `<h4>`, `<h5>`.

```
--h-line-height

--h1-font-size
--h1-font-weidth

--h2-font-size
--h2-font-weidth

--h3-font-size
--h3-font-weidth

--h4-font-size
--h4-font-weidth

--h5-font-size
--h5-font-weidth
```

See [common.less](source/common.less) file.

### SVG styles

Default root styles for `<svg>` tag.

```
--svg-size: 20px;
--svg-fill: var(--text-color);
--svg-stroke: none;
```

See [common.less](source/common.less) file.

### Content width

Add `content-width` class.

```
--content-max-width
--content-min-width
--content-padding-lr
```

See [common.less](source/common.less) file.

### Input styles

Styles for:

-   reset for input, textarea, button
-   input[type=text]
-   input[type=tel]
-   input[type=email]
-   input[type=password]
-   input[type=search]
-   input[type=url]
-   input[type=date]
-   input[type=datetime]
-   input[type=datetime-local]
-   input[type=time]
-   input[type=file]
-   input[type=number]
-   input[type=checkbox]
-   textarea
-   select

See [inputs.less](source/inputs.less) file.

### Popups

Popups work with class `ui-popup`.

```HTML
<button data-command="ui-popup-toggle">Menu1</button>
<div class="ui-popup"></div>

<button id="menu2">Menu2</button>
<div id="popup2" class="ui-popup"></div>

<button>Menu3</button>
<div id="popup2" class="ui-popup"></div>
```

Open popup by popup and initiator element:

```TypeScript
PopupManager.open(DOM.getById("popup2"), { initiator: DOM.getById("menu2") });
```

Open popup by only popup element:

```TypeScript
PopupManager.open(DOM.getById("popup3"));
```

If the initiator is specified, then when the popup is opened again, it will be closed.
