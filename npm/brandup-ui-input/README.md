# @brandup/ui-input

[![Build Status](https://dev.azure.com/brandup/BrandUp%20Core/_apis/build/status%2FBrandUp%2Fbrandup-ui-kit?branchName=main)](https://dev.azure.com/brandup/BrandUp%20Core/_build/latest?definitionId=81&branchName=main)

Общая база компонентов ввода в форме: абстрактные классы `InputControl` и `EditorInputControl`, а также LESS-миксин для поля-носителя значения. Пакет ничего не рендерит сам — им пользуются `@brandup/ui-textbox`, `@brandup/ui-messageeditor` и `@brandup/ui-dropdown`.

## Установка

```bash
npm i @brandup/ui-input
```

> **Версии.** `@brandup/ui-textbox`, `@brandup/ui-messageeditor` и `@brandup/ui-dropdown` подключают из этого пакета не только TypeScript, но и LESS (см. [LESS](#less)). Пакеты кита версионируются одной сборкой CI и рассчитаны друг на друга: обновляя любой из них, обновляйте и `@brandup/ui-input`. Иначе сборка стилей падает ещё до TypeScript — на `@import` отсутствующего `input.less` либо на неизвестном миксине `.ui-input-hidden-value`.

## InputControl

`InputControl<T, TEvents>` — абстрактный класс, от которого наследуются все компоненты ввода. Расширяет `UIElementBound` из `@brandup/ui`. Параметр `T` — тип поля-носителя: `HTMLInputElement`, `HTMLTextAreaElement` или `HTMLSelectElement`.

### Свойства

| Свойство | Тип | Описание |
| --- | --- | --- |
| `form` | `HTMLFormElement \| null` | Форма, к которой привязано поле-носитель |
| `disabled` | `boolean` | Поле отключено |
| `required` | `boolean` | Поле обязательно для заполнения |
| `readonly` | `boolean` | Поле только для чтения (`readonly` или `data-readonly`) |

### Методы

| Метод | Описание |
| --- | --- |
| `validate(): boolean` | Синхронизирует значение и проверяет его нативным `checkValidity()` |
| `focus(): void` | Ведёт фокус в контрол и прокручивает его в видимую область |
| `destroy(): void` | Снимает обработчики, возвращает поле-носитель в исходное состояние и удаляет контейнер контрола |

### Поведение

- Добавляет CSS-класс `ui-input` на корневой элемент, а также `required`, `readonly`, `disabled` — по состоянию поля.
- Гасит показ нативной подсказки валидации (`invalid`): поле уведено с экрана, привязать подсказку не к чему. Само решение о валидности остаётся за браузером, а состояние видно по классу `invalid`.
- Переносит значение в поле-носитель до отправки формы — и в фазе перехвата на документе, чтобы обработчик `submit`, повешенный приложением раньше контрола, тоже увидел актуальное значение.
- `focus()` ничего не делает у выключенного контрола — как нативный `disabled` input, который игнорирует `focus()` сам. Поле только для чтения фокусируется: это его нативное поведение, текст читают, выделяют и копируют.

### Интерфейс IInputControl

```typescript
import type { IInputControl } from "@brandup/ui-input";

interface IInputControl {
    get form(): HTMLFormElement | null;
    get disabled(): boolean;
    get required(): boolean;
    get readonly(): boolean;

    validate(): boolean;
    focus(): void;
    destroy(): void;
}
```

### Защищённые члены для наследников

| Член | Описание |
| --- | --- |
| `__valueElem` | Поле-носитель значения |
| `__syncValue(): void` | Хук: довести значение до поля-носителя, если контрол держит его отдельно. Зовётся перед каждым чтением значения снаружи |
| `__focusValue(): void` | Хук: куда именно ведёт фокус контрола. По умолчанию — поле-носитель; общие проверки и прокрутку делает `focus()` |
| `__requestSubmit(): void` | Неявная отправка формы (Enter), как у обычного `input`: через `form.requestSubmit()` с первой кнопкой отправки |
| `__submitForm(): void` | Досылает форме синтетический `submit` — движкам без `requestSubmit()` |
| `static isReadonly(valueElem: HTMLElement): boolean` | Признано ли поле только для чтения: атрибут `readonly` либо `data-readonly` (последний нужен полям без нативного атрибута, например `select`). Статический, потому что режим нужен и до `super(...)` — он влияет на сборку разметки контрола |
| `static prepareValueElem(valueElem, container, inputClass)` | Переносит собственные классы поля на контейнер, а класс-скрыватель — на поле |

`ValueElemOverrides` описывает, что контрол навязал полю и что вернуть при `destroy`:

```typescript
export interface ValueElemOverrides {
    /** Класс, добавленный полю контролом (обычно уводит его с экрана). */
    class?: string;
    /** Подменённые атрибуты: имя и исходное значение (`null` — атрибута не было). */
    attrs?: [name: string, value: string | null][];
}
```

### Создание собственного компонента

```typescript
import { InputControl } from "@brandup/ui-input";

class MyInput extends InputControl<HTMLInputElement> {
    constructor(inputElem: HTMLInputElement) {
        const wrapper = document.createElement("div");
        inputElem.insertAdjacentElement("afterend", wrapper);
        wrapper.appendChild(inputElem);

        super("MyInput", wrapper, inputElem);
    }

    getValue(): string {
        return this.__valueElem.value;
    }
}
```

## EditorInputControl

`EditorInputControl<TEditor, TChangeData, TEvents>` — база контролов, где ввод идёт не в само поле, а в редактор рядом: поле-носитель уводится с экрана, но остаётся в форме (отправка, валидация, `FormData`). На нём построены `TextBox` и `MessageEditor`.

Класс берёт на себя общую механику: синхронизацию отложенного изменения редактора с полем, зеркало фокуса классом `focused` на корневом элементе, гашение нативного `change` скрытого поля, выравнивание редактора после `form.reset()` и снятие всего этого при `destroy()`. Доменное — фильтры ввода, подсветка, кнопки — остаётся в наследниках.

### Публичные методы

| Метод | Описание |
| --- | --- |
| `getValue(): string` | Значение поля-носителя; сначала доводит отложенное изменение редактора |
| `setValue(value: string): void` | Передаёт значение редактору — тот нормализует его и поднимет своё изменение |
| `hasValue(): boolean` | Есть ли непустое значение |
| `onChange(handler): void` | Подписка на событие изменения контрола (имя события задаёт `EditorControlInit.changeEvent`) |

### Защищённые члены

| Член | Описание |
| --- | --- |
| `__editor` | Редактор контрола. Появляется только после `__attachEditor` |
| `__listenerAbort` | `AbortController`, одним сигналом снимающий слушатели контрола и таймеры наследников |
| `__attachEditor(editor): void` | Передать базовому классу созданный редактор — с этого момента им владеет база |
| `__refreshValidity(): void` | Хук: освежить собственное ограничение контрола (`setCustomValidity`) на поле-носителе. Зовётся при каждой синхронизации значения |
| `static wrapValueElem(valueElem, container, inputClass, editable, disabled)` | Скрыть поле-носитель, подменить `tabindex` (в фокус попадает редактируемый элемент) и обернуть поле контейнером |

### ValueEditor

Структурный контракт редактора — ровно то, что зовёт база. Не тип из `@brandup/ui-richeditor`: этот пакет — общая база всех контролов ввода, и потребители без редактора (например, dropdown) не должны тянуть его за собой. `RichEditor` подходит под контракт как есть, но подойдёт и любая другая реализация.

```typescript
export interface ValueEditor {
    /** Редактируемый элемент — он принимает фокус вместо уведённого с экрана поля-носителя. */
    readonly editable: HTMLElement;
    /** Заменяет содержимое редактора; редактор нормализует значение и поднимает своё изменение. */
    setValue(value: string): void;
    /** Доставляет отложенное изменение немедленно — перед чтением значения извне. */
    flushChange(): void;
    /** Фокус в редактор; `atEnd` — ставить ли каретку в конец текста, если её ещё не было. */
    focus(atEnd?: boolean): void;
    destroy(): void;
}
```

### EditorControlInit

Что базовому классу нужно знать о конкретном контроле — передаётся последним аргументом `super(...)`.

```typescript
export interface EditorControlInit {
    /** Имя события изменения контрола — на него подписывает onChange. */
    changeEvent: string;
    /** Ставить ли при focus() каретку в конец текста, если её ещё не было. */
    focusAtEnd?: boolean;
}
```

### Порядок конструирования

Редактор создаёт наследник: его опции замыкаются на `this` и собираются только после `super(...)`. Сразу после создания редактор обязан уйти в `__attachEditor` — до этого момента базовый класс уже привязал элемент, повесил слушатели формы и включил авторазрушение по удалению из DOM, но редактора у него ещё нет. Методы базы этот промежуток терпят (падение конструктора наследника не оставляет на странице обработчиков, которые ломали бы отправку любой формы), но контрол без редактора не работает.

```typescript
import { EditorInputControl, type ValueEditor } from "@brandup/ui-input";

const CHANGE_EVENT = "myeditor-change";

class MyEditorControl extends EditorInputControl<MyEditor, ChangeData, MyEditorEvents> {
    constructor(valueElem: HTMLInputElement) {
        const editable = document.createElement("div");
        const container = document.createElement("div");
        container.appendChild(editable);

        // скрыть поле, подменить tabindex и обернуть контейнером
        MyEditorControl.wrapValueElem(valueElem, container, "myeditor-input", editable, valueElem.disabled);

        super("My.EditorControl", container, valueElem, { class: "myeditor-input", attrs: [] }, {
            changeEvent: CHANGE_EVENT,
        });

        this.__attachEditor(new MyEditor(editable, { value: valueElem.value }));
    }
}
```

## LESS

`source/input.less` содержит рецепт поля-носителя, уведённого с экрана: поле остаётся в форме (отправка, валидация, `FormData`), но не показывается — вводом управляет UI контрола. Общего класса у поля нет: каждый контрол вешает свой (`textbox-input`, `messageeditor-input`, `ui-dropdown-input`), поэтому рецепт оформлен миксином.

```less
@import (reference) "@brandup/ui-input/source/input.less";

.my-control-input {
    .ui-input-hidden-value();
}
```

Так его подключают `@brandup/ui-textbox`, `@brandup/ui-messageeditor` и `@brandup/ui-dropdown` — см. предупреждение о версиях в начале файла.
