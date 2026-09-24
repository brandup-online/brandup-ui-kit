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

### Changed

- **A button shows the wait of its command by itself.** While an asynchronous
  command runs — its handler returned a `Promise` — `@brandup/ui` keeps the
  `executing` class on the command's element, and the kit drew nothing for it:
  the ring existed only as `loading`, which the host has to set and clear by
  hand. So every project whose buttons ran commands either wrote that code
  around each of them or copied the ring into its own stylesheet under
  `.ui-button.executing`, where it stopped following the kit. `executing` now
  shares the rule of `loading`, the reduced-motion pulse included, so a
  `.ui-button` with a `data-command` waits with no code in the project; a test
  on the compiled sheet checks that the label goes transparent on every view
  and that the ring is one rule, not two. `aria-busy` is still the host's: the
  library does not set it.

  This changes buttons that already exist, not only new ones: every
  `.ui-button` whose command returns a `Promise` now hides its label and takes
  no clicks until the promise settles — including a command that awaits
  something other than a response, such as a confirmation window it opened or
  a pause that shows a result. Such a command should not return the promise:
  start the work without awaiting it (`() => { void work(); }`), and the button
  stays as it is.

  The example's «Отправка формы» now runs an asynchronous command instead of
  toggling `loading` itself, and each of its two buttons has a command of its
  own: `@brandup/ui` refuses a second run per command, not per element, so with
  one shared command the second button silently ignored clicks while the first
  was waiting.

- **The linter is now `oxlint`, and the whole repository runs on TypeScript 7.**
  The packages had already moved to the native compiler; the root stayed on
  TypeScript 6 for one reason only — `typescript-eslint` refuses to load beside
  it ("typescript-eslint does not support TS 7.0") and takes all of
  `npm run lint` down with it, and no release of it supports the version yet.
  `oxlint` is written in Rust and never touches the compiler API, so the pin is
  gone: `eslint`, `@eslint/js`, `eslint-config-prettier`, `globals` and
  `typescript-eslint` are dropped, `eslint.config.mjs` gives way to
  `.oxlintrc.json`, and `lint` / `lint:fix` call `oxlint`. The rule set carries
  over as it stood — the `correctness` category plus the same four relaxations
  and the per-environment globals — formatting stays with Prettier, and the
  sources pass unchanged. Type-aware rules were never enabled here, so nothing
  is lost with them; `oxlint-tsgolint` can add them later and it runs on the
  same TypeScript 7.

- **What the message editor calls a variable is a property.** The term was
  renamed in the product, and the component was the last place still saying
  «переменная» — in every caption a person reads, in the README and in the
  comments. The rename is wording only: the public surface keeps its names, so
  `variables`, `data-variables`, `MessageVariable`, `unknownVariables`, the
  `.variable` classes and the `VARIABLE_*` caption keys are untouched and no
  consumer has to change anything. Russian needed more than a search and
  replace — «свойство» is neuter where «переменная» is feminine, so every
  agreeing word around it moved too, the caption of a key typed into a message
  among them («новая» → «новое»).

- **The captions the packages ship are English.** The kit spoke three languages
  at once: the dropdown answered in English, the close cross of the modal
  window, the message editor and the text editor in Russian. A published package
  has no way to know the language of the project that installs it, so it now
  ships one, and the other arrives from the application. **Migration:** a
  Russian project registers the dictionaries of the packages it uses at startup,
  `setTexts(ru)` per package (see the README); until it does, the captions
  listed in `names.ts` under `TEXT` are shown in English. A caption already set
  on a control, through a `data-*` attribute or an option, is unaffected.

- **The arrow and the field icons stop turning black on a dark theme.** Every
  state painted them with its own colour token — `--svg-fill:
  var(--hover--input-color)` in the dropdown, the same in six blocks of the
  textbox. Those tokens are the keyword `inherit`, which is right for `color`
  and wrong the moment the token reaches `fill`: there it means the parent's
  fill, and the parent is a button, whose fill is the initial black. On a light
  theme that was the text colour anyway. Both follow the label through
  `currentColor` now — for the textbox that also meant giving its action buttons
  the field's colour, a `<button>` taking its own from the browser. The states
  that mean to differ, the dimming of a read-only and a disabled control, stay
  and say so.

- **A placeholder lighter than the text it stands in for.** `@placeholder-color`
  was `inherit`, so a hint was painted in exactly the colour of a typed value
  and an empty field read like a filled one. Three packages of the set write
  `var(--placeholder-color, #999)` — the grey they expected never arrived,
  a declared token leaving no room for a fallback. It is a mix rather than a
  literal, so it follows the theme: #858585 on the light one, #898b90 on the
  dark. **Migration:** a project that liked the hint indistinguishable from the
  value sets `@placeholder-color: inherit` back in its theme.

- **The example shows the kit as it ships.** The two pages a reader goes to for
  the look of a field set `--input-font-weight`, `--placeholder-font-weight` and
  `--placeholder-color` on themselves. The names were misspelled (`weidth`), so
  the declarations were dead and nobody noticed; they are gone rather than
  corrected. The example also carried its theme twice — `uikit.vars.less` and a
  `:root` block of the same tokens with different values, which won — and the
  bundle held both (`--h1-font-size` as 56px and as 40px). The values actually
  on screen moved into the theme file.

- **The demo pages follow the dark theme.** Notes, code spans and the boxes
  showing a serialized value were painted with light literals (`#444`, `#eee`,
  `#f5f5f5`) and stayed light under the dark theme; they take the muted ink and
  the read-only field fill now. The dev certificate of the example was reissued
  properly too: selfsigned signs with SHA-1 by default and a custom `extensions`
  array replaces the defaults rather than extending them, so the certificate had
  no basicConstraints, keyUsage or extKeyUsage at all — Chrome rejected it with
  ERR_CERT_INVALID and no way past it.

- **A css test that could not fail.** `declared()` returns the declaration, a
  string, so reading `.matchable` off it always gave `undefined` and the
  assertion always held. The type error was invisible because babel-jest strips
  types without checking, and `tsc` never reached the file: the css test reads
  `node:path` while the package excluded the node types. Both fixed — which also
  unblocked `npm run build` for `@brandup/ui-dropdown`.

- **The page-wide `box-sizing` reset is opt-in again.** `reset.less` ships
  unconditionally with the package, and a universal
  `*, *::before, *::after { box-sizing: border-box }` in it re-sized every
  element of every consuming page — including markup written years ago against
  the browser default, far from anything the kit draws. A block sized
  `width: X; padding: P` silently lost `2P` of rendered width on a minor
  upgrade (the example's own loading spinner shrank from 24px to 20px). The
  kit declares `box-sizing` on its own selectors, as it did before, and a
  project that wants the single convention for its whole page imports
  `@brandup/ui-kit/source/border-box.less` knowingly.

- **A read-only choice control keeps its pointer events.** Switching them off
  removed the control from hit testing altogether, which contradicted the
  contract stated one section down: a click on a closed field was supposed to
  stay an ordinary click so the host's "why is this fixed" hint could see it,
  and for markup without a wrapping `<label>` no click ever reached the
  element at all. The toggle is cancelled by script, which is what actually
  holds the value; the cursor says the control is not for pressing, and the
  hover rules skip it so it does not answer the pointer like a working one.

- **`PopupManager.close()` takes an argument now.** It used to ignore
  everything passed to it, so `someApi.on("navigate", PopupManager.close)`
  worked by accident. The first argument is now the popup to close, and a
  stray event object silently closes nothing. Pass `() =>
  PopupManager.close()` where the function is used as a callback.

- **The editor toolbar is positioned by the kit's shared calculation.** It
  kept its own arithmetic — the same one the module in the kit was written to
  replace — so fixes to edge handling never reached it. It calls
  `positionElement` now, with `flip: false` (the toolbar belongs above the
  field) and the new `clampCross`. The dropdown list is the remaining
  hand-rolled positioner; it flips by toggling classes that its stylesheet
  acts on, so moving it to written coordinates is a redesign of its CSS
  rather than a substitution, and it is left for its own change.

- **The popup can pick its alignment and its fallback side by itself.** Choosing the *side* by the
  room available was already automatic (`flip`, on by default, recomputed on every scroll frame, so
  an open popup turns over as its button scrolls toward the bottom of the screen). Two gaps around
  it are now closed, both opt-in so nothing existing moves:

  `flipAlign` is the same idea one axis over — it swaps `start` for `end` along the side when the
  element runs off the screen with the requested alignment, and back again. `center` has no
  opposite, so both ends are tried after it. If neither end fits, the requested one stays and the
  shift presses the element in, exactly as the side does in the same situation.

  `fallback: "bestFit"` decides what happens when the element fits on neither side. The default
  (`keep`) leaves it on the side it was asked for; `bestFit` takes the side with more room, which
  is what a long menu on a short screen wants — it will be cut off either way, and the roomier side
  shows more of it. It only ever chooses between two failures: a side that fits still wins outright.

  Both measure against the edge of the screen, like everything else in this module. An element
  hanging out of its own container while still on screen is not overflow as far as they are
  concerned — that case is a deliberate `placement`, which is why the example's right-hand button
  keeps its explicit `bottom-end`.

- **`computePosition` can press an element into the screen across its side.**
  Off by default, as before — across the side the element is held to the
  anchor by the gap, and moving it there tears it away from what it belongs
  to. Wanted by a surface that belongs to a whole field rather than a point
  on it: the toolbar above the topmost line of text has nowhere to go, and
  overlapping the text beats leaving the screen.

- **Tracking an anchor no longer lays out the page twice a frame.** The
  measurement writes six inline styles and reads the layout straight back, and
  it ran on every scroll frame. It now runs on the first placement and on
  resize — while scrolling only the anchor moves, so only the coordinates are
  rewritten. The narrow-screen probe (`--popup-window-mode`, a
  `getComputedStyle` call) is likewise answered once per window width instead
  of once per frame, the disabled state clears the element once on transition
  rather than every frame, and scrolling is watched on the anchor's own
  scrollable ancestors instead of every scroll on the page in the capture
  phase.

- **Positioning survives a transformed ancestor, and gives back the styles it
  borrowed.** Coordinates are viewport ones written as `position: fixed`, but
  a `transform`, `filter` or `contain` on any ancestor makes that ancestor the
  containing block — a popup inside a page-transition wrapper landed offset by
  the wrapper's own position, sometimes off-screen. The container is detected
  and the coordinates translated into its system. And whatever inline
  `position` / `left` / `top` / `right` / `bottom` / `margin` the element
  carried before is now restored on release instead of being removed.

- **The example rebuilds its theme only when the theme changes.** The webpack
  plugin ran a full less compilation, twice over, inside every compilation —
  including every `--watch` rebuild triggered by an unrelated `.ts` edit. The
  result is cached against the theme files' own timestamps. The plugin also
  takes the public path from the hook's own data rather than recomputing it
  from `output.publicPath`, which the `HtmlWebpackPlugin` option can differ
  from — the case where the theme would point somewhere the bundle does not.

- **The kit's hover/press darkening is written once.** `color-mix(in srgb, <fill>, #000 <share>)`
  was spelled out at eight call sites across `button.less` and `inputs.less`. The shares were
  already tied together on purpose — `@hover--checkbox-tint` is defined as `@hover--button-tint` so
  that a button and a ticked checkbox answer the pointer alike — but the formula itself was not, so
  that agreement held only by luck. It now lives in `mixins.less` as `.ui-tint-fill` /
  `.ui-tint-background`. The emitted CSS is unchanged except that the primary button's hover and
  press now set `background-color` rather than the `background` shorthand, which renders the same
  and no longer resets a host's background image on hover alone.

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

- **The waiting ring of a button is pinned to its centre.** It used to be placed
  by the static position a flex container gives an absolutely positioned child,
  declaring no offsets of its own — so a `button.loading::after` rule in the
  host's stylesheet, the kind that predates the kit, handed it `left`/`top`
  and its own negative margins while the kit's rule kept the size, and the ring
  sat off-centre by the difference. It now pins all four sides and centres by
  `margin: auto`, which no such rule can shift. The example carried exactly that
  legacy rule (a 20px ring's margins under the kit's 16px one, two pixels up and
  to the left) — removed, along with the `spin` keyframes it was the only user of.

- **Two jsdom gaps that made the dropdown's tests watch a list that only looked open.** The custom
  test environment replaced `AbortController` / `AbortSignal` with node's for the sake of `fetch`,
  and jsdom checks a signal handed to `addEventListener` against *its own* class — so the dropdown
  threw at the very line where it subscribes to reposition on scroll. The throw was swallowed by the
  event dispatch, and everything after it never ran: the layer, and the listeners that close the
  list on a press outside it. `Element.prototype.scrollTo`, which the dropdown calls to scroll its
  list to the chosen option, was missing for the same reason. The environment now leaves jsdom's own
  `AbortController` in place when it has one, and `scrollTo` is stubbed beside `scrollIntoView`.
  Nothing in the suite depended on the old behaviour — the numbers are unchanged — but the open path
  is now actually exercised.

- **A second press on the dropdown's button closes the list.** The rule that closes the list on a
  press outside it counted the button as outside, so a full press there closed the list on `mouseup`
  — and the `click` right behind it found the list shut and opened it again. The list looked as if
  it never closed. The button now counts as part of the control, like the list itself, and closing
  it by the button is left to the `toggle` command, which is whose job it was all along. Closing
  that way clears the search too, as closing by an outside press and by Escape already did.

- **The dropdown recalculates its side no more often than a frame.** The listener that repositions
  the open list sits in the capture phase, so it fires on a scroll of any box on the page, and the
  calculation strips two classes and reads the geometry back twice — that is, makes the browser lay
  the page out again, on every one of those events. It is throttled to a frame now, as the kit's own
  `trackPosition` already was: only the last value of a frame survives to the paint anyway.

- **The example stopped cutting off everything that opens downwards.** `.app`, the container every
  page renders into, carried `overflow: hidden`. The specification turns the other axis into `auto`
  when one is not `visible`, so a box meant to be clipped only sideways clipped vertically too — and
  its height is its content's height. Anything unfolding below the last element of a page was cut by
  the page's own bottom edge: the dropdown in the form at the foot of the page opened downwards and
  was shown half. It is `overflow-x: clip` now, which does not drag the other axis with it; the
  clipping is there for the page transition, which moves `.app` by a transform.

- **The dropdown reads the narrow-screen threshold off the window.** It compared
  `document.body.clientWidth` with the breakpoint its stylesheet uses in a media query, and the two
  do not measure the same thing: a media query measures the viewport, scrollbar included, while the
  body's is its own content width, with the scrollbar and the gutter the kit reserves already taken
  out. In the couple of dozen pixels between them the script took the list for a narrow-screen sheet
  while the stylesheet was showing an ordinary one, and skipped choosing a side altogether.

- **The class that turns the dropdown's list over now reaches the list.** `__positionPopup` decides
  the side and says so with a `top` / `right` class on the list element, and the rules acting on that
  class sat one level deeper — on the box inside the list — so they compiled to `.content.top` and
  matched nothing. The class went on and nothing moved, whatever the measurement said. Moved up to
  the element the script actually marks. Which element a rule lands on is invisible in a nested
  stylesheet, so it is now asked of the compiled one instead.

- **The dropdown chooses which way to open by the room around its button.** The check measured
  against `document.body.clientHeight` — the height of the page's content, not of the visible part —
  so on any long page it was satisfied by default and the list opened downwards even with its button
  against the bottom of the window. It measures the window now, and goes up only when the list does
  not fit below *and* there is more room above: on a short window it fits neither way, and turning
  over for its own sake only makes the list jump. Recalculated on scroll and resize, so the side
  changes as the button moves.

- **The dropdown's list is `ui-dropdown-popup` rather than `popup`.** A bare `popup` on an element
  inside a package is a name any page can already be using for something of its own. Read it from
  `DROPDOWN.CLASS.ELEMENT.POPUP` as before; a project that wrote the old class into its own
  stylesheet or scripts has to rename it.

- **The dropdown's list no longer keeps room for a scrollbar it is not showing.** The options list
  was `overflow-y: scroll`, which reserves the track whether or not there is anything to scroll, so
  a short list carried an empty column down its right side — and not a thin one: the kit's own
  scrollbar is `--scrollbar-size` plus the cross-axis inset on both sides. It is `auto` now, which
  every other scrollable box in the set already was. The list is a little narrower once the options
  overflow, which is the trade `auto` makes and the point of the change.

- **The dropdown's trigger answers every state the way a text field does.** It is meant to be a copy
  of the kit's field, and two states broke that. It had no read-only look at all — `InputControl`
  puts a `readonly` class on the root, and the stylesheet never drew it, so a locked dropdown was
  indistinguishable from a working one. And its focus look sat on the trigger button, which loses
  focus the moment the list opens: the accent border went out at the moment the control was most
  plainly in use. The focus look now hangs on the whole control (`:focus-within`, plus the open
  state), covering both the button reached by Tab and the open list being walked with the arrows,
  and the read-only state paints fill and text like `[readonly]` on a field while leaving the border
  to hover and focus, exactly as a field does. `hasvalue` also read the hover tokens on focus, where
  a field reads the focus ones; the two resolve to the same colour today, so nothing moves until a
  theme separates them. The read-only arrow is dimmed like a disabled one — a locked list opens
  nothing, so the affordance should not look live — and that is declared on the trigger itself: the
  arrow's `--svg-fill` is set on `.ui-dropdown .view`, and an element's own declaration beats an
  inherited one whatever the weight of the rule it came from, so the same token written in a state
  block on the root never reaches the arrow at all. That goes unnoticed in the other states, where
  the token repeats what `--input-color` already carries; read-only is the one state where the two
  differ. The match is now checked rather than asserted: `dropdown-css.test.ts` compiles both
  stylesheets, resolves the cascade, and compares the trigger with the field across ten states.

- **`clearPosition` gives back a margin the host had set on one side.** The module snapshots the
  inline properties it is about to take over so it can hand them back, and it listed the margin as
  the `margin` shorthand. That one cannot be read back: `style.getPropertyValue("margin")` answers
  with an empty string unless all four sides are set inline, so an element carrying
  `style="margin-left: 17px"` was recorded as having had no margin at all — and the restore then
  removed the shorthand, taking that 17px with it. The four sides are snapshotted separately now.
  The removal still goes through the shorthand, which is the name the module wrote it under: taking
  the longhands off one at a time undoes a shorthand in a browser but not in jsdom, where the
  `margin: 0` this module writes for measuring would have stayed on the element for good. On an
  element the module never took over `clearPosition` now does nothing at all, rather than wiping
  coordinates it did not write — that is what it did to one positioned by the host itself, and to
  any element cleared twice.
- **A read-only choice control no longer answers the pointer with its border.** The shared hover
  rule painted both border and background, and the `readonly` rule that follows it at equal weight
  repaints only the background — so a locked checkbox went on lighting its border up under the
  cursor, the one part of a working control's response it had no business showing. The hover rule
  now excludes `[readonly]`, and with it `:disabled` and `:user-invalid`: adding the first exclusion
  raises the rule above those two, which are declared with plain selectors and used to win by coming
  later, so leaving them in would have handed a disabled control the hover look and wiped the red
  border off an invalid one. The whole cascade is now checked on the compiled stylesheet
  (`inputs-css.test.ts`) rather than counted by eye.
- **The button's focus ring reads the shared offset.** It stood its ring off by the ring's own
  width — the same 2px, so the two looked interchangeable until the shared `--focus-ring-*` trio
  appeared. From then on overriding `--focus-ring-offset` moved the ring on a modal's close cross
  and left the button where it was, which is the one thing a shared token exists to prevent. The
  button has `--focus--button-ring-offset` of its own now, derived from the shared one like its
  width and colour.
- **A choice control shows the kit's focus ring.** Splitting the checkbox, the switch and the radio
  apart dropped their old `:focus` rule, which recoloured the border — on a ticked control that
  border is the accent fill, so it showed nothing. Nothing took its place, and `appearance: none`
  had already taken away whatever focus look the browser drew itself: the one element the kit draws
  by hand was left showing focus differently in every browser. It now carries the same
  `:focus-visible` ring as a button and a modal's close cross.
- **The example's theme is rebuilt when the kit's own sources change.** `UiKitThemePlugin`
  fingerprinted the two theme files of the example, while the theme is built from `vars.less` and a
  dozen more files of the kit. Editing any of them under `--watch` changed nothing: no rebuild was
  triggered, and the stale theme went on being served beside a bundle already rebuilt with the new
  values. `buildTheme` now reports every file it read, through an optional `dependencies` set, and
  the plugin fingerprints and watches all of them.

- **A closed popup leaves the layout instead of only turning invisible.** It was hidden with
  `visibility: collapse`, which keeps the box in the flow. A popup is placed by the project, usually
  beside its button — `left: calc(100% + 10px)` in the example — so an invisible closed popup went
  on sticking out where it had been put, and anything measuring around it counted it. Below the
  breakpoint an open popup becomes a window with `overflow: auto`, and a closed submenu inside it
  pushed that window's scrollable area past its own edge: the window grew a horizontal and a
  vertical scrollbar over nothing. It is `display: none` now, which also keeps a closed popup out of
  the tab order for good. Measuring is unaffected — the manager adds the opened class before it
  measures. Consumers who showed a popup by overriding `visibility` themselves have to override
  `display` instead; the kit's own packages never did.

- **On a narrow screen a popup no longer leaves only its dimming behind.** Below
  `@adaptive-tablet-small` the popup becomes a window in the middle of the screen, and that rule had
  to beat whatever a project wrote to place the popup by its button. It tried to win on weight —
  `body .ui-popup.ui-popup-opened`, chosen to outrank the two-class rules the kit's own packages
  use — but that is only (0,2,1), and any rule nested three classes deep beats it. The example app
  had one: `.page-block.popups .example .menu .ui-popup` at (0,5,0), setting
  `left: calc(100% + 10px)` for the anchored mode. Harmless on an absolutely positioned box, that
  `left` pushed the now-`fixed` popup clean off the screen, so opening the menu below the breakpoint
  showed nothing but the full-screen dimming. The geometry that defines the mode is now marked
  `!important` — a change of mode, not styling, and raising the weight instead would only move the
  line one nesting level further out. The window's own measurements stay tunable through
  `--popup-window-inset` and `--popup-window-max-width`.

- **Opening one popup no longer shows every popup after it.** Besides the popup's own
  `ui-popup-opened` class, the stylesheet had a second way to show one: a general sibling rule
  from the expanded initiator, `.ui-popup-expanded ~ .ui-popup`. `~` cannot be aimed at a single
  element — it matches every following sibling — so wherever button/popup pairs lie in a row
  (a row of menus; the example's own anchored demo, which this revision added) pressing the first
  button made every popup after it visible at once, and all but the opened one appeared wherever
  their static position happened to be, since the manager writes coordinates only for the popup it
  opened. The rule is gone; the class stays on the initiator, which is what a component styles its
  own button by while the popup is open. Guarded by a test that compiles `popup.less` and checks
  the built CSS, since no DOM test can see a selector that is never applied.

- **Closing a popup from an `onClose` callback no longer throws.** Closing
  walked the popup stack by a counter while each closed entry spliced itself
  out of it. A callback that closed further popups — `onClose: () =>
  PopupManager.close()`, the defensive pattern the editors already use —
  emptied the stack from under the loop, which then reached for an entry that
  no longer existed and threw `TypeError` out of the click or Escape handler,
  skipping the rest of the teardown: the body listener stayed armed and the
  layer was never released. Closing now walks the current top of the stack,
  and an entry is taken off it before its callback runs, so a re-entrant close
  finds nothing to do instead of racing. The separate `closing` flag and its
  `try/finally` are gone with it — being in the stack already says whether a
  popup is open.

- **A click inside a popup whose initiator wraps it no longer closes it.**
  The click handler asked "is the target inside some initiator?" before "is it
  inside some popup?". For the perfectly legal markup where the element passed
  as `initiator` contains the popup itself, every click on a menu item matched
  the first question: the popup closed and the click was cancelled, so the
  item's own command never ran. The handler now establishes which popup the
  click landed in first, and an initiator that contains that popup is not
  treated as a press on the button. The search also runs top-down, so when a
  wrapping initiator contains a submenu's button too, the submenu closes
  rather than the whole chain.

- **The editors close their own emoji panel, not every open popup.** With one
  popup at a time, `PopupManager.close()` was exact. Now that it means "close
  everything", the four call sites in the rich and message editors were tearing
  down a host popup the editor was shown in — the very nesting this revision
  added: picking an emoji inside a form popup dismissed the form. They pass
  their picker now.

- **An invalid checked choice control shows the error again.** Moving the
  shared field states into `.ui-choice-control()` put `:user-invalid` ahead of
  the equal-weight `:checked` / `:indeterminate` rules, and those repainted
  border and fill with the accent — a checked checkbox with a validation error
  looked exactly like a correct one. The invalid state is now declared after
  all three views, next to the disabled one and for the same reason, and the
  checked-hover rules exclude it so the cursor cannot paint over it either.

- **`readonly` on a choice control now holds.** HTML has no `readonly` for
  a checkbox or a radio — the browser ignores the attribute. The kit drew
  the closed look for it, but that only covered appearances: Space still
  toggled the control, and a value the host considered fixed changed
  quietly. The action is now cancelled on
  `click` (the browser turns Space on a choice control into one, so a
  single handler covers pointer, keyboard and a scripted `elem.click()`),
  in the capture phase so a host handler cannot swallow it first. The
  event itself is not stopped — a click on a closed field stays an
  ordinary click, so the host's "why is this fixed" hint still sees it.
  The cancel is armed on import of the package — not by registering the
  middleware and not by a call from application code: the closed look is
  drawn by the stylesheet, unconditionally, for everyone who includes it,
  so had the behaviour arrived separately, a project with the styles and
  no middleware would still show a control that looks closed and changes
  anyway. `aria-readonly` remains the host's to write, and this is not a
  substitute for `disabled` (a disabled value is not submitted, a
  read-only one is — which is usually the point).

- **A checked choice control responds to hover again.** The shared
  `:hover` paints border and fill in the text field's colours, but
  `:checked` outweighs it in any order — and those colours would have
  wiped the mark off a checked control anyway. A checked checkbox, radio
  or switch now darkens under the cursor by `--hover--checkbox-tint`,
  the share shared with the button.

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

### Added

- **Captions of the controls can be replaced by the application.** Every package
  of the kit declared its captions in `names.ts`, and half of them never got
  there at all: the mode buttons of the message editor, the titles of the
  formatting tools and of the emoji groups were written where the markup is
  built. Nothing outside the package could reach any of them, so a project whose
  language was not the one a package happened to ship had to either patch the
  sources or set every caption on every control by hand. The kit now carries a
  registry, `@brandup/ui-kit/i18n`: `declareTexts` is how a package declares its
  namespace of captions, `setTexts` is how an application replaces any subset of
  them, once at startup. Each package augments the typed namespace list, so a
  misspelt namespace or key does not compile and an editor completes both. A
  caption set on a control itself, a `data-*` attribute or an option, still wins
  over the application texts: it says something about that one control, while
  the texts say what the language is. The message the browser shows when an
  undeclared property is left in a message went in as well: it was a Russian
  literal handed to `setCustomValidity`, the one caption of the set a
  consumer could see but not reach. A caption reaches the markup when the
  control is built, so `setTexts` belongs next to the middleware registration,
  before the controls appear; switching the language later means rebuilding
  them. Declaring the captions of a control of your own takes the same two
  calls — see the README.

- **Russian dictionaries ship with the packages.** `@brandup/ui-kit`,
  `@brandup/ui-dropdown`, `@brandup/ui-textbox`, `@brandup/ui-richeditor` and
  `@brandup/ui-messageeditor` each carry `locale/ru.json` in the shape their
  namespace declares, so a Russian project passes the file to `setTexts` instead
  of retyping five dozen strings. A test in each package asserts the dictionary
  holds exactly the declared keys: a dictionary is not an object literal, and a
  key that went stale would otherwise pass the type check and simply never be
  read.

- **The colour mixed into a control under the pointer is a theme input.**
  `--hover--button-tint-color` and `--active--button-tint-color` (plus
  `--hover--checkbox-tint-color` and `--hover--input-toolbar-button-tint-color`,
  derived from the button one the way the shares already are) say *what* the
  shares mix in; they default to `#000`, so nothing changes for anyone already
  on the kit. A share cannot be negative — `color-mix`
  takes no such thing — so a theme whose fill is already dark had no way to
  lighten it on hover, and had to bypass the kit's response altogether. Setting
  the colour to `#fff` and picking a share now lightens through the same mixin,
  and a ticked checkbox follows the button as before. Being ordinary tokens they
  are also scoped: `.primary { --hover--button-tint-color: #fff }` lightens the
  filled button while the rest of the set keeps darkening — see the README.

- **A recipe for plugging the kit into a project.** The packages ship as
  sources, so a consumer has to transpile them — and the one place that said so
  was the example's webpack config, which nothing pointed at. `npm i` followed
  by an import ended in `Module parse failed: Unexpected token` on the kit's own
  `index.ts`. The README now carries a checked webpack config (the exclude rule,
  the theme vars, `asset/source` for svg) and a vite one, which needs the theme
  alone. Both were verified against the packed package rather than the sources
  here — including that vite does *not* need the kit excluded from
  `optimizeDeps`, as one would expect it to.

- **TOKENS.md — every theme input in one table.** There are 139 of them, and the
  full list used to be "open vars.less", including the part that matters most:
  which input is also a CSS token and can therefore be overridden on a live page
  or on a subtree. Generated by `build/build-tokens-doc.cjs` from `vars.less`
  and the components' `:root` blocks; a test compares the committed file with
  what the generator produces now, so the table cannot drift into describing
  something the kit no longer has.

- **The example shows the modal, the layer stack and `ui-scrollable`.** All three
  had a README section and nowhere to look at them. The page opens a window
  filled by its heir, one that must end in a choice, a popup that stands over an
  open window (Escape unwinding the two one at a time), and a side panel of the
  page's own that takes Escape, the held scroll, the focus trap and the focus
  return from `LayerManager.push`. Covered by tests that click the buttons
  rather than by a compile.

- **The kit positions a popup at its anchor.** `.ui-popup` was
  `position: absolute` and nothing else: every consumer wrote `top` / `left`
  by hand, and such a popup simply drove off the right edge of the screen.
  Inside the set the same problem had been solved twice and differently —
  the editor toolbar clamps itself to the edges but never flips, the
  dropdown list flips but never clamps. `position.ts` does both, in one
  place: `PopupManager.open(elem, { initiator, position: true })` puts the
  popup under the button, flips it to the opposite side when its own does
  not fit, shifts it along that side to stay inside the viewport, and keeps
  it on the anchor while it is open (scrolling any ancestor moves it along).
  Side, alignment, gap, viewport padding and the anchor itself are options;
  the calculation (`computePosition`) is exported separately for tooltips
  and menus of one's own. Off by default — a project's own `top` / `left`
  keeps working untouched. In the narrow-screen mode, where the popup is
  shown as a centred window, coordinates are not written at all; the
  stylesheet itself declares that mode through `--popup-window-mode`, so
  the breakpoint does not also live as a number in script.

- **A popup can now open inside a popup.** The manager held exactly one:
  opening a second closed the first, so a submenu, or an emoji panel inside
  an open panel, was impossible — even though the layer stack had been ready
  for it all along. Open popups are a stack now. Neighbours still evict each
  other (two menus in a header must not be open at once); kinship is decided
  by the button — one standing inside an open popup opens a child, one on
  the page opens a popup of its own. Escape takes the top layer only, the
  body class is released by the last of them, and closing goes top-down so
  focus returns along the chain. `close()` takes a popup (closing it and
  whatever it opened); `count` and `current` were added.

- **The anchored-popup demo shows what it claims.** All three buttons opened their popup with the
  default `bottom-start`, which aligns the popup's left edge with the button's left edge — so under
  the right-hand button a 220px popup hung 130px out past the block it belongs to. The right-hand
  button now asks for `bottom-end`. The page copy was wrong too: it promised a flip and a shift
  "at the edges", but those are measured against the screen, and the block sits in the middle of a
  1280px content column, so neither ever fired on a normal window. The buttons now demonstrate
  placement, and the copy says where to look for the flip and the shift.

- **A dark theme in the example app, and the palette actually used
  there.** The example's `uikit.vars.less` still spoke the pre-palette
  vocabulary (`@main-background`, `@popup-*`), and nothing in the repo
  called `buildTheme` — the two headline features of the previous
  revisions had no running demo. The theme file is now written as a
  palette, `uikit.dark.vars.less` holds the dark variant, and a small
  webpack plugin emits `theme.css` beside the bundle (as a webpack asset,
  not a hand-written file — `output.clean` would delete the latter on the
  next rebuild). A switch in the header flips `data-theme` on `<html>`;
  the choice is remembered, and an inline head script applies it before
  first paint so a dark-theme user never sees a light flash. The dark
  variant is eleven values — seven of palette plus four state fills that
  are deliberately not derived from it — because everything else follows
  the palette on its own now.

- **Component inputs now follow the palette in the browser, not at build
  time.** The palette added earlier gave the theme raw material, but the
  derivation still happened in less: `@input-border-color: @line` was
  computed during compilation and reached `:root` as a literal
  (`--input-border-color: #aaa`). The link to the palette ended there, so
  overriding `--accent` on a page moved nothing — every derived value was
  already baked. Inputs are now derived by reference to the palette's CSS
  token (`var(--line)`), which the browser resolves. A dark theme is seven
  palette values under a selector or a media query; a per-client look is
  one `:root` block; a preview is an edit on a live page — with nothing to
  rebuild. Subtree theming (`.admin-panel { --accent: … }`) starts working
  for everything derived, not only for the tokens a component reads
  directly. Naming an input explicitly still wins, exactly as before, and
  still opts that input out of the palette. What cannot move this way:
  values that end up in a media query (`@adaptive-*`) or in less
  arithmetic — neither reads a CSS variable — so the breakpoints stayed
  numbers. Verified by comparing computed values of all 140 tokens in a
  browser across three theme files before and after: identical, apart from
  the newly added `--h-font-weight`. This is what `build/build-theme.cjs`
  was written to work around; it still builds a standalone `theme.css`,
  but a project that only wants a second theme no longer needs one.

- **A checkbox that is a checkbox, a switch that says so, and a radio at
  all.** `input[type=checkbox]` was unconditionally drawn as a toggle
  switch, so a plain checkbox could not be had from the kit, and
  `input[type=radio]` was not styled at all — a radio stood in a form
  looking native next to styled fields. A screen reader read "checkbox"
  where a switch was drawn. Appearance now follows meaning, and the
  markup declares the meaning: `role="switch"` is a switch, its absence
  is a checkbox. Third checkbox state (`elem.indeterminate = true`) draws
  a dash. States are shared with the text field — hover, `readonly`,
  `disabled`, `:user-invalid`; on a disabled control the mark is dimmed
  but stays visible, otherwise a disabled checked control is
  indistinguishable from a disabled empty one. **Migration:** a
  `<input type="checkbox">` kept for the switch look needs
  `role="switch"` added, or a square checkbox appears in its place.

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

- **The positioning measures the room by what can actually be seen, not by the screen.**
  `clippingRect` walks the ancestors and narrows the screen by every one that cuts its content off,
  and the calculation takes that box through the new `boundary` option. A page wrapper with
  `overflow: hidden` is as tall as its content, so a menu unfolding below the last thing on a page
  is cut by the page's own bottom edge while the viewport still reports room to spare — and a
  calculation that asks the screen keeps the menu where it is cut. The two axes are asked
  separately: `overflow-x: clip` with `overflow-y: visible` is a real pair, and counting such a box
  as clipping both ways would take away the very room it was written to leave. A `position: fixed`
  element is laid out against the viewport, so an `overflow: hidden` on the way up does not reach it
  unless an ancestor made itself the containing block; an absolutely positioned one is reached by
  all of them, which is why the dropdown — positioned by its own classes — reads the same boundary
  through the exported helper.

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
