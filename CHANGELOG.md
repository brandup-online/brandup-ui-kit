# Changelog

All notable changes to this monorepo are documented here. The four published
packages (`@brandup/ui-kit`, `@brandup/ui-input`, `@brandup/ui-textbox`,
`@brandup/ui-dropdown`) share this changelog.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this project does not yet follow semver strictly — versions are stamped per
CI build (`Build.BuildNumber` via `autonpm-version`).

## [Unreleased]

### Added
- Jest test suite (47 tests across `popup`, `utilities`, `textbox`,
  `dropdown`) covering public API plus regression tests for every fix in
  this revision.
- Per-package `*.less` ambient type declarations (TS 6 requires them for
  side-effect imports).
- `example`: `scripts/generate-cert.cjs` + `prestart` hook that creates a
  fresh self-signed dev cert via the `selfsigned` package. The cert is
  now `.gitignore`d.
- `example`: dedicated `tsconfig.backend.json` (`module: node16`,
  CommonJS-friendly) — replaces the `tsc <file> --ignoreConfig --module
  commonjs` cmdline hack and gives the IDE proper context for backend
  files.
- `DropDown`: `data-cancel` attribute on `<select>` to localize the
  "Cancel" button text (default: `Cancel`, was hard-coded "Отмена").
- `DropDown`: popup re-positions on window resize and scroll while open
  (registered/unregistered via `AbortController.signal`).
- `TextBox`: all `addEventListener` calls in `__initLogic` now share a
  single `AbortController`; `destroy()` aborts it instead of leaking
  listeners on the restored `<input>`.

### Changed
- **`InputControl` now extends `UIElementBound`** (new v2 base class for
  components whose element is bound in the constructor). The constructor
  signature became `(typeName, elem, valueElem)` and subclasses build the
  container DOM before `super(...)`. Net effect: `element` is typed
  `HTMLElement` (never undefined), so the many `this.element?...` and
  `if (!this.element) return` patterns in `TextBox` / `DropDown` are
  gone. `_onRenderElement` override is removed; class flags are applied
  inline after `super()`.
- `DropDown`: option transcription metadata moved from
  `(elem as any)['wsdd_transcript']` to a module-level
  `WeakMap<Element, ReturnType<typeof transcriptText>>` — typed and
  GC-friendly.
- `TextBox.__actionsElem` field removed (only ever written, never read
  after the constructor).
- **Bumped dependencies to current latest across the monorepo.** Highlights:
  TypeScript 5.9 → 6.0, jest 29 → 30, cross-env 7 → 10, express 4 → 5,
  webpack-cli 5 → 7, and the css/less/style/svgo loaders to their latest
  majors.
- **`@brandup/*` 1.0.x → 2.0.1.** `UIElement` in v2 takes a typed event-map
  generic; `InputControl` was parameterized over `TEvents` and `DropDown`
  / `TextBox` declare their own event maps (`"dropdown-change"` /
  `"textbox-change"`).
- Dropped the direct `@brandup/ui-dom` dependency — in v2 it is just a
  re-export of `@brandup/ui`. All `DOM` imports now come from `@brandup/ui`.
- All `DOM.tag` call sites that used the v1 string-class shortcut
  (`DOM.tag("div", "header", ...)`) were rewritten to `{ class: "..." }`
  — v2 treats the second argument as a child for any non-object value.
- Dynamic text in `DropDown` (`itemText`, `placeholder`, `emptyText`,
  header label) is now written via `textContent` instead of letting
  `DOM.tag` insert it as HTML.
- `TextBox.__getTextLength` now reads `textContent` (works in jsdom and
  side-steps the `\n` over-counting in `innerText` for multiline content).
- `DropDown.__getElems` simplified to a single `queryElement` call after
  removing the no-op `cloneNode` + double `append` in `__renderItems`.
- `DropDown.__togglePopup` now routes the close path through
  `__closePopup` (body class and `mouseup` listener used to leak until
  the next click).
- Removed redundant `<HTMLInputElement>` / `<HTMLButtonElement>` type
  assertions on `DOM.tag` calls — v2's overload infers the right element
  type from the tag name.
- `example`: removed `AbortSignal.{throwIfAborted,any,timeout}` polyfills.
  All three are Baseline-supported under the current `.browserslistrc`
  (`last 3 years`) and were not referenced anywhere in the codebase.
- Dropped `core-js` and `useBuiltIns: "usage"` from babel configs. The
  current browserslist (`last 3 years, > 1%, not dead`) targets modern
  browsers that have everything we use natively. Example app.js dropped
  from 72.7 KiB → 38.7 KiB minified (~47%).

### Fixed
- **Critical: XSS in `TextBox.__initText`/`setValue`.** Text built from
  `<input value>` was inserted via `innerHTML`. Replaced with safe DOM
  construction (`createTextNode`, `textContent`).
- **Critical: XSS in `DropDown`.** Same class of issue for option text
  (`optionElem.textContent` → `DOM.tag` string child → `insertAdjacentHTML`).
- **Switch fall-through for `data-search-on="false"`** in `DropDown`
  (missing `break` → `searchOn` became `NaN`).
- **Search "Enter" submits the enclosing form** in `DropDown`
  — the keydown handler now `preventDefault`s.
- **`PopupManager` state leak** when `open()` is called for a different
  popup while one is already current — the previous popup is now closed
  first.
- **`PopupManager.close()` did not reset `current`** — `isOpened()` was
  permanently `true` after the first open.
- **`isSearchable` check** in `DropDown` evaluated
  `optionsCount >= <number>false` as `>= 0` and never disabled search;
  fixed with an explicit type guard.
- **TextBox numeric paste:** `replace(' ', '')` removed only the first
  whitespace; switched to `replace(/\s/g, '')`.
- **`e.submitter`** in `InputControl.__submitEvent` is now optional-chained
  so a `requestSubmit()` without a submitter does not crash.
- `InputControl` removes its `invalid` listener on `destroy`.
- TypeScript 6 migration: replaced deprecated `baseUrl` with explicit
  `rootDir`, added `--ignoreConfig --module commonjs` to the example
  backend `tsc` command (TS 6 changed the default module format).
- Express 5 migration: catch-all route `"*"` → `"/*splat"` (path-to-regexp
  v8 requires named wildcards).

### Removed
- Dead `__invalidTimeout` field in `DropDown` (only ever cleared, never
  set).
- Dead unreachable `elems.length === 2` branch in `DropDown.__getElems`.
- Orphan `npm/brandup-ui-message-editor/` directory (no `package.json`,
  no sources — only stale `node_modules`).

### Repository hygiene
- `repository.url`, `homepage`, and `bugs.url` in all four published
  packages now point at the correct repo (`brandup-online/brandup-ui-kit`,
  was `brandup-online/brandup-ui`).
- Renamed `example.contoller.ts` → `example.controller.ts` (typo) and
  `ExampleContoller` → `ExampleController`.
- `.vscode/launch.json` rewritten to actually launch
  `brandup-ui-example`; new `serve` npm script (`build && start`).
