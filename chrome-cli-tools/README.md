# Chrome CLI Tools

[![Version](https://img.shields.io/badge/version-3.0.0-blue.svg)](https://github.com/SerjMihashin/chrome-cli-tools)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-gray.svg)](LICENSE)

**Turn Qwen Code into a real Chrome operator.**

> CLI-инструменты для **парсинга, дебага и браузерной автоматизации** через **реальный Google Chrome**.
>
> Вдохновлено лучшими практиками из **Playwright** — Auto-wait, Locator API, умная проверка стабильности.

![Chrome CLI Tools](https://img.shields.io/badge/Chrome-Automation-blue?style=flat&logo=googlechrome&logoColor=white)
![Puppeteer](https://img.shields.io/badge/Puppeteer-Core-yellow?style=flat&logo=puppeteer&logoColor=white)

Chrome CLI Tools — это набор утилит, который позволяет работать с браузером **через терминал**, как с инструментом для реальных задач:

- парсить и вытаскивать данные со страниц
- проверять консольные ошибки и сетевые запросы
- кликать по элементам и заполнять формы
- выполнять JavaScript прямо в контексте страницы
- снимать скриншоты результата
- автоматизировать простые сценарии и тесты

## 🚀 Быстрый старт

### 1. Установка

```bash
# Локальная установка
npm install

# Глобальная установка (доступно из любой папки)
npm install -g .
```

### 2. Запуск Chrome с debugging-портом

```bash
chrome-browser-start
# или
node chrome-browser-start.js
```

### 3. Использование единого CLI (новый способ!)

```bash
# Открыть страницу
chrome open https://example.com

# Получить текст
chrome text https://example.com h1

# Клик по элементу (Auto-wait автоматически ждёт видимости)
chrome click https://example.com ".button"

# Ввод текста (Auto-wait автоматически ждёт доступности)
chrome fill https://example.com "#email" "test@example.com"

# Выполнить JavaScript
chrome eval https://example.com "document.title"

# Поиск элементов с фильтрами (Locator API)
chrome locator https://example.com "a" --text "Learn more" --count

# Сделать скриншот
chrome shot https://example.com --output screenshot.png --full

# Проверить консоль на ошибки
chrome console https://example.com --error

# Перехват API-запросов
chrome network https://example.com --api

# Получить localStorage/sessionStorage
chrome storage https://example.com --local

# Навигация
chrome nav https://example.com --refresh

# Ожидание элемента
chrome wait https://example.com ".loader" --timeout 10000

# Прокрутка
chrome scroll https://example.com --bottom
```

### 4. Старый способ (тоже работает)

```bash
node chrome-tab.js https://example.com
node chrome-text.js https://example.com h1
node chrome-click.js https://example.com ".button"
```

---

## Почему это интересно

Обычно AI-агенты умеют:

- писать код
- запускать команды
- редактировать файлы

Но им часто не хватает одного важного слоя:  
**возможности нормально работать с реальным браузером как пользователь**.

Chrome CLI Tools закрывает этот разрыв.

Ты даёшь задачу в **Qwen Code** вроде:

- «Открой страницу и вытащи нужный текст»
- «Проверь, есть ли ошибки в консоли»
- «Открой форму, заполни поля и нажми кнопку»
- «Посмотри API-запросы после клика»
- «Сделай скриншот после выполнения сценария»

И дальше агент может сам вызвать нужные CLI-команды и выполнить цепочку действий в Chrome.

## Для чего проект создавался

Изначально проект делался как **практический набор инструментов** для реальной работы, а не как демо ради демо.

Основные сценарии:

- **парсинг** и сбор данных с сайтов
- **дебагинг** страниц через Chrome
- **автоматизация** действий в браузере
- **прохождение тестов, форм и типовых сценариев**
- **связка с Qwen Code** и другими AI-агентами

## Что даёт связка с Qwen Code

Самый сильный сценарий этого проекта — использование вместе с **Qwen Code**.

Идея простая:

1. ты пишешь промпт
2. Qwen Code запускает команды в терминале
3. Chrome открывается и выполняет действия
4. агент читает результат и продолжает сценарий

То есть вместо ручной рутины в браузере получается workflow в духе:

**prompt → terminal commands → real Chrome → result**

### Пример такого сценария

**Новый способ (единый CLI — рекомендуется):**

```bash
chrome-browser-start
chrome open https://example.com/login
chrome fill "#email" "user@example.com"
chrome fill "#password" "password123"
chrome click "button[type='submit']"
chrome text "h1"
chrome console --error
chrome shot --output dashboard.png
```

**Работа в одной вкладке (рекомендуется для многошаговых сценариев):**

```bash
chrome-browser-start
# Первый вызов открывает страницу, остальные работают в той же вкладке
chrome eval https://example.com/login --same-tab "document.title"
chrome fill https://example.com/login "#email" --same-tab "user@example.com"
chrome fill https://example.com/login "#password" --same-tab "password123"
chrome click https://example.com/login "button[type='submit']" --same-tab
chrome text https://example.com/dashboard "h1" --same-tab
chrome console https://example.com/dashboard --same-tab --error
chrome shot https://example.com/dashboard --same-tab --output dashboard.png
```

**Старый способ (тоже работает, но каждая команда открывает новую вкладку):**

```bash
chrome-browser-start
node chrome-tab.js https://example.com/login
node chrome-fill.js https://example.com/login "#email" "user@example.com"
node chrome-fill.js https://example.com/login "#password" "password123"
node chrome-click.js https://example.com/login "button[type='submit']"
node chrome-text.js https://example.com/dashboard "h1"
node chrome-console.js https://example.com/dashboard --error
node chrome-shot.js https://example.com/dashboard --output dashboard.png
```

### Что здесь происходит

* запускается Chrome с debugging-портом
* открывается страница логина
* поля формы заполняются автоматически
* нажимается кнопка входа
* читается заголовок страницы после входа
* проверяются ошибки в консоли
* сохраняется скриншот финального результата

Именно это и даёт вау-эффект:
**пишешь задачу в Qwen Code — а дальше агент сам управляет реальным Chrome.**

## Не только для Qwen Code

Хотя основной акцент проекта — **Qwen Code**, сам подход универсальный.

Эти же инструменты можно использовать и в других сценариях:

* другие AI coding agents
* обычный терминал
* PowerShell / bash-скрипты
* Node.js automation-сценарии
* локальные browser workflows
* полуавтоматические UI-проверки
* ручной дебагинг страниц

То есть проект полезен не только как “надстройка для агента”, но и как обычный рабочий CLI-инструментарий.

## Основные возможности

* запуск Chrome с debugging-портом
* открытие ссылок в новых вкладках и окнах
* навигация по страницам: back / forward / refresh / hard reload
* клик по элементам и ввод текста
* ожидание появления, видимости и исчезновения элементов
* чтение текста и HTML
* выполнение JavaScript на странице
* чтение консоли браузера
* перехват сетевых запросов
* получение cookies, localStorage и sessionStorage
* создание скриншотов
* автоматизация простых тестов и квизов

## Где это особенно полезно

### 1. Парсинг и сбор данных

Когда нужно быстро вытащить данные со страницы через реальный Chrome:

* текст по селектору
* HTML
* результат выполнения JavaScript
* данные после динамической подгрузки

Примеры:

```bash
chrome-text https://example.com "h1"
chrome-html https://example.com
chrome-eval https://example.com "document.title"
chrome-eval https://example.com "document.querySelector('.price')?.innerText"
```

### 2. Дебагинг страниц

Когда нужно быстро проверить, что происходит на странице:

* ошибки в консоли
* XHR / fetch-запросы
* localStorage / sessionStorage
* cookies

Примеры:

```bash
chrome-console https://example.com --error
chrome-network https://example.com --api
chrome-storage https://example.com --local
chrome-cookies https://example.com
```

### 3. Автоматизация действий

Когда нужно повторить пользовательский сценарий:

* открыть страницу
* заполнить форму
* нажать кнопку
* дождаться нужного состояния
* прочитать результат

Примеры:

```bash
chrome-click https://site.com ".load-more"
chrome-fill https://site.com/login "#email" "user@example.com"
chrome-fill https://site.com/login "#password" "password123"
chrome-wait https://site.com/dashboard ".profile" --visible
chrome-text https://site.com/dashboard "h1"
```

### 4. Скриншоты и фиксация результата

Когда нужно зафиксировать итог сценария:

```bash
chrome-shot https://example.com --output screenshot.png
chrome-shot https://example.com --full --output full-page.png
```

### 5. Простые тесты и квизы

Когда нужно быстро прогнать элементарный сценарий без ручных кликов:

```bash
chrome-quiz https://testsite.com/quiz --first
chrome-quiz https://testsite.com/quiz --random
```

## Скриншоты

Сюда очень стоит добавить 2–4 изображения.
С ними README будет смотреться заметно сильнее.

Рекомендуемая структура:

```md
## Screenshots

### Qwen Code gives the task

![Qwen Code prompt](docs/screenshots/qwen-prompt.png)

### Chrome executes the scenario

![Chrome automation](docs/screenshots/chrome-run.png)

### Terminal output / parsed result

![Terminal result](docs/screenshots/terminal-result.png)

### Final screenshot captured by the tool

![Final screenshot](docs/screenshots/final-page.png)
```

### Что лучше показать на скринах

1. **Промпт в Qwen Code**
   Например задача: открыть страницу, вытащить данные, проверить консоль, сохранить скриншот.

2. **Chrome в процессе выполнения**
   Открытая страница, форма, результат действия или состояние после сценария.

3. **Вывод в терминале**
   Например `chrome-text`, `chrome-console --error` или `chrome-network --api`.

4. **Итоговый скриншот**
   То, что сохранил `chrome-shot`.

## Требования

Перед использованием убедитесь, что у вас установлены:

* [Node.js](https://nodejs.org/)
* Google Chrome

## Установка

### Вариант 1. Через Git

```bash
git clone https://github.com/SerjMihashin/chrome-cli-tools.git
cd chrome-cli-tools
npm install
```

### Вариант 2. Если скачали ZIP-архив

Распакуйте архив, откройте терминал в папке проекта и выполните:

```bash
npm install
```

## Быстрый старт

### 1. Запустите Chrome с debugging-портом

```bash
chrome-browser-start
```

### 2. Откройте страницу в новой вкладке

```bash
chrome-tab https://example.com
```

### 3. Получите заголовок страницы

```bash
chrome-eval https://example.com "document.title"
```

## Примеры использования с Qwen Code

### Пример 1. Парсинг текста со страницы

Задача для агента:

> Открой страницу и вытащи заголовок h1.

Команды:

```bash
chrome-browser-start
node chrome-tab.js https://example.com
node chrome-text.js https://example.com "h1"
```

### Пример 2. Проверка консольных ошибок

Задача для агента:

> Открой страницу и проверь, есть ли ошибки в консоли.

Команды:

```bash
chrome-browser-start
node chrome-tab.js https://example.com
node chrome-console.js https://example.com --error
```

### Пример 3. Проверка API-запросов

Задача для агента:

> Открой страницу и покажи только API-запросы.

Команды:

```bash
chrome-browser-start
node chrome-tab.js https://example.com
node chrome-network.js https://example.com --api
```

### Пример 4. Автоматизация формы

Задача для агента:

> Открой страницу логина, заполни форму, нажми кнопку и проверь, открылся ли dashboard.

Команды:

```bash
chrome-browser-start
node chrome-tab.js https://example.com/login
node chrome-fill.js https://example.com/login "#email" "user@example.com"
node chrome-fill.js https://example.com/login "#password" "password123"
node chrome-click.js https://example.com/login "button[type='submit']"
node chrome-text.js https://example.com/dashboard "h1"
```

### Пример 5. Финальный скриншот результата

Задача для агента:

> После выполнения сценария сохрани скриншот.

Команды:

```bash
chrome-shot https://example.com/dashboard --output dashboard.png
```

## Примеры использования через терминал

### Открыть несколько сайтов

```bash
chrome-browser-start
chrome-tab https://playwright.dev https://github.com/microsoft/playwright
```

### Получить текст элемента

```bash
chrome-text https://example.com "h1"
```

### Выполнить JavaScript

```bash
chrome-eval https://example.com "document.title"
chrome-eval https://example.com "window.innerWidth"
chrome-eval https://example.com "document.querySelector('h1')?.innerText"
```

### Кликнуть по кнопке и затем прочитать контент

```bash
chrome-click https://site.com ".load-more"
chrome-text https://site.com ".content"
```

### Перехватить API-запросы

```bash
chrome-network https://example.com --api
```

### Посмотреть ошибки в консоли

```bash
chrome-console https://example.com --error
```

### Снять скриншот страницы

```bash
chrome-shot https://example.com --output screenshot.png
```

### Получить данные из localStorage

```bash
chrome-storage https://example.com --local
```

### Пройти простой тест

```bash
chrome-quiz https://testsite.com/quiz --first
```

## 📦 Единый CLI интерфейс (v2.0+)

**Новый способ использования** — через единую команду `chrome`:

```bash
chrome <command> <url> [options]
```

### Все команды единого CLI

| Команда | Описание | Auto-wait |
|---------|----------|-----------|
| `chrome open <url>` | Открыть URL в браузере | — |
| `chrome click <url> <selector>` | Клик по элементу | ✅ |
| `chrome fill <url> <sel> <txt>` | Ввод текста в поле | ✅ |
| `chrome eval <url> "<code>"` | Выполнить JavaScript | — |
| `chrome text <url> [selector]` | Получить текст | — |
| `chrome html <url>` | Получить HTML страницы | — |
| `chrome console <url>` | Логи консоли | — |
| `chrome network <url>` | Сетевые запросы | — |
| `chrome storage <url>` | Local/Session storage | — |
| `chrome cookies <url>` | Cookies | — |
| `chrome shot <url>` | Сделать скриншот | — |
| `chrome nav <url>` | Навигация (back/forward/refresh) | — |
| `chrome wait <url> <selector>` | Ожидание элемента | — |
| `chrome scroll <url>` | Прокрутка страницы | — |
| `chrome locator <url> <selector>` | Поиск элементов с фильтрами | — |

### Флаги

| Флаг | Описание |
|------|----------|
| `--same-tab` | Переиспользовать существующую вкладку (не создавать новую) |
| `--visible` | Ждать видимости элемента |
| `--hidden` | Ждать исчезновения элемента |
| `--error` | Только ошибки (console) |
| `--all` | Все сообщения (console) |
| `--api` | Только API запросы (network) |
| `--local` | Только localStorage (storage) |
| `--session` | Только sessionStorage (storage) |
| `--clear` | Очистить cookies |
| `--full` | Полная страница (shot) |
| `--top` | Прокрутка вверх (scroll) |
| `--bottom` | Прокрутка вниз (scroll) |
| `--back` | Назад в истории (nav) |
| `--forward` | Вперёд в истории (nav) |
| `--refresh` | Обновить страницу (nav) |
| `--output <path>` | Путь для скриншота (shot) |
| `--timeout <ms>` | Таймаут в мс (wait, locator) |
| `--name <name>` | Имя cookie (cookies) |
| `--text <text>` | Фильтр по тексту (locator) |
| `--attr <name>` | Фильтр по атрибуту (locator) |
| `--count` | Только количество (locator) |
| `--port <port>` | Порт отладки (по умолчанию 9222) |

### Примеры

```bash
# Auto-wait работает автоматически
chrome click https://example.com ".button"
chrome fill https://example.com "#email" "test@example.com"

# Locator API
chrome locator https://example.com "a" --text "Learn more" --count
chrome locator https://example.com "button" --attr "data-add-to-cart"

# Скриншот
chrome shot https://example.com --output screen.png --full

# DevTools
chrome console https://example.com --error
chrome network https://example.com --api
```

---

## Команды (старый способ — тоже работает)

### Навигация и открытие

| Команда                      | Описание                                           |
| ---------------------------- | -------------------------------------------------- |
| `chrome-browser-start`       | Запустить Chrome с debugging-портом                |
| `chrome-tab <URL> [URL2...]` | Открыть одну или несколько ссылок в новых вкладках |
| `chrome-open <URL>`          | Открыть сайт в отдельном окне                      |
| `chrome-nav <URL> --back`    | Назад по истории                                   |
| `chrome-nav <URL> --forward` | Вперёд по истории                                  |
| `chrome-nav <URL> --refresh` | Обновить страницу                                  |
| `chrome-nav <URL> --hard`    | Жёсткая перезагрузка страницы                      |

### Взаимодействие со страницей

| Команда                                  | Описание                           |
| ---------------------------------------- | ---------------------------------- |
| `chrome-click <URL> <selector>`          | Клик по элементу                   |
| `chrome-fill <URL> <selector> <text>`    | Ввод текста в поле                 |
| `chrome-scroll <URL> <selector>`         | Прокрутка к элементу               |
| `chrome-scroll <URL> --top`              | Прокрутка в начало страницы        |
| `chrome-scroll <URL> --bottom`           | Прокрутка в конец страницы         |
| `chrome-wait <URL> <selector>`           | Ждать появления элемента           |
| `chrome-wait <URL> <selector> --visible` | Ждать, пока элемент станет видимым |
| `chrome-wait <URL> <selector> --hidden`  | Ждать, пока элемент исчезнет       |

### Получение данных

| Команда                         | Описание                                    |
| ------------------------------- | ------------------------------------------- |
| `chrome-text <URL> [selector]`  | Получить текст со страницы или по селектору |
| `chrome-html <URL>`             | Получить HTML страницы                      |
| `chrome-eval <URL> "<js-code>"` | Выполнить JavaScript на странице            |

### DevTools и отладка

| Команда                              | Описание                               |
| ------------------------------------ | -------------------------------------- |
| `chrome-console <URL>`               | Прочитать сообщения консоли страницы   |
| `chrome-console <URL> --error`       | Показать только ошибки                 |
| `chrome-network <URL>`               | Перехватить сетевые запросы            |
| `chrome-network <URL> --api`         | Показать только XHR/fetch запросы      |
| `chrome-storage <URL>`               | Показать localStorage и sessionStorage |
| `chrome-storage <URL> --local`       | Показать только localStorage           |
| `chrome-storage <URL> --session`     | Показать только sessionStorage         |
| `chrome-cookies <URL>`               | Показать cookies                       |
| `chrome-cookies <URL> --name <name>` | Показать cookie по имени               |
| `chrome-cookies <URL> --clear`       | Очистить cookies                       |

### Скриншоты

| Команда                                     | Описание                       |
| ------------------------------------------- | ------------------------------ |
| `chrome-shot <URL>`                         | Сделать скриншот страницы      |
| `chrome-shot <URL> --output screenshot.png` | Сохранить скриншот в файл      |
| `chrome-shot <URL> --full`                  | Сделать скриншот всей страницы |

### Тесты и квизы

| Команда                      | Описание                       |
| ---------------------------- | ------------------------------ |
| `chrome-quiz <URL>`          | Автопрохождение теста          |
| `chrome-quiz <URL> --random` | Выбирать случайные ответы      |
| `chrome-quiz <URL> --first`  | Всегда выбирать первый вариант |

## Использование в Node.js-скриптах

Эти утилиты можно запускать не только вручную, но и из других Node.js-скриптов и automation-сценариев.

Примеры:

```bash
node chrome-tab.js https://example.com
node chrome-text.js https://example.com h1
node chrome-eval.js https://example.com "document.title"
node chrome-console.js https://example.com --error
node chrome-network.js https://example.com --api
node chrome-quiz.js https://example.com/quiz --first
```

## Переменные окружения

* `CHROME_PATH` — путь к `chrome.exe`, если Chrome не найден автоматически
* `NODE_TIMEOUT` — таймаут операций в миллисекундах

Пример для PowerShell:

```powershell
$env:CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
$env:NODE_TIMEOUT="15000"
```

## Структура проекта

```text
chrome-cli-tools/
├── chrome-lib.js
├── chrome-browser-start.bat
├── chrome-tab.js
├── chrome-open.js
├── chrome-click.js
├── chrome-fill.js
├── chrome-scroll.js
├── chrome-wait.js
├── chrome-nav.js
├── chrome-text.js
├── chrome-html.js
├── chrome-eval.js
├── chrome-console.js
├── chrome-network.js
├── chrome-storage.js
├── chrome-cookies.js
├── chrome-shot.js
├── chrome-quiz.js
├── package.json
└── README.md
```

## Ограничения

* Для большинства команд Chrome должен быть запущен с debugging-портом
* Селекторы должны соответствовать реальной структуре страницы
* Некоторые сайты могут блокировать автоматизацию
* Работа с динамическими интерфейсами может требовать ожидания элементов через `chrome-wait`

## Почему проект может быть полезен

Chrome CLI Tools — это не просто “набор скриптов для Chrome”.

Это рабочий инструмент, который можно использовать как:

* CLI-парсер
* набор утилит для дебага
* основу для browser automation
* прослойку между Qwen Code и реальным Chrome
* заготовку под более сложные агентные workflow

## Планы по развитию

* улучшение логирования
* дополнительные режимы ожидания и ретраев
* более удобный вывод ошибок
* расширение набора CLI-команд
* больше примеров интеграции с AI-агентами
* готовые сценарии под парсинг и UI-проверки

## ✅ Результаты тестов (v3.0)

Последнее тестирование: март 2026

| Команда | Статус | Примечание |
|---------|--------|------------|
| `chrome --help` | ✅ | Справка работает |
| `chrome text` | ✅ | Получение текста |
| `chrome eval` | ✅ | Выполнение JS |
| `chrome click` | ✅ | Auto-wait работает |
| `chrome fill` | ✅ | Auto-wait работает |
| `chrome locator` | ✅ | Поиск с фильтрами |
| `chrome shot` | ✅ | Скриншоты |
| `chrome console` | ✅ | Логи консоли |
| `chrome network` | ✅ | Сетевые запросы |
| `chrome storage` | ✅ | Local/Session storage |
| `chrome cookies` | ✅ | Cookies |
| `chrome nav` | ✅ | Навигация |
| `chrome wait` | ✅ | Ожидание элемента |
| `chrome scroll` | ✅ | Прокрутка |

**Все 14 команд работают корректно!**

---

## 🔧 Troubleshooting

### Каждая команда открывает новую вкладку (теряется состояние)

**Решение:** Используйте флаг `--same-tab`.

```bash
# Без --same-tab: каждая команда создаёт новую вкладку
chrome eval https://example.com "document.title"
chrome text https://example.com h1  # новая вкладка!

# С --same-tab: все команды работают в одной вкладке
chrome eval https://example.com --same-tab "document.title"
chrome text https://example.com h1 --same-tab  # та же вкладка
```

Флаг `--same-tab` поддерживается всеми скриптами: `chrome-eval.js`, `chrome-text.js`, `chrome-click.js`, `chrome-fill.js`, `chrome-console.js`, `chrome-html.js`, `chrome-nav.js`, `chrome-scroll.js`, `chrome-wait.js`, `chrome-cookies.js`, `chrome-storage.js`, `chrome-network.js`, `chrome-shot.js` и единым CLI `chrome-cli.js`.

### Ошибка: "Браузер не запущен"

**Решение:**
```bash
# Запустите Chrome с debugging-портом
chrome-browser-start
```

### Ошибка: "No element found for selector"

**Причины:**
1. Элемент ещё не загрузился
2. Неправильный селектор
3. Элемент внутри iframe

**Решения:**
```bash
# Используйте Auto-wait (по умолчанию включён)
chrome click ".button"

# Явное ожидание
chrome wait ".button" --timeout 10000

# Проверьте селектор в DevTools
# document.querySelector(".button")
```

### Ошибка: "Cannot connect to Chrome"

**Причины:**
1. Порт 9222 занят
2. Chrome запущен с другим портом

**Решения:**
```bash
# Проверьте, занят ли порт
netstat -ano | findstr :9222

# Используйте другой порт
chrome-browser-start --port 9223
chrome text https://example.com h1 --port 9223

# Или закройте все процессы Chrome и перезапустите
taskkill /F /IM chrome.exe
```

### Скриншот не сохраняется

**Решение:**
```bash
# Используйте абсолютный путь
chrome shot https://example.com --output "C:\Users\Name\Desktop\screen.png"

# Проверьте права на запись в папку
```

### Таймаут при ожидании элемента

**Решение:**
```bash
# Увеличьте таймаут
chrome wait ".loader" --timeout 60000

# Проверьте, существует ли элемент
chrome locator ".loader" --count
```

---

## Лицензия

Пока без отдельной лицензии.
