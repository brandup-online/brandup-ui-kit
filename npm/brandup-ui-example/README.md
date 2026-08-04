# brandup-ui-example

Демонстрационное приложение для пакетов `@brandup/ui-kit`, `@brandup/ui-textbox`, `@brandup/ui-richeditor` и `@brandup/ui-dropdown`.

## Страницы

| Путь | Что демонстрирует |
| --- | --- |
| `/styles` | Базовые стили и типографика |
| `/inputs` | Элементы ввода `@brandup/ui-input` |
| `/popups` | Всплывающие окна `@brandup/ui-kit` |
| `/textbox` | `@brandup/ui-textbox`: режимы, типы ввода, счётчик, валидация, форматирование |
| `/richeditor` | `@brandup/ui-richeditor` напрямую: кнопки действий, вызов методов, форматы хранения, режимы |
| `/dropdown` | `@brandup/ui-dropdown` |

На странице `/richeditor` под каждым полем показывается живое сериализованное значение и состояние истории — видно, что уйдёт в хранилище при выбранном `storage` и наборе маркеров.

## Требования

- Node.js 18+

## Установка и запуск

```bash
npm run serve
```

Команда выполняет сборку фронтенда (webpack), компилирует серверный код (tsc) и запускает HTTPS-сервер на `https://localhost:8316`.

### Режим разработки (без сервера)

```bash
npm run watch
```

Запускает webpack в режиме watch — пересобирает фронтенд при изменении файлов.

### Только сборка фронтенда

```bash
npm run dev-build    # development-сборка
npm run build        # production-сборка
```

## SSL-сертификат

При первом запуске `npm run serve` автоматически генерируется самоподписанный сертификат в папке `sslcert/`. Папка добавлена в `.gitignore`.

Чтобы сгенерировать сертификат вручную:

```bash
npm run setup-cert
```
