#!/usr/bin/env node
/**
 * chrome-quiz - Авто-прохождение тестов с множественным выбором.
 *
 * Использование:
 *   chrome-quiz https://testsite.com/quiz
 *   chrome-quiz https://testsite.com/quiz --random    # Случайные ответы
 *   chrome-quiz https://testsite.com/quiz --first     # Всегда первый вариант
 *
 * Поддерживаемые форматы вопросов:
 * - Radio buttons (input[type="radio"])
 * - Checkboxes (input[type="checkbox"])
 * - Select dropdowns
 * - Кнопки с ответами
 *
 * Требование: Браузер должен быть запущен через chrome-browser-start
 */

const { connectToBrowser } = require('./chrome-lib');

async function main() {
  const args = process.argv.slice(2);
  const url = args.find(a => !a.startsWith('--'));
  const randomFlag = args.includes('--random');
  const firstFlag = args.includes('--first');

  if (!url) {
    console.error('Использование: chrome-quiz <URL> [--random|--first]');
    console.error('Пример: chrome-quiz https://testsite.com/quiz');
    process.exit(1);
  }

  let browser;
  let disconnect;

  try {
    console.error(`[chrome-quiz] Открываю: ${url}`);

    const connection = await connectToBrowser();
    browser = connection.browser;
    disconnect = connection.disconnect;

    const page = await browser.newPage();

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    console.error('[chrome-quiz] Анализ страницы...');

    // Ждём появления вопросов
    await new Promise(r => setTimeout(r, 2000));

    // Получаем информацию о вопросах
    const quizInfo = await page.evaluate(() => {
      const questions = [];

      // Поиск radio buttons
      const radioGroups = {};
      document.querySelectorAll('input[type="radio"]').forEach(radio => {
        const name = radio.name;
        if (name) {
          if (!radioGroups[name]) {
            radioGroups[name] = [];
          }
          radioGroups[name].push({
            value: radio.value,
            label: radio.nextElementSibling?.textContent?.trim() || radio.parentElement?.textContent?.trim() || ''
          });
        }
      });

      Object.entries(radioGroups).forEach(([name, options], index) => {
        questions.push({
          type: 'radio',
          name: name,
          question: `Question ${index + 1}`,
          options: options
        });
      });

      // Поиск кнопок с ответами
      const answerButtons = Array.from(document.querySelectorAll('button, .answer, .option'))
        .filter(el => {
          const text = el.textContent.toLowerCase();
          return text.includes('answer') || text.includes('option') || el.classList.contains('answer') || el.classList.contains('option');
        })
        .map((el, i) => ({
          type: 'button',
          selector: el.tagName.toLowerCase() + (el.className ? '.' + el.className.split(' ').join('.') : '') + ':nth-child(' + (i + 1) + ')',
          text: el.textContent.trim()
        }));

      return { questions, answerButtons, title: document.title };
    });

    console.error(`[chrome-quiz] Найдено вопросов: ${quizInfo.questions.length}`);
    console.error(`[chrome-quiz] Найдено кнопок ответов: ${quizInfo.answerButtons.length}`);

    // Прохождение тестов
    let answeredCount = 0;

    // Radio buttons
    for (const q of quizInfo.questions) {
      if (q.type === 'radio' && q.options.length > 0) {
        let selectedIndex = 0;

        if (randomFlag) {
          selectedIndex = Math.floor(Math.random() * q.options.length);
        } else if (firstFlag) {
          selectedIndex = 0;
        }

        const selectedOption = q.options[selectedIndex];
        console.error(`[chrome-quiz] Вопрос "${q.name}" -> Выбираю: ${selectedOption.label || selectedOption.value}`);

        await page.click(`input[name="${q.name}"][value="${selectedOption.value}"]`);
        answeredCount++;

        await new Promise(r => setTimeout(r, 500));
      }
    }

    // Кнопки ответов
    for (const btn of quizInfo.answerButtons) {
      if (randomFlag || firstFlag) {
        let selectedIndex = 0;
        if (randomFlag) {
          selectedIndex = Math.floor(Math.random() * quizInfo.answerButtons.length);
        }

        const selectedBtn = quizInfo.answerButtons[selectedIndex];
        console.error(`[chrome-quiz] Клик по кнопке: ${selectedBtn.text}`);

        try {
          await page.click(selectedBtn.selector);
          answeredCount++;
          await new Promise(r => setTimeout(r, 1000));
        } catch (e) {
          // Элемент мог исчезнуть
        }
        break; // Только один клик
      }
    }

    // Поиск кнопки "Submit" / "Next" / "Continue"
    const submitSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:contains("Submit")',
      'button:contains("Next")',
      'button:contains("Continue")',
      '.submit',
      '.next',
      '[data-action="submit"]'
    ];

    for (const selector of submitSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          console.error('[chrome-quiz] Клик по Submit');
          await element.click();
          await new Promise(r => setTimeout(r, 2000));
          break;
        }
      } catch (e) {
        // Продолжаем поиск
      }
    }

    console.error(`[chrome-quiz] Готово! Отвечено на ${answeredCount} вопросов`);
    console.error('[chrome-quiz] Браузер остаётся открытым для проверки результатов');

    await disconnect();

    // Оставляем браузер открытым
    process.on('SIGINT', async () => {
      await browser.close();
      process.exit(0);
    });

  } catch (error) {
    if (error.message.includes('ECONNREFUSED') || error.message.includes('Не удалось подключиться')) {
      console.error('[chrome-quiz] ОШИБКА: Браузер не запущен!');
      console.error('[chrome-quiz] Сначала выполните: chrome-browser-start');
    } else {
      console.error('[chrome-quiz] Ошибка:', error.message);
    }
    process.exit(1);
  }
}

main();
