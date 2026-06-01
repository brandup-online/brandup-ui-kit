# brandup-ui-example

Демонстрационное приложение для пакетов `@brandup/ui-kit`, `@brandup/ui-textbox` и `@brandup/ui-dropdown`.

## Требования

- Node.js 18+

## Установка и запуск

```
npm run serve
```

Команда выполняет сборку фронтенда (webpack), компилирует серверный код (tsc) и запускает HTTPS-сервер на `https://localhost:8316`.

### Режим разработки (без сервера)

```
npm run watch
```

Запускает webpack в режиме watch — пересобирает фронтенд при изменении файлов.

### Только сборка фронтенда

```
npm run dev-build    # development-сборка
npm run build        # production-сборка
```

## SSL-сертификат

При первом запуске `npm run serve` автоматически генерируется самоподписанный сертификат в папке `sslcert/`. Папка добавлена в `.gitignore`.

Чтобы сгенерировать сертификат вручную:

```
npm run setup-cert
```
