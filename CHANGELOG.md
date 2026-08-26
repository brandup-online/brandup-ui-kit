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

- **A palette under the theme inputs.** `vars.less` was a flat list of ~106
  inputs mixing raw material (`@input-border-color: #aaa`) with everything
  derived from it, and no palette at all — so every project built its own and
  mapped it onto the kit by hand: `@Accent-*` in one, `@Highlight-*` in another,
  `@Primary-Color` in two more. The top of the file is now the raw material —
  seven colours, six proportions, the type scale and the breakpoints — and the
  component inputs are derived from it. Repainting a site is a dozen values
  instead of a hunt through a hundred. Every component input stays an input and
  still wins over the palette when named explicitly, which also means a theme
  written in `@input-*` / `@button-*` terms does not answer to the palette:
  `@main-background: #fff` in a theme file beats any `@surface`. The palette is
  emitted as CSS tokens too (`--surface`, `--ink`, `--accent`, `--space`,
  `--radius`, …) so a project rule needing the brand colour does not invent a
  third copy of it. Verified by compiling the kit against all three theme files
  in use: byte-identical output apart from the added tokens.

- **`build/build-theme.cjs` — the theme as a separate stylesheet.** A normal
  build bakes the theme into the bundle through `modifyVars`, so changing it
  means rebuilding everything; there was no dark theme, no per-client look, no
  preview. The new helper compiles the same kit sources and keeps only the
  `:root` blocks, writing a standalone `theme.css` that loads after the bundle
  and overrides its defaults. A project without one is unaffected. Variants
  (`{ selector: ':root[data-theme="dark"]', theme: 'dark.vars.less' }`) build on
  top of the base theme rather than replacing it, and only what actually differs
  is emitted — six lines of dark palette produced 27 tokens. What it does not
  give: the values are computed ahead of time, so overriding one `--accent` in a
  browser will not move anything derived from it — less computes those when this
  file is built.

- **The editor packages' tokens became theme inputs.** 58 values in
  `@brandup/ui-messageeditor` and `@brandup/ui-richeditor` were literals inside
  `:root` — unreachable from a theme file, which is why a project wanting its own
  message colours had to redeclare the packages' tokens in its own `:root` and
  hope the packages' defaults never moved. Each package now has a `vars.less`
  (shipped and exported), and `modifyVars` reaches them like any kit input.
  Defaults are unchanged — compiled output is byte-identical — so pointing them
  at the kit's roles stays a deliberate per-project decision.

- **A theme variable the kit does not know is now reported.** `modifyVars`
  reaches exactly the names declared in the kit's own `vars.less`; anything else
  less quietly declares as an unused variable — the build passes, the value
  stays at the kit default, and the difference shows up only in a browser, if at
  all. Names are checked against the real input list, ignoring case and dashes,
  which is where these mistakes actually come from: three of the four consuming
  projects name their own variables `@Primary-Color`, and the hand writes the
  kit input the same way. A near miss is named along with what was probably
  meant. The theme's own variables — a palette it derives values from — stay
  unremarked, since warning about those would be noise. This immediately turned
  up two dead lines in the example's own theme (`@fontSize`, `@h-LineHeight`),
  fixed here; both happened to repeat the kit default, so nothing looked wrong.

- **The theme file can be split across several files.** `@import` in
  `uikit.vars.less` was not resolved: the parser read one file flat, so a
  palette pulled out into its own file simply contributed nothing. Imports are
  now expanded in place, resolved next to the importing file and then through
  package `exports` (so `@import "@brandup/ui-kit/source/adaptive.less"` works),
  read once each the way less does, and safe against a cycle. Order follows
  less: the declaration standing later in the expanded text wins. An import that
  cannot be read does not fail the build — the address may point at a file a
  package does not export, and those carry mixins rather than values — but it is
  reported, because a palette going missing in silence is exactly what this
  changes.

- **`.ui-button` — the kit finally styles a button.** It is the most common
  element on a page and the kit dressed every control around it while leaving
  the button itself bare: `inputs.less` gave a `button` its font and reset its
  padding, and each consuming project drew the rest again. A class, not a tag:
  a button is often an `<a>` (a link shaped like an action), and a `<button>`
  inside someone else's widget is not ours to restyle.

  Look, tone, size and state are separate classes that add up on one element —
  `ui-button primary danger mini`. `primary` fills with the accent, `ghost`
  drops the border and the fill, `danger` swaps the accent only (so it works
  with every look), `mini` and `wide` size it, `disabled` and `loading` are the
  states. `disabled` exists as a class because a link has no such attribute,
  and both it and `loading` block clicks. `loading` keeps the caption in place
  and turns it transparent under a spinning ring — dropping it would change the
  button's width and shove its neighbours; the caller marks the state for a
  screen reader with `aria-busy`. Keyboard focus draws a ring
  (`:focus-visible`): the kit hides `outline` on fields because their own look
  shows focus, and a button has no such look.

  Everything is set by `--button-*` variables, overridable on a subtree, and
  the ring's rotation gives way to a steady pulse under
  `prefers-reduced-motion`. The example app has a `/buttons` page with every
  combination, including one themed through variables alone.

- **A layer stack behind every overlay (`LayerManager` in `@brandup/ui-kit`).**
  A popup, a modal window and an expanded `DropDown` list are layers over the
  page, and they do turn up on top of each other — a popup inside a window, a
  list inside a popup. Each of them used to keep Esc, the held page scroll and
  the focus for itself, which is exactly what broke once two of them were open
  (see Fixed). The stack owns the three things a single layer cannot decide on
  its own: one `keydown` listener for the whole stack (Esc closes the topmost
  layer only, and a layer that handled the key itself via `preventDefault` is
  left alone), a body class counted by the number of layers that asked for it,
  and focus — trapped inside the layer and returned where it was taken from.
  Kit components are already its clients; a host builds its own layer (a
  tooltip, a side panel, a gallery) with `LayerManager.push({ close, element,
  bodyClass, trapFocus, returnFocus, closeOnEscape })` and drops it with
  `layer.release()`. `closeTop()`, `closeAll()` and `count` complete the API.

- **The modal window is now keyboard- and screen-reader-complete.** Focus is
  led into the window once the heir has filled its body (the first tabbable
  element, or the window itself when there is nothing to focus), a window that
  focused something for itself is not overridden, `Tab` and `Shift+Tab` circle
  inside the topmost window instead of walking the page under it, and closing
  returns focus where the window was opened from — before `onClosed`
  subscribers run, so a host that returns its own caret still has the last
  word. The title is bound to the dialog with `aria-labelledby`.

- **`DropDown` announces itself to a screen reader.** The view button carries
  `aria-haspopup="listbox"`, `aria-controls` with the (now generated) id of the
  list itself — not of the box around it — and `aria-expanded` — kept at `false` once closed, since the button stays a
  toggle. The list is a `role="listbox"` named by the placeholder, each item's
  focusable `span` is a `role="option"` with `aria-selected` following the
  selection, and the `li` between them is `role="presentation"` so the option
  sits where ARIA expects it.

- **The popup initiator announces its state.** Besides the
  `ui-popup-expanded` class it now carries `aria-expanded` (`true`/`false`,
  kept after closing — the button stays a toggle) and `aria-controls` with the
  popup id; a popup without an id in the markup is given one.

- **The layer ladder is set by CSS variables**, not by numbers spread over
  package files: `--layer-popup` (1000, also the richeditor toolbar),
  `--layer-dropdown` (aliases the popup tier) and `--layer-modal` (2000).

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

- **Disabled text is now mixed toward the field fill instead of lightened.**
  `@disabled--input-color` was the last less-only colour function left in the
  kit (`lighten(@input-color, 50%)`), and it raises HSL lightness by a fixed 50
  points regardless of what is behind it. On a dark theme that made disabled
  text pure white — brighter than ordinary text. It is now
  `color-mix(in srgb, var(--input-color) 38%, var(--disabled--input-fill))`,
  which moves toward the actual fill and therefore works in both directions.
  The share was picked to keep light themes where they were: the example and
  ledtrees land within a step of the old value (`#a2a2a2` → `#a0a0a0`; ledtrees
  sets the token explicitly and is untouched), while wsender's disabled text
  goes from `#afafaf` to `#a5a5a5` — slightly more contrast. With this gone,
  the kit computes no colour at build time at all.

- **Event names share one format: `ui:<control>:change`.** `dropdown-change`,
  `textbox-change`, `richeditor-change` and `messageeditor-change` are
  `ui:dropdown:change`, `ui:textbox:change`, `ui:richeditor:change` and
  `ui:messageeditor:change` — the `ui:` prefix marks them as the kit's, and the
  colon separates the control from what happened, so neither half can be
  misread as part of the other. Code that subscribed through the constant
  (now `DROPDOWN.EVENT.CHANGE` and its like) needs no edit; a host that spelled
  the old name out does.

- **Class names follow one rule: a full name for what is seen outside the
  control, a short one for what lives inside it.** `textbox-input`,
  `textbox-miniature` and `messageeditor-input` are now `ui-textbox-input`,
  `ui-textbox-miniature` and `ui-messageeditor-input`, next to the
  `ui-dropdown-input` that already had the prefix. These are the names a host
  writes in its own markup — the class on the value field hides it until the
  control is built — and the styles reach them from the top level, so each has
  to be unique on the page. The three windows of `@brandup/ui-messageeditor`
  live in `body` for the same reason and became `ui-messageeditor-randomizer`,
  `ui-messageeditor-variables` and `ui-messageeditor-variable-key`.

  The other way round: the parts that never leave the control's root dropped
  the package name they were repeating. `messageeditor-modes`, `-mode`,
  `-source`, `-source-text` and `-emoji-holder` are `modes`, `mode`, `source`,
  `source-text` and `emoji-holder` — the short shape the other controls' parts
  already had (`decorator`, `modal-window`, `emoji-group`). Two of them keep a
  qualifier because one word would collide: the emoji button is `emoji-button`,
  since the picker of `@brandup/ui-richeditor` opens inside the same root and
  its items are `.emoji`; the source-mode state on the root is `source-mode`,
  since `.source` is now the panel itself.

  `MESSAGEEDITOR.CLASS.MODAL` gained the `ROOT` / `ELEMENT` split the other
  branches have (`MODAL.ACTIONS` reads as `MODAL.ELEMENT.ACTIONS`), and the
  control's own invalid state left it for `CLASS.STATE.INVALID`, where it
  belongs — it is set on the control's root, never on a window. The convention
  is written down in the kit's README and in `@brandup/ui-kit/names`.

- **Every package declares its entries with an `exports` map.** Until now a
  package exposed its whole directory, and that is what the deep paths in the
  monorepo leaned on. Declared now: the package itself (`.`), its names
  (`./names`), the kit's environment flags (`./env`), the Less that other
  packages and hosts import (`./source/*.less`, plus the kit's `./vars.less`
  and `./build/*`), the icons (`./svg/*`) and `./package.json`. Reaching into
  `source/*.ts` from outside no longer resolves — that is the point: the paths
  a package promises are now written down, and TypeScript (`moduleResolution:
  bundler`) checks them.

- **`@brandup/ui-kit/text` — `textTag()` without the kit's entry.** The helper
  that puts a string into an element as text, never as markup, is needed by
  everything that shows text coming from outside; the message highlighter used
  to reach it through the kit's entry, bringing the popup, the modal window and
  the styles along for one function.

- **`@brandup/ui-kit/env` — the environment flags without the kit's entry.**
  `IS_TOUCH_DEVICE`, `isCoarsePointer()`, `hasUserScrolled()` and
  `resetUserScroll()`. `@brandup/ui-input` needed exactly these two checks and
  used to import them straight out of the kit's files
  (`@brandup/ui-kit/source/utils/...`) — the kit's own entry would have brought
  the popup, the modal window, the styles and `@brandup/ui-app` along for the
  ride. The path is a declared one now. Unlike `./names`, this module does have
  a side effect: it starts listening for scroll gestures on load.

- **The names of a package are reachable by their own subpath:
  `@brandup/ui-dropdown/names`.** The module holds names only and imports
  nothing, so taking a class string no longer drags the package's styles and
  code along — which is how the kit's packages now take names from each other
  (`@brandup/ui-kit/names`). The names stay available from the package entry as
  well, for code that has the package loaded anyway.

- **Every package exports its names as one object, from its own `names.ts`.**
  `UIKIT`, `DROPDOWN`, `TEXTBOX`, `RICHEDITOR`, `MESSAGEEDITOR` — one object per
  package, same shape everywhere: `CLASS` (root, value field, the `<body>` one,
  `ELEMENT` for the parts of the markup, `STATE` for what the styles watch),
  `COMMAND`, `EVENT`, `TEXT` for the captions, `VALUE` for the numbers behind
  the behaviour, plus `SYNTAX` / `STORAGE` where a package has them. The old
  `*_CLASS`, `*_COMMAND`, `CHANGE_EVENT`, `TOOLBAR_CLASS`, `MAX_EMAIL_LENGTH`,
  `SPINTAX_OPEN`, `RECENT_EMOJIS_KEY` and their like are gone — read them as
  `UIKIT.SCROLLABLE.CLASS`, `TEXTBOX.EVENT.CHANGE`,
  `MESSAGEEDITOR.SYNTAX.SPINTAX_OPEN`.

  The module holds names only and imports nothing, so a name costs a name: the
  kit's `.ui-popup` and `.ui-scrollable` used to arrive through the kit's entry,
  dragging the popup, the modal window, the styles and `@brandup/ui-app` behind
  them. Inside the controls those names are the single source as well — a class
  string can no longer drift apart from the markup or the styles.

- **`@brandup/ui-dropdown` exports its names as one object.** `ROOT_CLASS`,
  `INPUT_CLASS`, `MINIATURE_CLASS`, `CHANGE_EVENT` and the command constants
  are gone; everything the control is known by — classes (root, value field,
  miniature, the `<body>` one, the parts of its markup and its state classes),
  commands, the event, the default captions and the numbers behind its
  behaviour (search threshold, query limit, the width below which the list goes
  full-screen) — lives in `DROPDOWN`, read as `DROPDOWN.COMMAND.CLOSE` or
  `DROPDOWN.CLASS.STATE.EXPANDED`. Inside the control those names are now the
  single source too: a class string can no longer drift apart from the markup
  or the styles.

- **The package entry did not re-export the control's names at all.** The
  README taught `import { CHANGE_EVENT } from "@brandup/ui-dropdown"`, but
  `index.ts` only re-exported the default class and the transliteration
  helpers, so the import failed. The entry now re-exports the module.

- **`PopupManager.open()` no longer closes what it was asked to open.** It
  used to toggle: calling it on the popup already open closed it, so a caller
  that just wanted the popup shown — on an external event, or to re-render its
  content — had to ask `isOpened(elem)` afterwards to learn what happened. That
  behaviour is now `toggle(popupElem, options): boolean`, which returns whether
  the popup is open after the call and is what a toggle button (and the
  `ui-popup-toggle` command) wants; `open()` shows the popup and leaves an
  already-open one alone.

- **`Modal`'s closing hook is `onClosing()`.** `onClose()` and
  `onClosed(handler)` differed by one letter and by nature — one a subclass
  hook running while the window is still on screen, the other a subscription
  running once the window is gone. The hook now says when it runs.

- **Layer variables dropped the `ui-` prefix, and the modal z-index alias is
  gone.** `--ui-layer-popup` / `--ui-layer-dropdown` / `--ui-layer-modal` are
  `--layer-popup` / `--layer-dropdown` / `--layer-modal`, matching every other
  variable of the kit (`--popup-fill`, `--modal-width`, `--scrollbar-size`).
  `--modal-z-index`, which only forwarded the modal tier, is removed — the
  window reads the ladder directly.

- **Control commands carry the kit prefix.** `open-popup` / `close-popup` /
  `select` of `@brandup/ui-dropdown` are `ui-dropdown-toggle` /
  `ui-dropdown-close` / `ui-dropdown-select` (exported as `TOGGLE_COMMAND`,
  `CLOSE_COMMAND`, `SELECT_COMMAND`), and `copy-text` of `@brandup/ui-textbox`
  is `ui-textbox-copy` (`COPY_COMMAND`) — the same shape as the kit's own
  `ui-popup-toggle` and `ui-modal-close`. `select` in particular was generic
  enough to collide with a host's own command. The markup is built by the
  controls themselves, so only a host that declared these commands in its own
  markup is affected.

- **State classes on `<body>` are prefixed `body-`, and the popup's own class
  is spelled out.** `ui-popup-opened` &rarr; `body-popup-opened`,
  `ui-modal-opened` &rarr; `body-modal-opened`, `ui-dropdown-opened` &rarr;
  `body-dropdown-opened`; the class marking an open popup, until now the bare
  `opened`, is `ui-popup-opened`. The `ui-` prefix belongs to the components'
  own classes, and a class describing what the page is doing now says so in its
  name — a selector's target is obvious without looking the class up, and
  `opened` no longer risks colliding with a host's own class of that name.
  `POPUP_OPENED_CLASS` and `POPUP_OPENED_BODY_CLASS` keep their names — only
  their values changed — while `MODAL_OPENED_CLASS` is renamed
  `MODAL_OPENED_BODY_CLASS`, matching the popup constant: the name now says the
  class lives on `<body>`, not on the window. A host that referenced the
  constant, or spelled the old class names out in its own CSS or scripts,
  updates those.

- **An empty variable list in `@brandup/ui-messageeditor` is now checked like
  any other.** It used to mean "the set is not known yet" and marked nothing,
  so with personalization on every `{KEY}` looked like a working variable and
  the form went through — the editor promised a substitution nothing would
  perform. Nothing declared now means every variable in the text is foreign:
  it gets `.unknown` and blocks the submit. An app that learns its variables
  later (after an audience is picked) turns personalization on at that point;
  until then `{KEY}` is plain text. The open-list mode is unchanged — with
  `newVariables` an undeclared key is a request, not an error.

- **Boolean `data-*` attributes are read with their value.** Presence alone
  used to be enough, so `data-new-variables="false"` turned the mode on.
  `false` and `0` now mean off; an empty value, `true` and `1` mean on;
  no attribute means off. Applies to `data-personalization`,
  `data-new-variables` and `data-source`.

- **`HighlightOptions` fields renamed:** `variables` (the on/off flag) is now
  `enable`, and `names` (the declared map) is now `variables`. `LengthOptions`
  picks `enable` accordingly.

- **In `paragraph: "break"` a line is a paragraph.** The mode used to hold the
  whole message in a single `<p>` with `<br>` between the lines; now every line
  is its own `<p>` and a blank line of the message is an empty one. Enter and
  Shift/Ctrl+Enter both start a new line — a soft break has nowhere to come
  from — and the `breaks` class drops the paragraph padding so two lines never
  show a gap the message would not have. Soft breaks arriving from outside (a
  pasted document, a foreign value) are split into the same model. The stored
  value is unchanged in shape: a paragraph border serializes to a single `\n`,
  a blank line to `\n\n`, and values round-trip through the editor untouched.
  A block button over several selected lines now makes one quote or code block
  instead of one per line.

- **A block button over a selection that already contains a block of that type
  no longer reorders the lines.** The merged block was built in place of the
  first line of a different type, so a quote or code block sitting in the middle
  of the selection ended up after the merged content.

- **The caret survives turning a multi-line block back into plain text.** The
  lines were split into paragraphs after the caret had been restored, and a
  live range does not survive the block being replaced — the caret dropped to
  the start of the field.

- **A field left with nothing but empty lines clears itself.** The value was
  already empty, but the paragraphs stayed, so the placeholder never came back.

- **Pasting over the whole field no longer leaves an empty line above and below
  the pasted text.** A selection that starts in one paragraph and ends in
  another takes their content but not the paragraphs themselves — they are only
  partially covered — and the paste landed between the two empty shells. The
  shells are now collapsed into the one the editing continues in.

- **A blank line pasted from a document survives.** Mail and word processors
  separate paragraphs with a `&nbsp;`-only paragraph; trimming left an empty
  text node behind, the paragraph was not recognized as empty, and the line was
  lost when the blocks were joined — the pasted text collapsed into one solid
  paragraph. Emptiness is now decided by content, not by the presence of nodes.

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
  / `TextBox` declare their own event maps (`"ui:dropdown:change"` /
  `"ui:textbox:change"`).
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

- **Comments in `uikit.vars.less` were read as declarations.** The theme file —
  the one place a project retunes the kit — was parsed line by line by a single
  regular expression matching `@name: value;` anywhere in a line, comments
  included. A declaration behind `//` or inside `/* */` was collected like a
  real one, and since a later assignment overwrote an earlier one, commenting a
  variable out to fall back on the kit default did the opposite: it switched the
  commented value on, as soon as it stood below the working line. The same
  expression took the value up to the *last* `;` in the line, so a trailing
  comment containing one landed inside the value —
  `@input-height: 46px; // was @input-height: 80px;` parsed as
  `46px; // was @input-height: 80px`. Comments are now stripped before anything
  is read, and `//` inside an address (`url(https://…)`, `url(//cdn…)`) is left
  alone.

- **A value spanning several lines was dropped without a word.** Reading line by
  line only ever saw a declaration that opened and closed on one line, so a
  wrapped shadow or font stack matched nothing at all — no error, no warning,
  the variable simply never reached `modifyVars` and the theme fell back to the
  kit default. Declarations are now cut on `;` at the top level with braces,
  parentheses and quotes tracked, so a wrapped value survives; `@import` rules
  and detached rulesets are skipped, since neither can be handed to
  `modifyVars`.

- **The "file not found" error always named `uikit.vars.less`.** The path
  actually looked for was missing from the message, though a project may pass
  its own (`parseLessVars('../wsender-ui/uikit.vars.less')`). It names the path
  now. All of the above is covered by regression tests, and the three theme
  files in use (example, wsender, ledtrees) parse to exactly the same values as
  before.

- **A `javascript:` address typed into the link panel reached the DOM.** The
  address went into `href` unchecked, so the editable held a live
  `<a href="javascript:…">` and `currentLink` reported it — a middle click or
  "Open link" from the context menu runs it, and the href survived in undo
  snapshots. Serializing already dropped such a link, so the value was never
  affected. The check (`safeUrl`, now its own module and exported) moved to the
  DOM writes themselves — `applyLink` and the formatted insert — so every path
  into the markup goes through one rule: value, paste and panel alike. An
  unsafe address counts as empty: no link is created, and one whose address is
  changed to an unsafe one is removed.

- **`@brandup/ui-messageeditor` put the fields-setup address into `href`
  unchecked.** `variablesSetup` (and the `data-variables-setup` attribute a
  server usually prints) accepted `javascript:`, and the link in the
  personalization window executed it on click. The address now goes through the
  same `safeUrl`; a rejected one is dropped with a console message, so the row
  is not rendered at all and the setup no longer implies personalization.

- **`DropDown` buttons had no `type`, so a form treated them as submit.** The
  view, cancel and header-close buttons defaulted to `type="submit"`: a click
  was harmless (the command system prevents it), but pressing Enter in a text
  field of the surrounding form activated the default button — opening the list
  instead of submitting. Every button of the kit now declares `type="button"`.

- **The icon-only close button of the list had no accessible name.** A screen
  reader read it as just "button". It takes the cancel text (`data-cancel`) as
  its `title` — the same action, the same wording.

- **Esc closed everything that was open, not the topmost layer.** Every layer
  hung its own `keydown` listener on the document and none of them stopped the
  key, so one press reached all of them: a popup opened over a modal window
  took the window down with it, and two nested windows both closed. Esc now
  goes through the layer stack and closes one layer — the topmost.

- **A closed layer released a page another layer was still holding.** The body
  class (`body-modal-opened`, `body-popup-opened`, `body-dropdown-opened`) was added
  and removed by each layer for itself: closing the inner of two windows — or a
  popup raised over a window — gave the page its scroll back while the window
  under it was still open. The class is now counted and removed by the last
  layer that asked for it.

- **A `DropDown` list left open by another dropdown kept its listeners.**
  Opening a list stripped the `expanded` class off any other expanded dropdown
  in the document but left its close listeners on `body` and (now) its layer in
  the stack. The previous list is closed properly instead. Esc in a list also
  clears its search now, the way closing by a press outside always did.

- **Navigation left layers hanging over the new page.** The middleware closed
  the popup only; a modal window survived the navigation together with the page
  scroll it held. It now closes the whole stack top-down.

- **A message editor never validated its initial value.** The unknown-variable
  constraint was applied on change only, and native constraint validation runs
  before the `submit` event — so a server-rendered field holding `{TYPO}` was
  submitted once before the field ever went invalid. The constraint is now
  applied when the control is built.

- **A construct split by inline formatting was invisible to the editor.**
  Braces typed around an already bold word (`{` + `<b>NAME</b>` + `}`) left the
  construct in three nodes: highlighting and the name-to-key mapping both walk
  text nodes and saw nothing, the value went out as `{**NAME**}` — which no
  substitution can resolve — and the markup was rebuilt on every keystroke
  because the text matched a construct the wrappers did not. Such a construct
  is now joined into one text node before parsing (`joinSplitMarkup`), and the
  formatting inside it is dropped: markup goes around a construct, never in it.

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
