<div align="center">
  <br/>
  <h1>DeepSeek Code</h1>
  <p><strong>AI coding agent в терминале для реальной работы с проектами, на базе DeepSeek API.</strong></p>

  <p>
    <a href="https://github.com/SerjMihashin/deepseek-code/blob/master/LICENSE">
      <img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="License"/>
    </a>
    <img src="https://img.shields.io/badge/TypeScript-5.7-blue" alt="TypeScript"/>
    <img src="https://img.shields.io/badge/Node-%3E%3D20-green" alt="Node >= 20"/>
    <img src="https://img.shields.io/badge/DeepSeek-API-orange" alt="DeepSeek API"/>
    <img src="https://img.shields.io/badge/status-active_development-yellow" alt="Status"/>
  </p>

  <p>
    <a href="README.md">English</a> · <b>Русский</b>
  </p>
  <br/>
</div>

DeepSeek Code (`dsc`) — это open-source CLI/TUI агент для разработки. Он запускается прямо в вашем репозитории, читает код, планирует изменения, правит файлы, запускает проверки, умеет работать с Chrome для web-проектов и честно показывает итог выполнения.

Проект активно развивается в сторону стабильного coding agent для больших кодовых баз: прозрачный live status, надежный ввод, понятные отчеты, Windows-first ergonomics и безопасная подготовка релизов.

## Зачем он нужен

| Задача | Что дает DeepSeek Code |
|---|---|
| Работать из терминала | TUI со streaming output, tool activity, статусом, токенами/стоимостью и навигацией |
| Не отдавать все на автопилот | Режимы Plan, Default, Auto-Edit и Turbo |
| Разбираться в реальном проекте | Поиск по репозиторию, чтение файлов, точечные правки, запуск build/test |
| Проверять web-флоу | Chrome automation: страницы, формы, console, network, screenshots |
| Видеть правду в отчете | Execution Summary показывает tool calls, измененные файлы, failed commands и gaps |
| Контролировать стоимость | Используется ваш DeepSeek API key, без фиксированной подписки на coding IDE |

## Установка

```bash
npm install -g @serjm/deepseek-code
```

Запуск в проекте:

```bash
dsc
```

Разовые и headless-запуски:

```bash
dsc -p "Найди, почему падают тесты, и предложи фикс"
dsc --headless --json -p "Проведи ревью этого репозитория"
npx @serjm/deepseek-code
```

Требуется Node.js 20+ и DeepSeek API key.

## Что нового в 0.4.8

- **Браузер-инструмент теперь «видит» без vision.** `observe` даёт структурный текстовый обзор страницы (заголовок, счётчики элементов, landmarks и явную проверку пустой страницы); `dom` перечисляет видимые интерактивные элементы с готовыми селекторами.
- **Клик и ввод по видимому тексту** — `click`/`fill` принимают `targetText` (+ опц. `role`, `near`), без CSS-селектора.
- **Inline-diff** для `write_file` / `edit` — цветные `+`/`-` прямо в карточке инструмента.
- **Matrix-интро при старте** — одноразовый полноэкранный «цифровой дождь», который стекает; выбранная тема сохраняется между запусками.
- **`/cost`** — сфокусированный вид расхода токенов и оценки стоимости сессии.
- **Чистка слэш-команд: 33 → 28 живых.** Удалены мёртвые (`/loop`, `/followup`, `/plan`), дубли стали алиасами (`/compress` → `/compact`, `/language` → `/lang`, `/capabilities` → `/tools`).

Ранее (0.4.5–0.4.7): память проекта и глобальная память в контексте (`DEEPSEEK.md`, быстрые заметки `#`/`##`, `/init`), ручное сжатие (`/compact`, авто-компакт выключен по умолчанию), `--continue` восстанавливает весь транскрипт, таймаут 600с для установки зависимостей/сборок.

Полная история изменений: [CHANGELOG.md](./CHANGELOG.md).

## Как выглядит рабочий сценарий

```text
Вы: "Найди, почему checkout падает после логина, и исправь"

DeepSeek Code:
  1. Находит релевантные файлы
  2. Читает auth и checkout код
  3. Вносит точечный патч
  4. Запускает подтвержденные проверки
  5. Честно пишет, что изменено, что прошло, что упало и что не проверялось
```

## Возможности

- **Agent loop**: планирование, чтение, правки, проверки и продолжение диалога.
- **TUI**: live status, streaming, tool activity, scroll/follow indicators и keyboard controls.
- **Режимы контроля**: read-only plan, ручные подтверждения, auto-edit или turbo для доверенной локальной работы.
- **Browser tools**: Chrome-проверки для UI, console errors, forms, screenshots и network behavior.
- **Память и сессии**: продолжение работы и сохранение фактов проекта через `/remember`.
- **Code review**: `/review` для поиска багов, регрессий, рисков и security-проблем.
- **Headless mode**: JSON-вывод для скриптов и CI через `--headless --json`.
- **Budget modes**: `/budget audit`, `/budget normal`, `/budget large`, `/budget off`.

## Основные команды

| Команда | Описание |
|---|---|
| `/help` | Показать команды и горячие клавиши |
| `/setup` | Настроить API key, язык, модель и режим подтверждений |
| `/model` | Сменить модель или открыть выбор модели |
| `/lang` | Сменить язык ответов |
| `/remember <text>` | Сохранить факт о проекте |
| `/memory` | Показать сохраненную память |
| `/review` | Запустить AI code review |
| `/checkpoint` / `/restore` | Сохранить или восстановить git checkpoint |
| `/budget status\|off\|audit\|normal\|large` | Явно управлять лимитами agent loop |
| `/chrome` | Управление Chrome mode |
| `/browser-test` | Запустить browser checks |
| `/stats` | Показать токены, стоимость и статистику сессии |
| `/changelog` | Читать release notes внутри CLI |

Горячие клавиши:

- `PageUp` / `PageDown`: читать историю.
- `End`: вернуться к последнему сообщению.
- `Shift+Enter` / `Alt+Enter`: новая строка во вводе.
- Mouse wheel пока не захватывается в TUI намеренно: поддержка мыши будет включаться только после отдельного безопасного исследования.

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

## Контроль и безопасность

DeepSeek Code построен вокруг явного контроля:

- **Plan**: только read-only анализ.
- **Default**: спрашивает перед правками и shell-командами.
- **Auto-Edit**: правки файлов автоматические, shell-команды требуют подтверждения.
- **Turbo**: полная автоматизация для доверенной локальной работы.

Дополнительно есть path checks, блокировка опасных команд, лимиты размера файлов, `.deepseekignore`, checkpoints, опциональный sandbox, Windows shell guidance и честный финальный отчет.

## Статус проекта

Проект находится в активной разработке. Основной фокус сейчас — довести CLI до состояния, где им реально удобно работать над большими проектами: прозрачный activity/status, стабильный TUI, надежный ввод, честные отчеты, отсутствие мусорных файлов и предсказуемый release workflow.

В планах: дальнейшая стабилизация TUI, безопасное исследование mouse wheel, large-project exams и более строгие acceptance-проверки для web-проектов.

## Разработка

```bash
git clone https://github.com/SerjMihashin/deepseek-code.git
cd deepseek-code
npm install
npm run lint
npm run typecheck
npm run build
npm test
npm pack --dry-run
```

## Лицензия

Apache-2.0 © 2026 Serj Mikhashin
