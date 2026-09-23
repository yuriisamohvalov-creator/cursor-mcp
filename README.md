# cursor-agent-sync-mcp

[![npm](https://img.shields.io/npm/v/cursor-agent-sync-mcp?label=npmjs.org&color=cb3837)](https://www.npmjs.com/package/cursor-agent-sync-mcp)
[![GitHub Packages](https://img.shields.io/badge/GitHub%20Packages-%40yuriisamohvalov--creator%2Fcursor--agent--sync--mcp-24292e?logo=github)](https://github.com/yuriisamohvalov-creator/cursor-mcp/pkgs/npm/cursor-agent-sync-mcp)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

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

### Вариант 1 — из npm (рекомендуется)

Пакет опубликован как [`cursor-agent-sync-mcp`](https://www.npmjs.com/package/cursor-agent-sync-mcp)
— полностью публичный, ставится без авторизации:

```bash
npm install -g cursor-agent-sync-mcp
```

### Вариант 2 — из исходников

```bash
git clone git@github.com:yuriisamohvalov-creator/cursor-mcp.git ~/tools/cursor-mcp
cd ~/tools/cursor-mcp
npm install
```

### Вариант 3 — из GitHub Packages

Тот же пакет также зеркалирован в GitHub Packages под именем
[`@yuriisamohvalov-creator/cursor-agent-sync-mcp`](https://github.com/yuriisamohvalov-creator/cursor-mcp/pkgs/npm/cursor-agent-sync-mcp).
**Важно:** в отличие от npmjs.org, GitHub Packages требует аутентификации
даже для доступа к пакету (репозиторий приватный) — понадобится `.npmrc`
со scoped-registry и GitHub-токеном с правом `read:packages`:

```bash
# ~/.npmrc или в проекте
echo "@yuriisamohvalov-creator:registry=https://npm.pkg.github.com" >> ~/.npmrc
npm login --registry=https://npm.pkg.github.com --scope=@yuriisamohvalov-creator

npm install -g @yuriisamohvalov-creator/cursor-agent-sync-mcp
```

## Подключение к Claude Code

При установке из npm (`npm install -g cursor-agent-sync-mcp`) бинарник
уже в `PATH`:

```bash
claude mcp add --scope user cursor -- cursor-agent-sync-mcp
```

При установке из исходников:

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
