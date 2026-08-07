# Changelog

All notable changes to this monorepo are documented here. The four published
packages (`@brandup/ui-kit`, `@brandup/ui-input`, `@brandup/ui-textbox`,
`@brandup/ui-dropdown`) share this changelog.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this project does not yet follow semver strictly — versions are stamped per
CI build (`Build.BuildNumber` via `autonpm-version`).

## [Unreleased]

### Deferred (intentionally not done in this revision)

- **Reactive rewrite of `DropDown` / `TextBox`.** `@brandup/ui` v2 ships
  a Vue-style reactivity system (`reactive`, `computed`, `effect`,
  `bind`, `bindEach`). The current components use imperative DOM
  updates; converting them is a fundamental rewrite that warrants its
  own focused effort and a major bump (the wire shape stays the same
  but every internal class-toggle / `__renderItems` becomes reactive).
  Tests added in this revision (47 cases) are the safety net for that
  future migration.
- **Migration from `@brandup/autonpm` to npm workspaces.** Workspaces
  cover install / build / pack, but `autonpm` also drives an audit
  auto-fix pass on every `install` (see `node_modules/@brandup/autonpm/
  src/npm.js`). Replacing it loses that flow, and `azure-pipelines.yml`
  would need synchronized edits we can't validate locally. Left in
  place for now.

### Added

- **The format toolbar fits a phone screen.** The panel is never wider than
  the screen (or its container in the `toolbarContainer` mode), and its right
  edge stays inside the viewport — a field near the right side of a desktop
  window used to push the panel off-screen too. A full button set that does
  not fit scrolls horizontally inside `.toolbar-body`: buttons neither wrap
  nor hide, the panel stays one row; the bar is the kit's `.ui-scrollable`,
  only thinner. `--richeditor-toolbar-edge-gap` sets the gap from the screen
  edges (paired with `EDGE_GAP` in toolbar.ts); the group separator no longer
  collapses to nothing when width runs out.

- **The randomizer opens with the word under the caret.** With no selection
  of its own, the modal takes the word the caret stands on as the first
  variant — that is usually the word being randomized — and the assembled
  spintax replaces that word instead of tearing it in half. A caret outside
  any word (right after a dot) opens the window empty. New on `RichEditor`:
  `caretWord`, `selectCaretWord()`.

- **Quote styling is configurable, and the quote is a content-sized plaque.**
  New variables `--richeditor-quote-fill`, `--richeditor-quote-line-width`,
  `--richeditor-quote-padding-tb`/`-lr` next to the existing line color; the
  quote gets a background and `width: fit-content` — with a fill, the empty
  space right of a short line would read as part of the plaque. In
  `@brandup/ui-messageeditor` the fill follows the bubble color
  (`--messageeditor-quote-fill`), not the editor's neutral gray.

- **Hover feedback on message constructs.** Spintax and variables darken on
  hover (`--hover--messageeditor-*-fill`, derived from the fills via
  `color-mix`) and show a pointer cursor — but only where the click actually
  works: readonly and disabled fields show neither.

- **Floating scrollbar in `.ui-scrollable`.** The bar no longer touches the
  edges of its box. `--scrollbar-track-inset` keeps its ends away from the
  corners (a margin on the track), `--scrollbar-edge-inset` moves the bar
  itself off the box edge (a transparent border on the thumb, so layout is
  not touched at all), and `--scrollbar-thumb-min` gives the thumb a minimum
  length so it does not shrink to a dot on long content. The bar also shows
  the default cursor instead of inheriting the one set on the box — over a
  text field it used to be a text caret. `--scrollbar-size` now means the
  thickness of the visible bar, not of the space reserved for it.

- **A "set up fields" link in the `@brandup/ui-messageeditor` personalization
  window.** Declared by the host via the `variablesSetup` option (a URL for a
  real `<a href>`, or a function for an SPA transition / own dialog) or the
  `data-variables-setup` attribute; the caption comes from
  `variablesSetupText` / `data-variables-setup-text` (default: «Настроить
  поля»). The link sits as the last row of the window in both list states —
  the main way out of an empty list, a fallback when the needed field is
  missing. Clicking closes the window silently (no caret return — the focus
  leaves the screen); a function may return `false` to keep the window open.
  A declared setup also opts into personalization, like a declared variable
  list. Exported: `VARIABLES_SETUP_TEXT`, `VariablesSetup`.

- **Markdown is parsed on plain-text paste when the value is stored as
  markdown.** With `storage: "markdown"` the markers in pasted plain text mean
  the same thing they mean in the value, so they are parsed by the same
  `deserialize` with the same declared tool and block sets. Only the enabled
  format ever applies — a marker of an undeclared tool stays literal text,
  exactly as it would in the value (and as the value itself is parsed on
  editor initialization). Clipboard `text/html` still wins when present;
  text modified by `filterPaste` and text pasted into a code block stay
  literal. An opening fence with a language tag (` ```text `) now opens a
  code block the same way — in pasted text and in the value alike; the tag
  itself is dropped (a bare fence goes back out), and only a bare fence
  closes the block. Clipboard `text/html` wins only when it carries markup of
  its own: code editors hand markdown source over as bare lines wrapped in
  `<div>`s, and such flat html knows nothing beyond `text/plain`, so the
  storage-format parse goes first. Document-shaped html (`<p>` paragraphs,
  headings, list items) is never taken as flat, even when it carries no
  formatting tag at all: literal marker characters in web-page prose are what
  the page reader sees, and parsing them would turn them into markup. Nested
  `<div>`/`<p>` boundaries inside a pasted payload now become line breaks
  instead of joining adjacent lines back to back.

- **Text files can be dropped into `@brandup/ui-richeditor`.** A dropped
  `text/*` file (or an extension-recognized `.md`/`.markdown`/`.txt`/`.text`
  file with no MIME type) is inserted as its content through the same pipeline
  as paste: `filterPaste`, storage-format parsing with the declared sets, one
  undo step. Several files are joined with a blank line, the caret lands at
  the drop point where the browser can name it, and any other drop is still
  swallowed — a free-form drag would bypass the history and the host filters.

- **The spoiler button is shown in the shared toolbar.** The tool itself
  always worked — `||spoiler||` was parsed, rendered and stored, and
  `applyFormat("spoiler")` was callable from code — but the button was kept
  out of the panel via `HIDDEN_TOOLS`. The list is now empty; every editor
  with the default tool set (`@brandup/ui-textbox`,
  `@brandup/ui-messageeditor`) gets the button. Channels that do not
  understand spoilers keep excluding it the usual way (`tools` /
  `data-tools` / `data-format-tools`).

- **Recently used emojis in the `@brandup/ui-richeditor` picker.** The last
  picked symbols (up to two picker rows) show up as the first group of the
  emoji popup, most recent first. The list lives in `localStorage`
  (`RECENT_EMOJIS_KEY`), so it is shared by every picker on the origin and
  survives reloads; `openEmojiPicker()` rebuilds the group on every open.
  The group is absent until something is picked, junk in the stored value is
  filtered out, and unavailable storage (private mode) leaves picking intact —
  recents just do not accumulate. Exported: `recentEmojis()`,
  `rememberEmoji()`, `refreshRecentEmojis()`, `RECENT_EMOJIS_KEY`,
  `RECENT_EMOJIS_LIMIT`, `RECENT_GROUP_CLASS`. `@brandup/ui-messageeditor`
  gets the group for free through the shared picker.

- **Clear formatting, undo and redo in `@brandup/ui-richeditor`.**
  `clearFormat()` strips every format from the selection (or from the word
  under a collapsed caret, matching how formats are applied), including
  synonym tags brought in by paste or `setValue`; `clearAllFormat()` does
  the same for the whole content. `undo()` / `redo()` and the `canUndo` /
  `canRedo` flags expose the editor's own history, which previously was
  reachable only through `Ctrl+Z` / `Ctrl+Y`. Both clearing operations are
  a single undo step and record nothing when there is nothing to clear.
  The shared toolbar can now show action buttons for these — opted in via
  the `actions` option (`erase`, `undo`, `redo`) or the
  `data-editor-actions` attribute on `TextBox`; without it the toolbar is
  unchanged. Buttons carry `disabled` while the action is unavailable,
  decided from the same word-expanded range the operation itself works
  on, so a button is never disabled while its action would have done
  something — and never moves the caret when it does nothing.
- **ESLint 9 (flat config) + Prettier 3.** Configs at root
  (`eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`); npm
  scripts `lint`, `lint:fix`, `format`, `format:check`. Prettier matches
  the existing `.editorconfig` (tabs, CRLF). Whole codebase
  auto-formatted in one pass.
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

- **A word, for format-to-word expansion, is a whitespace-delimited token
  without its non-letter edges.** Interior punctuation belongs to the word —
  a link with the caret in `info@example.com` wraps the whole address (it
  used to grab `example` alone), `по-русски` and `don't` stay whole — while
  punctuation after the word is not taken: the caret in a word before a dot
  no longer hands the dot to formatting. The word crosses inline tag
  boundaries (`Дарим <b>ск</b>идку` is one word «скидку») but never a `<br>`
  or an atomic construct; a caret outside any word expands nowhere and turns
  into the pending-format mode; an explicit selection only grows.

- **Vertical padding in `@brandup/ui-messageeditor` moved inside the scrolled
  area.** The editor in the bubble and the text of the source panel carry it
  themselves now, so the bar runs the full height of the field and text at the
  ends slides under the padding instead of being cut off by it. The source
  panel became two boxes for that: the frame stays on `.messageeditor-source`,
  the scrolling text moved into a nested `<pre>` (`SOURCE_TEXT_CLASS`), which
  also carries `data-placeholder` and `tabindex`.

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

- **The shared toolbar measured itself against its own stale position.** The
  panel is one for all editors and its inline `left` survives hiding, so
  after a field near the right screen edge the next show measured the panel
  squeezed by the leftover coordinate and pinned it as a narrow scrolling
  strip. The width is now measured with the coordinate cleared, and the
  viewport is `documentElement.clientWidth` rather than `innerWidth` — the
  latter includes the page scrollbar, and the rightmost button ended up
  under it.

- **`TextBox` showed the formatting toolbar with nothing declared.** A
  multiline field passed "block types not specified" to the editor, and that
  reads as "all of them" — the panel came up with quote and code buttons on a
  plain `<textarea>`. Blocks are taken from `data-blocks` only; without the
  attribute the field stays plain. Covered by regression tests.
- **Caret auto-scroll in `@brandup/ui-richeditor` left the caret under the
  padding.** Bounds were measured against the box edge, so a line driven to it
  ended up under the padding that scrolls together with the text; they now
  follow the text area. The pass also ran after a manual line break only, so
  ordinary typing and caret navigation were left to the browser, which stops
  at the same box edge — it runs on `input` and on navigation keys now. Two
  more errors in the same pass: on an empty line the anchor was the node
  before the caret (the `<br>` that ends the previous line), so the scroll
  stopped exactly one line short, and while a selection was being dragged with
  the keyboard its whole box was measured, scrolling back to the anchored end.
  Covered by regression tests.
- **The `@brandup/ui-messageeditor` source panel was ~25px taller than the
  bubble.** Its scrolling text is a `<pre>`, which measures `max-height`
  against the content box, while the value is computed with the padding
  included. The two views of one value jumped in height on every mode toggle.

- **`TextBox` copy button never fired.** It declared its command as a
  `command` attribute, while `@brandup/ui` v2 dispatches from
  `dataset.command`, i.e. `data-command` — the registered `copy-text`
  handler was unreachable. Covered by a regression test.
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
