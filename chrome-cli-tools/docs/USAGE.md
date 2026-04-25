# Chrome CLI Tools — Подробное руководство

## 📖 Содержание

1. [Описание проекта](#описание-проекта)
2. [Архитектура](#архитектура)
3. [Установка](#установка)
4. [Быстрый старт](#быстрый-старт)
5. [Все команды](#все-команды)
6. [Примеры использования](#примеры-использования)
7. [API Reference](#api-reference)
8. [Troubleshooting](#troubleshooting)

---

## Описание проекта

**Chrome CLI Tools** — это набор консольных утилит для автоматизации Google Chrome через Puppeteer.

### Возможности

- 🌐 **Навигация** — открытие сайтов, вкладок, навигация по истории
- 🖱️ **Взаимодействие** — клики, ввод текста, прокрутка
- 📦 **Парсинг** — извлечение текста, HTML, выполнение JS
- 🛠️ **DevTools** — консоль, сеть, cookies, storage
- 📸 **Скриншоты** — сохранение изображений страниц
- 🎓 **Тесты** — автоматическое прохождение квизов

### Преимущества

- ✅ Работа через CLI — удобно для скриптов
- ✅ Один браузер для всех команд — экономия ресурсов
- ✅ DevTools Protocol — полный доступ к возможностям Chrome
- ✅ Минимум зависимостей — только puppeteer-core

---

## Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│                     Ваши команды                            │
│   (chrome-open, chrome-click, chrome-text, etc.)            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    .bat файлы (Windows)                     │
│   Запускают соответствующие .js скрипты через Node.js       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    JS скрипты (chrome-*.js)                 │
│   Парсят аргументы, вызывают функции из chrome-lib.js       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    chrome-lib.js                            │
│   Общая библиотека: поиск Chrome, запуск браузера           │
│   Функции: launchBrowser(), findChrome(), getPageData()     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Puppeteer Core                           │
│   Node.js библиотека для управления Chrome через CDP        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Google Chrome                            │
│   Запускается с --remote-debugging-port=9222                │
└─────────────────────────────────────────────────────────────┘
```

### Структура файлов

```
chrome-cli-tools/
├── chrome-lib.js              # ⭐ Ядро: общие функции
├── chrome-browser-start.bat   # Запуск браузера с debug-портом
│
├── chrome-tab.js/.bat         # Открытие вкладок
├── chrome-open.js/.bat        # Открыть в окне
├── chrome-nav.js              # Навигация (back/forward/refresh)
│
├── chrome-click.js            # Клик по элементу
├── chrome-fill.js             # Ввод текста
├── chrome-scroll.js           # Прокрутка
├── chrome-wait.js             # Ожидание элементов
│
├── chrome-text.js             # Извлечь текст
├── chrome-html.js             # Получить HTML
├── chrome-eval.js             # Выполнить JS
│
├── chrome-console.js          # Консоль страницы
├── chrome-network.js          # Сетевые запросы
├── chrome-storage.js          # localStorage/sessionStorage
├── chrome-cookies.js          # Cookies
│
├── chrome-shot.js             # Скриншоты
├── chrome-quiz.js             # Прохождение тестов
│
├── package.json               # Зависимости
├── README.md                  # Быстрая документация
├── docs/USAGE.md              # Это файл
└── .gitignore                 # Git ignore
```

---

## Установка

### Требования

- **Node.js** версии 18 или выше
- **Google Chrome** (установлен в стандартную папку)
- **Windows** 10 или выше

### Шаг 1: Клонируйте репозиторий

```bash
git clone https://github.com/YOUR_USERNAME/chrome-cli-tools.git
cd chrome-cli-tools
```

### Шаг 2: Установите зависимости

```bash
npm install
```

### Шаг 3 (опционально): Добавьте в PATH

Чтобы вызывать команды из любой папки:

**PowerShell (от администратора):**
```powershell
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
[Environment]::SetEnvironmentVariable("Path", "$userPath;C:\Scripts", "User")
```

После этого команды будут доступны globally:
```bash
chrome-open https://example.com
```

---

## Быстрый старт

### 1. Запустите браузер

```bash
chrome-browser-start
```

Откроется Chrome с отладочным портом 9222.

### 2. Откройте сайты в вкладках

```bash
chrome-tab https://playwright.dev https://github.com/microsoft/playwright
```

### 3. Получите данные со страницы

```bash
chrome-text https://example.com h1
chrome-eval https://example.com "document.title"
```

---

## Все команды

### 🌐 Навигация

| Команда | Описание | Пример |
|---------|----------|--------|
| `chrome-browser-start` | Запустить Chrome с debug-портом | `chrome-browser-start` |
| `chrome-tab <URL...>` | Открыть ссылки в новых вкладках | `chrome-tab https://a.com https://b.com` |
| `chrome-open <URL>` | Открыть сайт в отдельном окне | `chrome-open https://example.com` |
| `chrome-nav <URL> --back` | Назад в истории | `chrome-nav https://example.com --back` |
| `chrome-nav <URL> --forward` | Вперёд в истории | `chrome-nav https://example.com --forward` |
| `chrome-nav <URL> --refresh` | Обновить страницу | `chrome-nav https://example.com --refresh` |
| `chrome-nav <URL> --hard` | Жёсткая перезагрузка | `chrome-nav https://example.com --hard` |

### 🖱️ Взаимодействие

| Команда | Описание | Пример |
|---------|----------|--------|
| `chrome-click <URL> <selector>` | Клик по элементу | `chrome-click https://site.com ".btn"` |
| `chrome-fill <URL> <selector> <text>` | Ввод текста | `chrome-fill https://site.com "#input" "text"` |
| `chrome-scroll <URL> <selector>` | Прокрутка к элементу | `chrome-scroll https://site.com "#footer"` |
| `chrome-scroll <URL> --top` | Вверх страницы | `chrome-scroll https://site.com --top` |
| `chrome-scroll <URL> --bottom` | Вниз страницы | `chrome-scroll https://site.com --bottom` |
| `chrome-wait <URL> <selector>` | Ждать появления | `chrome-wait https://site.com ".loader"` |
| `chrome-wait <URL> <selector> --visible` | Ждать видимости | `chrome-wait https://site.com "#content" --visible` |
| `chrome-wait <URL> <selector> --hidden` | Ждать исчезновения | `chrome-wait https://site.com ".spinner" --hidden` |

### 📦 Получение данных

| Команда | Описание | Пример |
|---------|----------|--------|
| `chrome-text <URL> [selector]` | Извлечь текст | `chrome-text https://site.com "h1"` |
| `chrome-html <URL>` | Получить HTML | `chrome-html https://site.com > page.html` |
| `chrome-eval <URL> "<js>"` | Выполнить JS | `chrome-eval https://site.com "window.innerWidth"` |

### 🛠️ DevTools

| Команда | Описание | Пример |
|---------|----------|--------|
| `chrome-console <URL>` | Читать консоль | `chrome-console https://site.com` |
| `chrome-console <URL> --error` | Только ошибки | `chrome-console https://site.com --error` |
| `chrome-network <URL>` | Перехват запросов | `chrome-network https://site.com` |
| `chrome-network <URL> --api` | Только API | `chrome-network https://site.com --api` |
| `chrome-storage <URL>` | localStorage/sessionStorage | `chrome-storage https://site.com` |
| `chrome-storage <URL> --local` | Только localStorage | `chrome-storage https://site.com --local` |
| `chrome-storage <URL> --session` | Только sessionStorage | `chrome-storage https://site.com --session` |
| `chrome-cookies <URL>` | Показать cookies | `chrome-cookies https://site.com` |
| `chrome-cookies <URL> --name <n>` | Cookie по имени | `chrome-cookies https://site.com --name session` |
| `chrome-cookies <URL> --clear` | Удалить cookies | `chrome-cookies https://site.com --clear` |

### 📸 Скриншоты

| Команда | Описание | Пример |
|---------|----------|--------|
| `chrome-shot <URL>` | Сделать скриншот | `chrome-shot https://site.com` |
| `chrome-shot <URL> --output <file>` | Сохранить в файл | `chrome-shot https://site.com --output screen.png` |
| `chrome-shot <URL> --full` | Полная страница | `chrome-shot https://site.com --full` |

### 🎓 Тесты

| Команда | Описание | Пример |
|---------|----------|--------|
| `chrome-quiz <URL>` | Авто-прохождение | `chrome-quiz https://testsite.com/quiz` |
| `chrome-quiz <URL> --first` | Первый вариант | `chrome-quiz https://testsite.com/quiz --first` |
| `chrome-quiz <URL> --random` | Случайно | `chrome-quiz https://testsite.com/quiz --random` |

---

## Примеры использования

### Парсинг сайта

```bash
# Получить заголовок страницы
chrome-eval https://example.com "document.title"

# Получить текст первого h1
chrome-eval https://example.com "document.querySelector('h1').innerText"

# Получить все ссылки
chrome-eval https://example.com "Array.from(document.querySelectorAll('a')).map(a => a.href)"

# Получить мета-описание
chrome-eval https://example.com "document.querySelector('meta[name=description]').content"
```

### Мониторинг консоли

```bash
# Проверить ошибки на странице
chrome-console https://mysite.com --error

# Получить все логи
chrome-console https://mysite.com --all
```

### Анализ API

```bash
# Перехватить все API запросы
chrome-network https://api.example.com --api

# Сохранить в файл для анализа
chrome-network https://api.example.com --api > requests.json
```

### Работа с данными браузера

```bash
# Посмотреть localStorage
chrome-storage https://example.com

# Посмотреть конкретную cookie
chrome-cookies https://example.com --name sessionId

# Очистить cookies
chrome-cookies https://example.com --clear
```

### Автоматизация действий

```bash
# Кликнуть по кнопке
chrome-click https://site.com "#loadMore"

# Ввести текст в форму
chrome-fill https://site.com "#search" "запрос"

# Дождаться элемента
chrome-wait https://site.com ".results" --visible
```

### Прохождение теста

```bash
# Пройти тест (первый вариант ответа)
chrome-quiz https://testsite.com/quiz --first

# Пройти тест (случайные ответы)
chrome-quiz https://testsite.com/quiz --random
```

---

## API Reference

### chrome-lib.js

#### `launchBrowser(options)`

Запускает браузер.

**Параметры:**
- `options.headless` (boolean) — режим без интерфейса
- `options.timeout` (number) — таймаут в мс

**Возвращает:**
```javascript
{ browser: Browser, chromePath: string }
```

**Пример:**
```javascript
const { launchBrowser } = require('./chrome-lib');
const { browser } = await launchBrowser({ headless: true, timeout: 30000 });
```

#### `findChrome()`

Ищет установленный Google Chrome.

**Возвращает:** `string|null` — путь к chrome.exe

#### `getPageData(page, selector)`

Получает данные элемента.

**Возвращает:**
```javascript
{
  text: string,
  html: string,
  innerHTML: string,
  attributes: object
}
```

#### `getNextData(page)`

Извлекает `__NEXT_DATA__` со страницы (Next.js).

---

## Troubleshooting

### Ошибка: "Chrome не найден"

**Решение:** Укажите путь вручную:
```bash
setx CHROME_PATH "C:\Program Files\Google\Chrome\Application\chrome.exe"
```

### Ошибка: "ECONNREFUSED"

**Причина:** Браузер не запущен через `chrome-browser-start`.

**Решение:**
```bash
chrome-browser-start
# Затем используйте chrome-tab или другие команды
```

### Ошибка: "page.waitForTimeout is not a function"

**Причина:** Новая версия Puppeteer.

**Решение:** Обновите скрипты (используйте `setTimeout`).

### Команды не работают из любой папки

**Решение:** Добавьте C:\Scripts в PATH:
```powershell
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
[Environment]::SetEnvironmentVariable("Path", "$userPath;C:\Scripts", "User")
```
Перезапустите терминал.

---

## 📞 Поддержка

- Issues: [GitHub Issues](https://github.com/YOUR_USERNAME/chrome-cli-tools/issues)
- Документация: [README.md](../README.md)
