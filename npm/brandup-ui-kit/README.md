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

### Style variables

Сreate uikit.vars.less in the root of the project

Connecting script to webpack:

```JS
const parseLessVars = require("@brandup/ui-kit/tools/parse-vars.cjs");
```

Getting variables from a Less file

The function takes the path to the Less file (string) and returns an object with variables in the format:

The key is the name of a variable with the @ symbol (for example, @MainColor)
Value — a string with the value of a variable from a file (for example, #ff0000)

Example of a Less file:

@MainColor: #ff0000;
@Secondary-Color: rgba(0,0,0,0.5);
@FontSize: 16px;

Result of parseLessVars:

{
'@MainColor': '#ff0000',
'@Secondary-Color': 'rgba(0,0,0,0.5)',
'@FontSize': '16px'
}

```JS
const variables = parseLessVars('path/to/your/variables.less');
```

if no parameter has been set, the function will refer to the uikit.vars.less

Usage in the less-loader configuration

Pass the received variables to the modifyVars option:

```JS
modifyVars: {
			...variables,
			'@MainBackground': "red" // if you want to change the variable before the build
		}
```
