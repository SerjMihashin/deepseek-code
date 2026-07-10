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

## Что нового в 0.5.0

- **Настоящие сабагенты (`run_agent`).** Агент делегирует самостоятельные подзадачи вложенным агентам со своим чистым контекстом, ограниченными инструментами и бюджетом — большие исследования не забивают основной контекст, а проверки независимы. Именованные агенты — в `.deepseek-code/agents/*.md` (`/agents`).
- **Хуки, которые реально работают.** `PreToolUse`/`PostToolUse` срабатывают вокруг каждого вызова инструмента, асинхронный запуск, глобальный + проектный `hooks.json`. `blocking`-хук может заблокировать вызов инструмента; `addOutput`-хук возвращает свой stdout модели — например, авто-линт после каждой правки (`/hooks`).
- **`@`-упоминания файлов.** Наберите `@` — живой выбор файла с учётом `.gitignore`; Tab/Enter вставляет путь.
- **Автоматизация десктопа Windows (`windows_ui`).** Любое доступное десктоп-приложение (Explorer, Photoshop, ...) превращается в текстовое дерево именованных элементов через UI Automation — агент осматривает окна, кликает кнопки и меню по имени, заполняет поля, шлёт клавиши. Без vision и без зависимостей.
- **Рой сабагентов**: несколько вызовов `run_agent` в одном сообщении выполняются параллельно — широкое исследование кодовой базы за время самой медленной ветки.
- **Скиллы, которые запускаются.** Процедуры из SKILL.md попадают в системный промпт, а `/skills <name>` исполняет их как задачу (раньше они парсились и игнорировались).
- **`/doctor`** — диагностика окружения (Node, shell, git, API-ключ, Chrome, UIA) с вердиктом; **звуковой сигнал** после задач дольше 20 секунд.
- **Контроль фоновых процессов**: `read_pid`/`list_processes` у `run_shell_command` + `/ps` — читать логи dev-сервера, не убивая его.

Ранее (0.4.5–0.4.8): восприятие браузера без vision (`observe`/`dom`, клик по видимому тексту), inline-диффы, Matrix-интро, память проекта и глобальная (`DEEPSEEK.md`, `/init`), ручное сжатие, `--continue` восстанавливает транскрипт.

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
