# brandup-ui-kit

## Installation and use

Install NPM package [@brandup/ui](https://www.npmjs.com/package/@brandup/ui-kit).

```
npm i @brandup/ui-kit@latest
```

Add `@brandup/ui-kit` middleware to your application.

```
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

Reset styles for ul, ol, menu, svg,  input, textarea, button, headers, img and others.

### Body styles

```
--main-background
```

### Text styles

Default root font styles.

```
--font-size
--font-family
--font-weight
--line-height
--text-color
```

### Header styles

Default root header styles.

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

### content-width

```
--content-max-width
--content-min-width
--content-padding-lr
```