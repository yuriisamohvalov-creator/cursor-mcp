# cursor-agent-sync-mcp

MCP-сервер, который позволяет Claude Code (или любому другому MCP-клиенту)
делегировать выполнение ограниченных задач по написанию кода локальному
[`cursor-agent`](https://cursor.com) CLI. Один инструмент —
`cursor_execute` — синхронно запускает `cursor-agent -p --output-format
json --force`, дожидается завершения и возвращает компактный отчёт: текст
ответа, `git diff --stat`, `git status --short`, код возврата и
`sessionID`.

В отличие от `orchestrate-cursor-agent-mcp` (spawn/check/reply/kill через
файловый IPC), здесь один вызов тула блокируется до готового результата —
не нужно отдельными командами проверять статус и убивать процесс. Ценой
этого теряется многотуровый диалог с subagent'ом: задача должна быть
полностью самодостаточной.

## Требования

- `cursor-agent` CLI, установленный и авторизованный (`cursor-agent status`).
- Node.js 18+.

## Установка

```bash
git clone git@github.com:yuriisamohvalov-creator/cursor-mcp.git ~/tools/cursor-mcp
cd ~/tools/cursor-mcp
npm install
```

## Подключение к Claude Code

```bash
NODE_BIN="$(which node)"
claude mcp add --scope user cursor -- "$NODE_BIN" "$HOME/tools/cursor-mcp/server.mjs"
```

Проверка:

```bash
claude mcp get cursor
# Status: ✔ Connected
```

После подключения новой сессии Claude Code (или рестарта текущей)
инструмент доступен как `mcp__cursor__cursor_execute`.

## Использование инструмента

```jsonc
{
  "task": "Add a slugify() helper in src/lib/slug.ts with tests. Acceptance: kebab-case, trims whitespace. Verify with `npm test -- slug`.",
  "cwd": "/absolute/path/to/project",
  "model": "gpt-5",            // опционально
  "timeoutMs": 900000            // опционально, по умолчанию 15 минут
}
```

Ответ:

```jsonc
{
  "ok": true,
  "exitCode": 0,
  "sessionID": "...",
  "text": "...финальный ответ модели...",
  "diffStat": "...git diff --stat...",
  "statusShort": "...git status --short..."
}
```

## Ограничения

- Одна задача — один синхронный запуск `cursor-agent`, без параллелизма
  в рамках одного вызова инструмента и без уточняющих вопросов в процессе
  (флаг `--force` заставляет агента додумывать самому, если чего-то не
  хватает).
- Долгая задача блокирует вызывающую сессию на всё время выполнения —
  контролируйте через `timeoutMs`.
- Не подменяет ревью: вызывающая сторона должна самостоятельно проверять
  `diffStat`/`statusShort`, а не доверять только полю `ok`.

## Лицензия

MIT
