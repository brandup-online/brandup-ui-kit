# brandup-ui-example

Демонстрационное приложение для пакетов `@brandup/ui-kit`, `@brandup/ui-textbox`, `@brandup/ui-richeditor`, `@brandup/ui-messageeditor` и `@brandup/ui-dropdown`.

## Страницы

| Путь | Что демонстрирует |
| --- | --- |
| `/styles` | Базовые стили и типографика |
| `/inputs` | Элементы ввода `@brandup/ui-input` |
| `/popups` | Всплывающие окна `@brandup/ui-kit` |
| `/buttons` | Кнопки `@brandup/ui-kit`: виды, тона, размеры, состояния |
| `/modal` | `Modal`, стек слоёв (`LayerManager`) и прокручиваемая область `ui-scrollable` |
| `/textbox` | `@brandup/ui-textbox`: режимы, типы ввода, счётчик, валидация, форматирование |
| `/richeditor` | `@brandup/ui-richeditor` напрямую: кнопки действий, вызов методов, форматы хранения, режимы, блоки |
| `/messageeditor` | `@brandup/ui-messageeditor`: плашка сообщения, переменные, рандомизация, блоки, состояния |
| `/dropdown` | `@brandup/ui-dropdown` |

На страницах `/richeditor` и `/messageeditor` под каждым полем показывается живое сериализованное значение (а у редактора — и состояние истории): видно, что уйдёт в хранилище при выбранном `storage` и наборе маркеров.

## Требования

- Node.js 18+

## Установка и запуск

```bash
npm run serve
```

Команда выполняет сборку фронтенда (webpack), компилирует серверный код (tsc) и запускает HTTPS-сервер на `https://localhost:8316`.

Браузер открывается автоматически. Чтобы этого не делать, передайте `--no-open`:

```bash
npm run start -- --no-open
```

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

Сертификат самоподписанный, поэтому браузер покажет предупреждение — переходить через «Дополнительно → Перейти на сайт».
Чтобы предупреждения не было, добавьте сертификат в доверенные корневые текущего пользователя (Windows покажет подтверждение):

```powershell
Import-Certificate -FilePath .\sslcert\local.crt -CertStoreLocation Cert:\CurrentUser\Root
```

Сертификат действителен год; после истечения `npm run setup-cert` перевыпустит его автоматически.

Чтобы сгенерировать сертификат вручную:

```bash
npm run setup-cert
```
