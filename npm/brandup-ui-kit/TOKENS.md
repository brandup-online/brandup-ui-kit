# Входы темы @brandup/ui-kit

Файл собран из [vars.less](vars.less) — править нужно его, а не эту таблицу:
`npm run docs:tokens` в пакете. Тест `tokens-doc` держит их вместе.

Колонка «CSS» — имя, под которым значение уезжает в `:root` и доступно в браузере:
его можно переопределить на живой странице или на поддереве. Пусто — значение
существует только на сборке (границы адаптива, доли для арифметики).

## ПАЛИТРА И ПРОПОРЦИИ

### Цвет

| Переменная | Умолчание | CSS | Что задаёт |
| --- | --- | --- | --- |
| `@surface` | `#fff` | `--surface` | фон страницы, полей и всплывающих поверхностей |
| `@ink` | `#222` | `--ink` | основной текст |
| `@line` | `#aaa` | `--line` | граница элемента в покое |
| `@line-hover` | `#666666` | `--line-hover` | она же под курсором |
| `@accent` | `#222222` | `--accent` | фирменный цвет: рамка в фокусе, заливка главной кнопки, переключатель |
| `@accent-contrast` | `#fff` | `--accent-contrast` | подпись поверх заливки акцентом |
| `@danger` | `#d64545` | `--danger` | тон разрушающего действия |
| `@color-success` | `green` | `--color-success` |  |
| `@color-warning` | `yellow` | `--color-warning` |  |
| `@color-error` | `red` | `--color-error` |  |
| `@color-info` | `blue` | `--color-info` |  |

### Текст

| Переменная | Умолчание | CSS | Что задаёт |
| --- | --- | --- | --- |
| `@font-family` | `system-ui, 'Segoe UI', Helvetica, 'Gill Sans', 'Verdana', 'Arial', sans-serif` | `--font-family` |  |
| `@font-size` | `14px` | `--font-size` |  |
| `@font-weight` | `400` | `--font-weight` |  |
| `@line-height` | `130%` | `--line-height` |  |
| `@h-line-height` | `130%` | `--h-line-height` |  |
| `@h-font-weight` | `600` | `--h-font-weight` | общий вес заголовков: поимённые веса ниже берутся отсюда |
| `@h1-font-size` | `56px` | `--h1-font-size` |  |
| `@h2-font-size` | `50px` | `--h2-font-size` |  |
| `@h3-font-size` | `28px` | `--h3-font-size` |  |
| `@h4-font-size` | `22px` | `--h4-font-size` |  |
| `@h5-font-size` | `18px` | `--h5-font-size` |  |

### Пропорции

| Переменная | Умолчание | CSS | Что задаёт |
| --- | --- | --- | --- |
| `@space` | `8px` | `--space` | базовый шаг: промежутки внутри элементов управления |
| `@radius` | `0` | `--radius` | скругление элементов управления — поля, кнопки |
| `@radius-overlay` | `5px` | `--radius-overlay` | скругление всплывающих поверхностей — попап, модальное окно |
| `@border-width` | `1px` | `--border-width` | толщина границы |
| `@control-height` | `46px` | `--control-height` | высота поля и кнопки: они стоят в одну строку, поэтому высота общая |
| `@control-padding-lr` | `15px` | `--control-padding-lr` | поля элемента управления слева и справа |
| `@content-max-width` | `1280px` | `--content-max-width` | максимальная ширина контентной области |
| `@content-min-width` | `320px` | `--content-min-width` | минимальная ширина контентной области |
| `@content-padding-lr` | `40px` | `--content-padding-lr` | отступы контентной области до краёв браузера |
| `@svg-size` | `20px` | `--svg-size` |  |

### Границы адаптива

| Переменная | Умолчание | CSS | Что задаёт |
| --- | --- | --- | --- |
| `@adaptive-desktop-small` | `1650px` | — |  |
| `@adaptive-notebook` | `1550px` | — |  |
| `@adaptive-notebook-small` | `1370px` | — |  |
| `@adaptive-tablet` | `1030px` | — |  |
| `@adaptive-tablet-small` | `850px` | — |  |
| `@adaptive-mobile` | `500px` | — |  |
| `@adaptive-mobile-small` | `370px` | — |  |

## ВХОДЫ КОМПОНЕНТОВ

### common

| Переменная | Умолчание | CSS | Что задаёт |
| --- | --- | --- | --- |
| `@main-background` | `var(--surface)` | `--main-background` |  |
| `@text-color` | `var(--ink)` | `--text-color` |  |
| `@h1-font-weight` | `var(--h-font-weight)` | `--h1-font-weight` |  |
| `@h2-font-weight` | `var(--h-font-weight)` | `--h2-font-weight` |  |
| `@h3-font-weight` | `var(--h-font-weight)` | `--h3-font-weight` |  |
| `@h4-font-weight` | `var(--h-font-weight)` | `--h4-font-weight` |  |
| `@h5-font-weight` | `var(--h-font-weight)` | `--h5-font-weight` |  |
| `@svg-fill` | `var(--text-color)` | `--svg-fill` |  |
| `@svg-stroke` | `none` | `--svg-stroke` |  |

### popup

| Переменная | Умолчание | CSS | Что задаёт |
| --- | --- | --- | --- |
| `@popup-fill` | `var(--main-background)` | `--popup-fill` |  |
| `@popup-color` | `var(--text-color)` | `--popup-color` |  |
| `@popup-border-style` | `solid` | `--popup-border-style` |  |
| `@popup-border-width` | `var(--border-width)` | `--popup-border-width` |  |
| `@popup-border-color` | `var(--line)` | `--popup-border-color` |  |
| `@popup-border-radius` | `var(--radius-overlay)` | `--popup-border-radius` |  |
| `@popup-box-shadow` | `0px 4px 8px 2px rgba(0, 0, 0, 0.12)` | `--popup-box-shadow` |  |
| `@popup-backdrop` | `rgba(0, 0, 0, 0.45)` | `--popup-backdrop` |  |
| `@popup-window-inset` | `20px` | `--popup-window-inset` |  |
| `@popup-window-max-width` | `540px` | `--popup-window-max-width` |  |

### modal

| Переменная | Умолчание | CSS | Что задаёт |
| --- | --- | --- | --- |
| `@modal-width` | `480px` | `--modal-width` |  |
| `@modal-padding` | `20px` | `--modal-padding` |  |

### scrollable

| Переменная | Умолчание | CSS | Что задаёт |
| --- | --- | --- | --- |
| `@scrollbar-size` | `6px` | `--scrollbar-size` |  |
| `@scrollbar-thumb` | `#8696a0` | `--scrollbar-thumb` |  |
| `@scrollbar-thumb-radius` | `3px` | `--scrollbar-thumb-radius` |  |
| `@scrollbar-thumb-min` | `30px` | `--scrollbar-thumb-min` | бегунок не короче этого — иначе на длинном содержимом в него не попасть |
| `@scrollbar-track-inset` | `6px` | `--scrollbar-track-inset` | вдоль полосы — её концы не доходят до краёв коробки |
| `@scrollbar-edge-inset` | `6px` | `--scrollbar-edge-inset` | поперёк полосы — она сама отходит от края коробки |
| `@scrollbar-gutter` | `stable` | `--scrollbar-gutter` |  |

### inputs

| Переменная | Умолчание | CSS | Что задаёт |
| --- | --- | --- | --- |
| `@placeholder-font-weight` | `inherit` | `--placeholder-font-weight` |  |
| `@placeholder-font-style` | `inherit` | `--placeholder-font-style` |  |
| `@placeholder-color` | `inherit` | `--placeholder-color` |  |
| `@input-border-width` | `var(--border-width)` | `--input-border-width` |  |
| `@input-border-color` | `var(--line)` | `--input-border-color` |  |
| `@input-border-type` | `solid` | `--input-border-type` |  |
| `@input-border-radius` | `var(--radius)` | `--input-border-radius` |  |
| `@input-fill` | `var(--surface)` | `--input-fill` |  |
| `@input-width` | `auto` | `--input-width` |  |
| `@input-height` | `var(--control-height)` | `--input-height` |  |
| `@input-padding-lr` | `var(--control-padding-lr)` | `--input-padding-lr` |  |
| `@textarea-size` | `100px` | `--textarea-size` |  |
| `@input-color` | `var(--text-color)` | `--input-color` |  |
| `@input-font-size` | `var(--font-size)` | `--input-font-size` |  |
| `@input-line-height` | `1.4rem` | `--input-line-height` |  |
| `@input-font-weight` | `inherit` | `--input-font-weight` |  |
| `@input-font-style` | `inherit` | `--input-font-style` |  |
| `@hover--input-border-color` | `var(--line-hover)` | `--hover--input-border-color` |  |
| `@hover--input-fill` | `var(--surface)` | `--hover--input-fill` |  |
| `@hover--input-color` | `inherit` | `--hover--input-color` |  |
| `@hover--input-toolbar-button-darken` | `8%` | — | на сколько кнопка тулбара темнее --input-fill при наведении |
| `@focus--input-border-color` | `var(--accent)` | `--focus--input-border-color` |  |
| `@focus--input-fill` | `var(--input-fill)` | `--focus--input-fill` |  |
| `@focus--input-color` | `inherit` | `--focus--input-color` |  |
| `@readonly--input-fill` | `#f7f7f7` | `--readonly--input-fill` |  |
| `@readonly--input-color` | `var(--input-color)` | `--readonly--input-color` |  |
| `@disabled--input-border-color` | `var(--line)` | `--disabled--input-border-color` |  |
| `@disabled--input-fill` | `#eee` | `--disabled--input-fill` |  |
| `@disabled--input-color` | `color-mix(in srgb, var(--input-color) 38%, var(--disabled--input-fill))` | `--disabled--input-color` |  |
| `@invalid--input-border-color` | `var(--color-error)` | `--invalid--input-border-color` |  |
| `@invalid--input-fill` | `rgb(255, 220, 220)` | `--invalid--input-fill` |  |
| `@invalid--input-color` | `inherit` | `--invalid--input-color` |  |
| `@incorrect--input-fill` | `rgb(255, 220, 220)` | `--incorrect--input-fill` |  |
| `@incorrect--input-color` | `inherit` | `--incorrect--input-color` |  |
| `@expanded--input-fill` | `var(--surface)` | `--expanded--input-fill` | variables for the dropdown |
| `@expanded--input-color` | `inherit` | `--expanded--input-color` |  |
| `@hasvalue--input-fill` | `var(--surface)` | `--hasvalue--input-fill` | variables for a chosen value |
| `@hasvalue--input-color` | `var(--input-color)` | `--hasvalue--input-color` |  |
| `@checkbox-size` | `20px` | `--checkbox-size` |  |
| `@checkbox-fill-checked` | `var(--accent)` | `--checkbox-fill-checked` | fill of a ticked control |
| `@checkbox-mark` | `var(--accent-contrast)` | `--checkbox-mark` | tick and dash over the fill |
| `@checkbox-mark-width` | `2px` | `--checkbox-mark-width` | thickness of the tick |
| `@hover--checkbox-tint` | `@hover--button-tint` | `--hover--checkbox-tint` |  |
| `@radio-dot` | `var(--accent-contrast)` | `--radio-dot` | dot inside a ticked radio |
| `@toggler-height` | `30px` | `--toggler-height` |  |
| `@toggler-padding` | `3px` | `--toggler-padding` |  |
| `@toggler-round-fill` | `var(--focus--input-border-color)` | `--toggler-round-fill` |  |

### buttons

| Переменная | Умолчание | CSS | Что задаёт |
| --- | --- | --- | --- |
| `@button-height` | `var(--input-height)` | `--button-height` | a button stands in line with text fields, so the height is shared |
| `@button-height-mini` | `32px` | `--button-height-mini` |  |
| `@button-padding-lr` | `var(--input-padding-lr)` | `--button-padding-lr` |  |
| `@button-padding-lr-mini` | `10px` | `--button-padding-lr-mini` |  |
| `@button-gap` | `var(--space)` | `--button-gap` | between the icon and the label |
| `@button-radius` | `var(--input-border-radius)` | `--button-radius` |  |
| `@button-border-width` | `var(--input-border-width)` | `--button-border-width` |  |
| `@button-border-color` | `var(--input-border-color)` | `--button-border-color` |  |
| `@button-fill` | `var(--input-fill)` | `--button-fill` |  |
| `@button-color` | `var(--text-color)` | `--button-color` |  |
| `@button-font-size` | `var(--input-font-size)` | `--button-font-size` |  |
| `@button-font-weight` | `500` | `--button-font-weight` | чуть плотнее текста страницы: подпись кнопки читают, а не вчитываются |
| `@button-accent` | `var(--focus--input-border-color)` | `--button-accent` | fill of the primary button |
| `@button-accent-color` | `var(--accent-contrast)` | `--button-accent-color` | label on a filled button |
| `@button-spinner-size` | `16px` | `--button-spinner-size` |  |
| `@hover--button-tint` | `12%` | `--hover--button-tint` | насколько темнее заливка под курсором |
| `@active--button-tint` | `20%` | `--active--button-tint` | и в момент нажатия |
| `@danger--button-accent` | `var(--danger)` | `--danger--button-accent` | tone of a destructive action |
| `@disabled--button-opacity` | `0.5` | `--disabled--button-opacity` |  |
| `@focus--button-ring-width` | `var(--focus-ring-width)` | `--focus--button-ring-width` |  |
| `@focus--button-ring-offset` | `var(--focus-ring-offset)` | `--focus--button-ring-offset` |  |
| `@focus--button-ring-color` | `var(--focus-ring-color)` | `--focus--button-ring-color` |  |

### focus ring

| Переменная | Умолчание | CSS | Что задаёт |
| --- | --- | --- | --- |
| `@focus-ring-width` | `2px` | `--focus-ring-width` |  |
| `@focus-ring-offset` | `2px` | `--focus-ring-offset` |  |
| `@focus-ring-color` | `var(--accent)` | `--focus-ring-color` |  |
