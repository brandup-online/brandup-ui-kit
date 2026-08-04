# @brandup/ui-messageeditor

[![Build Status](https://dev.azure.com/brandup/BrandUp%20Core/_apis/build/status%2FBrandUp%2Fbrandup-ui-kit?branchName=main)](https://dev.azure.com/brandup/BrandUp%20Core/_build/latest?definitionId=81&branchName=main)

Поле ввода сообщения, оформленное как плашка в чате мессенджера: скруглённый пузырь, растущий по содержимому.

Устроен по тому же принципу, что и [`@brandup/ui-textbox`](../brandup-ui-textbox): исходный `input`/`textarea` остаётся носителем значения и участвует в форме (валидация, `submit`, `FormData`), а ввод ведёт [`@brandup/ui-richeditor`](../brandup-ui-richeditor) в соседнем редактируемом элементе.

## Установка

```bash
npm i @brandup/ui-messageeditor
```

## Использование

```typescript
import MessageEditor from "@brandup/ui-messageeditor";

const elem = document.querySelector("textarea") as HTMLTextAreaElement;
const editor = new MessageEditor(elem);

editor.onChange(({ value }) => console.log(value));
```

Конструктор вставляет плашку на место поля и переносит само поле внутрь — оно скрыто, но остаётся в форме и хранит значение.

## Свойства

| Свойство | Тип | Описание |
| --- | --- | --- |
| `placeholder` | `string \| null` | Текст-заглушка; берётся из атрибута `placeholder` поля |

Многострочность включена всегда: сообщение — это абзацы, поэтому **Enter** создаёт новый абзац, а не отправляет форму.

Форматирование тоже включено всегда: панель с жирным, курсивом, зачёркиванием и подчёркиванием всплывает над плашкой при фокусе. Вставка смайлика вынесена из панели в собственную кнопку внутри плашки — она доступна сразу, не дожидаясь фокуса в поле. В `disabled` не строится ни панель, ни кнопка.

Состояния `disabled`, `readonly` и `required` берутся у поля-носителя, как у остальных контролов кита.

## API

| Метод | Описание |
| --- | --- |
| `getValue(): string` | Текущее значение (обрезанное по краям) |
| `setValue(value): void` | Заменить значение |
| `hasValue(): boolean` | Есть ли непустое значение |
| `validate(): boolean` | Проверка (в том числе `required`), проставляет класс `invalid` |
| `onChange(handler)` | Подписка на событие `messageeditor-change` |
| `editor` | Доступ к встроенному `RichEditor` — выделение, вставка текста |
| `destroy(): void` | Возвращает поле на место и освобождает ресурсы |

## Оформление

Разметка: корневой `.ui-messageeditor` → `.bubble` (плашка) → редактируемый элемент `.ui-richeditor` и кнопка `.messageeditor-emoji` справа от него.

Прокручивается текст, а не плашка: кнопка остаётся на месте, когда сообщение перерастает `--messageeditor-maxheight`. Панель форматирования и панель смайликов монтируются в корневой элемент и позиционируются от него, поэтому он `position: relative`.

Заливка по умолчанию своя, а не от полей ввода: белая плашка на белой странице держалась бы только на тени и почти не читалась бы.

Настраивается CSS-переменными:

| Переменная | По умолчанию | Что задаёт |
| --- | --- | --- |
| `--messageeditor-fill` | `#e7f3ff` | Заливка плашки |
| `--messageeditor-color` | `var(--input-color, #222)` | Цвет текста |
| `--messageeditor-radius` | `18px` | Скругление плашки |
| `--messageeditor-minheight` | `var(--input-line-height, 1.2rem)` | Высота содержимого пустой плашки (иначе она схлопывается в отступы) |
| `--messageeditor-maxheight` | `220px` | Высота, после которой появляется прокрутка |
| `--messageeditor-padding` | считается от `--input-height` | Внутренние отступы плашки: по вертикали такие, что пустая плашка ровно в высоту полей ввода кита, а строка стоит по центру |
| `--messageeditor-gap` | `8px` | Расстояние от текста до кнопки смайлика |
| `--messageeditor-button-size` | `32px` | Размер кнопки смайлика |
| `--messageeditor-button-icon` | `20px` | Размер иконки на кнопке |
| `--messageeditor-button-color` | `var(--placeholder-color, #999)` | Цвет иконки (в наведении и при открытой панели — акцент) |
| `--messageeditor-shadow` | `0 1px 2px rgba(0,0,0,.16)` | Тень плашки |
| `--messageeditor-border` | `var(--messageeditor-fill)` | Рамка плашки — в цвет заливки, поэтому в покое не видна |
| `--messageeditor-border-width` | `1px` | Толщина рамки |
| `--messageeditor-border-focus` | заливка, затемнённая на 12% | Рамка в фокусе |
| `--messageeditor-accent` | `var(--focus--input-border-color, #4a9eff)` | Цвет иконки смайлика при наведении и открытой панели |

Классы состояний вешаются на корневой элемент: `focused`, `invalid`, `disabled`, `readonly`.
