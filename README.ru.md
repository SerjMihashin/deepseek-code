<div align="center">
  <br/>
  <h1>🦊 DeepSeek Code</h1>
  <p><strong>Open-source AI-агент для разработки в терминале — дешевле Copilot, мощнее обычного шелла</strong></p>

  <p>
    <a href="https://github.com/SerjMihashin/deep-code/blob/master/LICENSE">
      <img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="License"/>
    </a>
    <img src="https://img.shields.io/badge/TypeScript-5.7-blue" alt="TypeScript"/>
    <img src="https://img.shields.io/badge/build-passing-brightgreen" alt="Build"/>
    <img src="https://img.shields.io/badge/DeepSeek-API-orange" alt="DeepSeek"/>
    <img src="https://img.shields.io/badge/status-alpha-yellow" alt="Status"/>
  </p>

  <p>
    <a href="README.md">English</a> · <b>Русский</b>
  </p>
  <br/>
</div>

---

## Почему DeepSeek Code?

| | DeepSeek Code | GitHub Copilot | Claude Code |
|---|---|---|---|
| **Стоимость** | ~$0.001/запрос | $10–19/мес | $20+/мес |
| **Работает в терминале** | ✅ | ❌ | ✅ |
| **Редактирование файлов** | ✅ | ✅ | ✅ |
| **Автоматизация браузера** | ✅ | ❌ | ❌ |
| **Открытый исходный код** | ✅ | ❌ | ❌ |
| **Self-hosted** | ✅ | ❌ | ❌ |

**DeepSeek API стоит ~в 30 раз дешевле GPT-4** — сотни сессий за цену одного месяца Copilot.

---

**DeepSeek Code** — открытый AI-агент, который работает прямо в вашем терминале.  
Читает проект, редактирует файлы, выполняет команды, ищет по коду и даже управляет браузером — всё через обычный чат.

```
Вы: "Найди утечку памяти в server.ts и исправь"
  → read_file("server.ts")
  → grep_search("EventEmitter|listener|removeListener")
  → edit("server.ts")   ← показывает diff, просит подтверждение
  → run_shell_command("npm test")
  ✅ "Исправлено: EventEmitter listener не удалялся в cleanup()"
```

---

## ✨ Возможности

| | |
|---|---|
| 🧠 **Автономный агент** | Читает файлы, пишет код, выполняет команды — планирует и исполняет многошаговые задачи |
| 🖥️ **Красивый TUI** | Полноценный интерфейс в терминале: стриминг, цепочка инструментов, синтаксис |
| 🔒 **4 режима разрешений** | Plan · Default · Auto-Edit · Turbo — вы выбираете уровень автономии |
| 🌐 **Автоматизация браузера** | Открывать страницы, кликать, заполнять формы, скриншоты, консоль — Chrome встроен |
| 🧩 **MCP-протокол** | Подключение внешних серверов инструментов (БД, файловые системы, кастомные) |
| 🧠 **Долгосрочная память** | `/remember` — AI запоминает контекст проекта между сессиями |
| 📋 **Code Review** | `/review` — анализирует код на баги, уязвимости, проблемы производительности |
| 🎨 **6 тем** | Default dark · Light · Dracula · Nord · Solarized · Matrix |
| 🌍 **3 языка** | English · Русский · 中文 |
| 📊 **Метрики токенов** | Реальный учёт стоимости, % использования контекста, тайминг |
| ⏰ **Планировщик** | `/loop 5m "проверить сборку"` — повторяющиеся фоновые задачи |
| 🤖 **CI/CD режим** | `--headless --json` — pipe-friendly вывод для автоматизации |

---

## 🚀 Быстрый старт

```bash
# Установить глобально
npm install -g deep-code

# Или запустить без установки
npx deep-code
```

При первом запуске мастер настройки проведёт через:
1. Выбор языка (English / Русский / 中文)
2. Ввод [DeepSeek API-ключа](https://platform.deepseek.com/api_keys) — есть бесплатный тариф
3. Выбор режима разрешений
4. Начало работы

```bash
deep-code             # интерактивный режим
dsc                    # короткий алиас
dsc -p "Исправь баг"  # одиночный запрос
dsc --turbo            # авто-подтверждение всего
dsc --headless --json  # CI/CD режим с JSON-выводом
dsc -c                 # продолжить последнюю сессию
```

---

## 🔒 Режимы разрешений

Вы всегда под контролем. Выберите, сколько автономии у AI:

| Режим | Поведение |
|---|---|
| **Plan** | Только чтение — AI анализирует, но ничего не меняет |
| **Default** | AI предлагает изменения, вы подтверждаете каждое |
| **Auto-Edit** | Правки файлов авто-одобряются, shell-команды требуют подтверждения |
| **Turbo** | Полностью автономно — всё выполняется без вопросов |

Переключайте режим клавишей `Tab` — даже пока агент работает.

---

## 🌐 Автоматизация браузера

Браузер — полноценный встроенный инструмент, не плагин:

```
> Открой github.com и сделай скриншот трендовых репозиториев
> Заполни форму входа на localhost:3000
> Нажми "Отправить" и проверь сетевые запросы
> Прочитай консоль браузера на предмет ошибок JavaScript
```

Поддерживает: `open` · `click` · `fill` · `screenshot` · `eval` · `scroll` · `wait` · `network` · `console` · `cookies` · `storage` и другие.

---

## ⌨️ Команды

| Команда | Описание |
|---|---|
| `/help` | Показать все команды |
| `/remember <текст>` | Сохранить в память AI |
| `/forget` | Очистить память |
| `/memory` | Список воспоминаний |
| `/review` | Code review |
| `/checkpoint` | Сохранить git-чекпоинт |
| `/restore` | Восстановить чекпоинт |
| `/theme` | Сменить тему |
| `/lang` | Сменить язык |
| `/git <команда>` | Git-операции |
| `/loop <интервал> <задача>` | Повторяющиеся задачи |
| `/sandbox` | Выполнение через Docker |
| `/mcp` | Управление MCP-серверами |
| `/stats` | Статистика сессии |
| `/clear` | Очистить чат |

---

## ⚙️ Конфигурация

```bash
# Переменные окружения
export DEEPSEEK_API_KEY="sk-..."
export DEEPSEEK_MODEL="deepseek-chat"
```

Или создайте `.deepseek-code/settings.json` в корне проекта:

```json
{
  "apiKey": "sk-...",
  "model": "deepseek-chat",
  "approvalMode": "default",
  "temperature": 0.7
}
```

---

## 📁 Архитектура

```
src/
  cli/    — Точка входа, Commander CLI, headless-режим
  core/   — Агент-цикл, память, сессии, MCP, i18n, метрики
  api/    — DeepSeek API клиент со стримингом и function calling
  tools/  — read · write · edit · bash · glob · grep · chrome
  ui/     — Ink/React TUI (чат, ввод, статус-бар, карточки инструментов)
  config/ — Загрузка конфига и дефолты
```

---

## 🛡️ Безопасность

- **Режимы разрешений** — выбирайте уровень автономии AI
- **Санитизация команд** — опасные shell-паттерны блокируются
- **Лимиты файлов** — запись ограничена 1 МБ
- **Sandbox-режим** — изолированное выполнение через Docker (`/sandbox`)
- **`.deepseekignore`** — исключайте чувствительные файлы из доступа AI

---

## 🤝 Участие в разработке

Вклад приветствуется! Смотри [CONTRIBUTING.md](CONTRIBUTING.md).

```bash
git clone https://github.com/SerjMihashin/deep-code.git
cd deep-code
npm install
npm run dev
```

---

## 📄 Лицензия

Apache-2.0 © 2026 Serj Mikhashin

---

<p align="center">
  <sub>Сделано с ❤️ и TypeScript · На базе <a href="https://deepseek.com">DeepSeek API</a></sub>
</p>
