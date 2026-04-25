# Contributing to Chrome CLI Tools

Спасибо за интерес к проекту! Этот документ описывает, как вносить изменения.

## 📋 Содержание

- [Как сообщить об ошибке](#как-сообщить-об-ошибке)
- [Как предложить улучшение](#как-предложить-улучшение)
- [Как внести изменения](#как-внести-изменения)
- [Стандарты кода](#стандарты-кода)
- [Структура проекта](#структура-проекта)

---

## 🐛 Как сообщить об ошибке

1. Проверьте существующие [Issues](https://github.com/YOUR_USERNAME/chrome-cli-tools/issues) — возможно, ошибка уже известна
2. Создайте новый Issue с меткой `bug`
3. Опишите:
   - Что вы делали
   - Что ожидали увидеть
   - Что произошло вместо этого
   - Версию Node.js (`node -v`)
   - Версию Puppeteer (`npm list puppeteer-core`)

---

## 💡 Как предложить улучшение

1. Создайте Issue с меткой `enhancement`
2. Опишите:
   - Какую проблему решает улучшение
   - Как это должно работать
   - Примеры использования

---

## 🔧 Как внести изменения

### 1. Fork репозитория

Нажмите **Fork** на GitHub для создания копии в вашем аккаунте.

### 2. Клонируйте fork

```bash
git clone https://github.com/SerjMihashin/chrome-cli-tools.git
cd chrome-cli-tools
```

### 3. Установите зависимости

```bash
npm install
```

### 4. Создайте ветку

```bash
git checkout -b feature/my-new-feature
```

### 5. Внесите изменения

Следуйте стандартам кода ниже.

### 6. Протестируйте

```bash
# Проверка работы команд
node chrome-open.js https://example.com
node chrome-text.js https://example.com h1
```

### 7. Закоммитьте изменения

```bash
git add .
git commit -m "feat: добавить новую функцию"
```

### 8. Отправьте в fork

```bash
git push origin feature/my-new-feature
```

### 9. Создайте Pull Request

Перейдите в оригинальный репозиторий и нажмите **New Pull Request**.

---

## 📝 Стандарты кода

### Именование файлов

- Скрипты: `chrome-<action>.js` (например, `chrome-open.js`)
- BAT-файлы: `<script-name>.bat` (например, `chrome-open.bat`)

### Структура JS-файла

```javascript
#!/usr/bin/env node
/**
 * <name> - <краткое описание>.
 * 
 * Использование:
 *   <command> <args>
 */

const { launchBrowser } = require('./chrome-lib');

async function main() {
  // Логика
}

main();
```

### Комментарии

- Все файлы должны иметь заголовок с описанием
- Используйте `console.error()` для логов процесса
- Используйте `console.log()` для вывода результата

### Обработка ошибок

```javascript
try {
  // Код
} catch (error) {
  console.error('[script-name] Ошибка:', error.message);
  process.exit(1);
}
```

---

## 📁 Структура проекта

```
chrome-cli-tools/
├── chrome-lib.js              # Общая библиотека
├── chrome-*.js                # Скрипты
├── chrome-*.bat               # BAT-обёртки
├── package.json               # Зависимости
├── README.md                  # Документация
├── docs/                      # Дополнительная документация
├── .gitignore                 # Git ignore
└── LICENSE                    # Лицензия
```

---

## 📞 Контакты

- Issues: [GitHub Issues](https://github.com/YOUR_USERNAME/chrome-cli-tools/issues)
- Email: your-email@example.com

---

## 📜 Лицензия

MIT — см. [LICENSE](LICENSE).
