<div align="center">
  <br/>
  <h1>DeepSeek Code</h1>
  <p><strong>Open-source AI-агент для разработки в терминале: дешевле подписок, ближе к вашему коду, без привязки к IDE.</strong></p>

  <p>
    <a href="https://github.com/SerjMihashin/deepseek-code/blob/master/LICENSE">
      <img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="License"/>
    </a>
    <img src="https://img.shields.io/badge/TypeScript-5.7-blue" alt="TypeScript"/>
    <img src="https://img.shields.io/badge/DeepSeek-API-orange" alt="DeepSeek"/>
    <img src="https://img.shields.io/badge/status-alpha-yellow" alt="Status"/>
  </p>

  <p>
    <a href="README.md">English</a> · <b>Русский</b>
  </p>
  <br/>
</div>

---

## Коротко

DeepSeek Code — это AI-агент для разработки прямо в терминале. Он читает проект, редактирует файлы, запускает команды, делает code review, запоминает контекст и умеет управлять Chrome, когда задача выходит за пределы кода.

Он подходит, если нужен практичный локальный workflow:

- **Ниже стоимость**: используется ваш DeepSeek API key, без дорогой фиксированной подписки.
- **Реальная работа с проектом**: поиск по коду, патчи, тесты, продолжение прошлых сессий.
- **Терминальный подход**: без привязки к конкретной IDE и без отдельного облачного workspace.
- **Контроль над автоматизацией**: режимы от read-only анализа до полного turbo.

---

## Установка

```bash
npm install -g @serjm/deepseek-code
```

Запуск:

```bash
deepseek-code
```

Запуск без установки:

```bash
npx @serjm/deepseek-code
```

Короткий алиас:

```bash
dsc
dsc -p "Найди баг в auth.ts и исправь"
dsc --headless --json -p "Сделай review репозитория"
```

---

## Зачем он нужен

| Задача | Что делает DeepSeek Code |
|---|---|
| Исправить код из терминала | Читает файлы, предлагает патчи и запускает проверочные команды |
| Держать расходы под контролем | Работает напрямую через ваш DeepSeek API key |
| Работать в существующих репозиториях | Запускается там, где уже лежит код |
| Не отдавать все на автопилот | Режимы подтверждений контролируют правки и shell-команды |
| Отлаживать browser flow | Встроенный Chrome: страницы, формы, консоль, network, скриншоты |
| Не терять контекст | Память проекта и продолжение сессий помогают на длинных задачах |

---

## Что он умеет

```text
Вы: "Найди, почему checkout падает после логина, и исправь"

DeepSeek Code:
  1. Ищет релевантные файлы
  2. Читает auth и checkout код
  3. Вносит точечный патч
  4. Запускает тесты или команду после подтверждения
  5. Кратко объясняет результат
```

Основные возможности:

- **Автономный coding agent**: планирует, читает, редактирует, ищет и запускает команды.
- **Полноценный terminal UI**: streaming output, цепочка инструментов, статус, стоимость и контекст.
- **Режимы подтверждений**: Plan, Default, Auto-Edit и Turbo.
- **Автоматизация браузера**: открыть страницу, кликнуть, заполнить форму, проверить console/network, сделать screenshot.
- **MCP support**: подключение внешних tool-серверов для своих workflows.
- **Постоянная память**: сохраняйте факты проекта через `/remember`.
- **AI code review**: команда `/review` ищет баги, риски и проблемы безопасности.
- **Headless mode**: JSON-вывод для CI и скриптов через `--headless --json`.

---

## Команды

| Команда | Описание |
|---|---|
| `/help` | Показать команды |
| `/setup` | Настроить API key, язык и режим подтверждений |
| `/remember <text>` | Сохранить контекст проекта |
| `/memory` | Показать сохраненную память |
| `/review` | Запустить AI code review |
| `/checkpoint` | Сохранить git checkpoint |
| `/restore` | Восстановить checkpoint |
| `/theme` | Сменить тему |
| `/lang` | Сменить язык |
| `/git <cmd>` | Git-операции |
| `/loop <interval> <task>` | Запланировать повторяющуюся задачу |
| `/sandbox` | Запуск через Docker isolation |
| `/mcp` | Управление MCP-серверами |
| `/stats` | Статистика сессии |
| `/clear` | Очистить чат |

---

## Конфигурация

Через переменные окружения:

```bash
export DEEPSEEK_API_KEY="sk-..."
export DEEPSEEK_MODEL="deepseek-chat"
```

Или через `.deepseek-code/settings.json` в корне проекта:

```json
{
  "apiKey": "sk-...",
  "model": "deepseek-chat",
  "approvalMode": "default",
  "temperature": 0.7
}
```

---

## Контроль и безопасность

DeepSeek Code построен вокруг явного контроля:

- **Plan**: только read-only анализ.
- **Default**: спрашивает перед правками и командами.
- **Auto-Edit**: правки файлов автоматические, shell-команды требуют подтверждения.
- **Turbo**: полная автоматизация для доверенной локальной работы.

Также есть санитизация команд, лимиты размера файлов, `.deepseekignore`, checkpoints и опциональный Docker sandbox.

---

## Разработка

```bash
git clone https://github.com/SerjMihashin/deepseek-code.git
cd deepseek-code
npm install
npm run build
npm test
```

Проверить пакет:

```bash
npm pack --dry-run
npm publish --dry-run --access public
```

Опубликовать в npm:

```bash
npm login
npm publish --access public
```

Если npm просит двухфакторный код:

```bash
npm publish --access public --otp=123456
```

---

## Лицензия

Apache-2.0 © 2026 Serj Mikhashin
