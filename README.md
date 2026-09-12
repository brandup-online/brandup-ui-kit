# brandup-ui-kit

Набор UI-компонентов на TypeScript для веб-приложений на базе `@brandup/ui-app`. Пакеты поставляются в виде TypeScript-исходников и Less-стилей, обрабатываются бандлером проекта (webpack, vite и др.).

[![Build Status](https://dev.azure.com/brandup/BrandUp%20Core/_apis/build/status%2FBrandUp%2Fbrandup-ui-kit?branchName=main)](https://dev.azure.com/brandup/BrandUp%20Core/_build/latest?definitionId=81&branchName=main)

## Пакеты

| Пакет | Описание |
| --- | --- |
| [@brandup/ui-kit](npm/brandup-ui-kit/README.md) | Базовые стили, PopupManager, middleware и CSS-переменные |
| [@brandup/ui-input](npm/brandup-ui-input/README.md) | Абстрактный базовый класс для элементов ввода |
| [@brandup/ui-richeditor](npm/brandup-ui-richeditor/README.md) | Редактор текста на базе `contenteditable`: форматирование, панель инструментов, HTML/Markdown |
| [@brandup/ui-textbox](npm/brandup-ui-textbox/README.md) | Компонент текстового поля (`input`, `textarea`) |
| [@brandup/ui-messageeditor](npm/brandup-ui-messageeditor/README.md) | Ввод сообщения в виде плашки чата |
| [@brandup/ui-dropdown](npm/brandup-ui-dropdown/README.md) | Компонент выпадающего списка (`select`) |

## Подключение

Пакеты поставляются исходниками, поэтому бандлер проекта нужно настроить — рабочие конфигурации
webpack и vite, а также список входов темы: [@brandup/ui-kit](npm/brandup-ui-kit/README.md#установка)
и [TOKENS.md](npm/brandup-ui-kit/TOKENS.md).

## Локализация

Подписи контролов по умолчанию английские; русский словарь возит каждый пакет, у которого есть
подписи. Приложение объявляет свои тексты один раз при старте:

```typescript
import { setTexts } from "@brandup/ui-kit/i18n";
import dropdownRu from "@brandup/ui-dropdown/locale/ru.json";

setTexts(dropdownRu);
```

Подробнее — [@brandup/ui-kit](npm/brandup-ui-kit/README.md#локализация).

## Версии

Версия пакета — номер сборки CI (`autonpm-version` подставляет `Build.BuildNumber`), а не semver:
по смене номера нельзя понять, ломающее обновление или нет. Что изменилось и что придётся
поправить у себя — в [CHANGELOG.md](CHANGELOG.md); ломающие изменения помечены там словом
**Migration**. Обновляясь, фиксируйте версию точно и читайте changelog.

## Пример

Открыть [пример](npm/brandup-ui-example/README.md) использования пакетов.
