# TZ_STABILIZATION — DeepSeek Code

## Цель

Стабилизировать опубликованный npm-пакет `@serjm/deepseek-code` и продолжать доработку только маленькими проверяемыми итерациями.

Главный принцип:

> Агент не имеет права писать “сделал”, “изменил”, “проверил”, если это не подтверждено tool call, `git diff/status`, тестами или ручной проверкой.

---

## Правила выполнения задач

Перед изменениями:

```bash
git status --short
git diff --stat
```

После изменений:

```bash
git diff --stat
npm run lint
npm run typecheck
npm run build
npm test
```

Для UI/UX-задач дополнительно:

```bash
npm run build
npm run dev
```

и ручная проверка в новой запущенной версии.

Если `git diff --stat` пустой — писать только:

```text
Изменений на диске нет.
```

---

## Статусы

- `TODO` — не начато.
- `IN_PROGRESS` — в работе.
- `NEEDS_MANUAL_VERIFY` — код изменён, проверки прошли, нужна ручная проверка.
- `VERIFIED` — прошли проверки и ручной тест.
- `REVERTED` — откатано.
- `ARCHIVED` — старое/неактуальное.
- `BLOCKED` — заблокировано.

---

## Глобальные запреты

Нельзя:

- делать большой UI/UX overhaul одним запросом;
- менять Chrome, AgentLoop, InputBar, stream, scroll, Matrix одновременно;
- использовать `taskkill /IM chrome.exe`;
- писать “изменил”, если `git diff` пустой;
- писать “проверил”, если не было tool call или команды;
- оставлять временные `.cjs`, `.txt`, `.log` файлы в проекте;
- читать весь проект без необходимости;
- читать огромный HTML/DOM в контекст;
- запускать десятки shell-команд для маленькой задачи;
- делать `npm publish`, `git push`, `git reset --hard`, `git clean -fdx` без явного разрешения пользователя.

---

# P0 — Критические задачи

## P0.0 — Token Accounting

Статус: `VERIFIED`

### Проблема

Execution Summary показывал огромные значения токенов без понятного разделения: session total, cache hit, cache miss, output, reasoning, last context.

### Требования

- Разделить:
    - session input;
    - cache hit;
    - cache miss;
    - session output;
    - reasoning;
    - session total;
    - last request context;
    - API calls count.
- Показывать `Last request context` отдельно от `Session total tokens`.
- Показывать `%` от context window.
- Если usage недоступен — писать `unknown`.

### Acceptance

- Простая задача с 1 API call показывает понятный breakdown.
- Session total не выглядит как размер одного контекста.
- Cached tokens не выглядят как новый расход.

---

## P0.1 — Task Budget Guard

Статус: `VERIFIED`

### Проблема

Агент на маленьких задачах делает 30–70 tool calls и тратит сотни тысяч/миллионы session tokens.

### Требования

Добавить budget:

```ts
interface TaskBudget {
  maxToolCalls?: number
  maxApiCalls?: number
  maxIterations?: number
  maxReadFiles?: number
  maxShellCommands?: number
}
```

Режимы:

```text
small task:
- maxToolCalls: 12
- maxApiCalls: 6
- maxReadFiles: 5
- maxShellCommands: 4

audit task:
- maxToolCalls: 20
- maxApiCalls: 8
- maxReadFiles: 8

large task:
- только по явному разрешению пользователя
```

При превышении budget:

```text
Остановлено по budget limit.

Что успел проверить:
...

Что не успел:
...

Для продолжения нужно разрешение:
...
```

### Acceptance

- Маленькая задача не уходит в 50 tool calls.
- Агент останавливается и даёт partial report.
- Budget не ломает обычные задачи.

### Факт проверки

- Добавлен TaskBudget: maxToolCalls, maxApiCalls, maxIterations, maxReadFiles, maxShellCommands.
- Budget guard добавлен в AgentLoop.
- Headless режим использует AUDIT_BUDGET_PRESET.
- Interactive режим получил локальную команду: /budget status, /budget off, /budget small, /budget audit.
- Команды /budget локальные: не уходят в модель и не дают Execution Summary.
- Visible halt проверен вручную: maxApiCalls: 6/6 показал budget halt report.
- Halt report теперь выводится через stream output.

### Коммиты

- feat: add task budget guard scaffold
- feat: enable budget guard for headless tasks
- feat: add interactive budget command
- fix: show budget halt after usage accounting
- fix: show budget halt in stream output

---

## P0.2 — Prompt Delivery Diagnostics

Статус: `VERIFIED`

### Проблема

При большом prompt пользователь не понимает, отправился полный текст или только видимая часть.

### Требования

- Перед отправкой считать:
    - chars;
    - lines.
- Для большого prompt показывать локальное уведомление:

```text
Отправка prompt: N символов · M строк
```

- Уведомление не должно уходить в модель.
- Короткий prompt не должен показывать notice.
- Enter отправляет полный buffer.

### Acceptance

- Короткий ввод работает как раньше.
- Большой prompt показывает chars/lines.
- Модель получает полный текст.
- Slash-команды не ломаются.

---

## P0.3 — Windows Multiline Paste Normalization

Статус: `NEEDS_MANUAL_VERIFY`

### Проблема

На Windows multiline paste может приходить с `\r`, а не `\n`.

### Требования

- В InputBar нормализовать:
    - `\r\n` → `\n`;
    - `\r` → `\n`.
- Делать это до сохранения в input state.
- При подсчёте строк учитывать `\r\n|\r|\n`.
- Не добавлять debug logs в production.

### Acceptance

Вставить:

```text
AAA-111
BBB-222
CCC-333
DDD-444
EEE-555
FFF-666
```

Ожидание:

- видно все 6 строк;
- текст не превращается в одну битую строку;
- появляется notice `Отправка prompt: N символов · 6 строк`;
- Enter отправляет полный текст.

---

## P0.4 — InputBar Multiline Cursor Navigation

Статус: `NEEDS_MANUAL_VERIFY`

### Проблема

После multiline paste курсор не ходит нормально по строкам.

### Требования

- Добавить `cursorIndex`.
- Left/Right двигают `cursorIndex`.
- Up/Down в multiline двигают курсор по строкам.
- Сохранять визуальную колонку при Up/Down.
- Если курсор выходит за видимую область — обновлять `inputScrollOffset`.
- Обычный ввод вставляется в `cursorIndex`.
- Shift+Enter вставляет `\n` в `cursorIndex`.
- History navigation через ↑/↓ разрешена только когда input пустой.
- Suggestions работают как раньше.

### Acceptance

- ↑ поднимает курсор до первой строки.
- ↓ опускает курсор до последней строки.
- ←/→ ходят внутри строки.
- Ввод в середине строки вставляется в середину.
- Prompt не сбрасывается стрелками.

---

## P0.5 — Backspace/Delete Correctness on Windows

Статус: `NEEDS_MANUAL_VERIFY`

### Проблема

На Windows/Ink физический Backspace может приходить как `key.delete`.

Ручной тест:

```text
ABCDE
```

Курсор между `C` и `D`.

Баг:

```text
Backspace → удаляет D
Delete    → удаляет D
```

Ожидание:

```text
Backspace → ABDE
Delete    → ABCE
```

### Требования

- Backspace удаляет символ слева от `cursorIndex`.
- Delete удаляет символ справа от `cursorIndex`.
- Если Ink маппит Backspace как Delete, различать по raw input:
    - Backspace: `\x7f` или `\b`;
    - Delete: `\x1b[3~`.
- Не превращать весь `key.delete` в Backspace.
- Если используется `internal_eventEmitter`, пометить как hotfix-risk.

### Acceptance

- `ABCDE`, курсор между `C` и `D`;
- Backspace → `ABDE`;
- Delete → `ABCE`.

---

## P0.6 — Change Verification / Execution Ledger

Статус: `VERIFIED`

### Проблема

Агент может отчитаться, что изменил файлы, хотя изменений нет.

### Требования

- `write_file` и `edit` возвращают:
    - `changed`;
    - `verified`;
    - `changedFiles`.
- `edit` с 0 замен не считается успешным.
- После `write_file` читать файл обратно и сверять содержимое.
- После `edit` проверять, что файл реально изменился.
- Финальный отчёт `changed files` строится из фактических изменений.
- Если diff пустой — писать `Изменений нет`.
- Добавить `/last-run` или аналог.

### Acceptance

- Агент создаёт файл → отчёт показывает файл.
- Агент ничего не меняет → отчёт пишет `изменений нет`.
- Failed edit не отображается как success.
- Untracked-файлы учитываются.

### Факт проверки

- ToolResult fields `changed`/`verified`/`changedFiles` теперь не теряются в AgentLoop.
- ToolCallEvent сохраняет `changed`/`verified`/`changedFiles`.
- `write_file`/`edit` verification metadata теперь проходит до AgentLoop.

### Коммиты

- fix: preserve tool change verification fields
- feat: add git status change report metrics
- feat: capture git status around agent runs
- feat: show git change report in execution summary

---

## P0.7 — Untracked Files in Change Reports

Статус: `VERIFIED`

### Проблема

`git diff HEAD --name-only` не показывает untracked-файлы.

Пример:

```text
?? TEST_AGENT_WRITE.md
```

### Требования

- Для отчёта использовать `git status --short` или `git status --porcelain`.
- Учитывать:
    - `M` modified;
    - `A` added;
    - `D` deleted;
    - `??` untracked.
- На старте run снять baseline status.
- В конце run снять final status.
- Сравнить baseline/final.
- Разделять:
    - изменения этого run;
    - грязные файлы до run.

### Acceptance

Если агент создал `TEST_AGENT_WRITE.md`, отчёт показывает:

```text
Новый файл / untracked:
- TEST_AGENT_WRITE.md
```

Если изменений с начала run нет:

```text
Изменений за этот запуск нет.
```

### Факт проверки

- MetricsCollector умеет `captureGitBaseline`/`captureGitFinal`.
- `getGitChangeReport` разделяет dirty before run / changed during run / new untracked.
- AgentLoop снимает baseline/final вокруг run.
- Execution Summary показывает Files section.
- Ручной тест `TEST_AGENT_WRITE.md` показал new untracked и dirty before run корректно.

### Коммиты

- fix: preserve tool change verification fields
- feat: add git status change report metrics
- feat: capture git status around agent runs
- feat: show git change report in execution summary

---

## P0.8 — Honest Reports

Статус: `VERIFIED`

### Проблема

Агент пишет “проверил”, “изменил”, “посмотрел лог”, хотя tool call не выполнялся или diff пустой.

### Требования

- Ответы делить на:
    - `Verified`;
    - `Failed`;
    - `Skipped`;
    - `Assumption`.
- Нельзя писать `проверено`, если не было tool call.
- Нельзя писать `изменено`, если нет diff/ledger.
- Если `Tool uses = 0`, нельзя заявлять выполненные действия.
- Summary должен совпадать с tool calls.

### Acceptance

- Вопрос `что ты изменил?` при пустом diff → `ничего не изменено`.
- Отчёт не содержит выдуманных файлов.
- Summary не противоречит tool calls.


### Факт проверки

- ToolResult changed/verified/changedFiles пробрасываются в AgentLoop.
- formatToolResult добавляет verification metadata в tool message.
- System prompt получил раздел Honest Reporting.
- Execution Summary уже показывает git truth через Files section.
- Модель получила правило не заявлять "изменил/проверил/тесты прошли" без tool evidence.

### Коммиты

- fix: preserve tool change verification fields
- fix: include change verification in tool results
- docs: add honest reporting rules to system prompt
- feat: show git change report in execution summary


---

# P1 — Базовая стабильность

## P1.1 — Проверочный Pipeline

Статус: `VERIFIED`

### Требования

Перед коммитом:

```bash
npm run lint
npm run typecheck
npm run build
npm test
```

### Acceptance

- Все проверки проходят.
- Если проверка не запускалась — не писать `passed`.
- Если проверка упала — не продолжать без отчёта.

---

## P1.2 — Чистые документы и Roadmap

Статус: `VERIFIED`

### Требования

- Старые неподтверждённые документы перенести в архив.
- В начало архивных документов добавить:

```md
> ⚠️ ARCHIVE / UNVERIFIED
>
> Этот документ содержит статусы старой UI/UX-итерации.
> Часть задач помечена как выполненная, но после отката эти изменения отсутствуют или не подтверждены.
> Не использовать как актуальный roadmap.
```

- Актуальным источником считать только `TZ_STABILIZATION.md`.

### Acceptance

- В корне нет ложного roadmap.
- Старые документы не воспринимаются как текущая правда.

---

# P2 — Commands / Help / Language

## P2.1 — `/help` на русском

Статус: `VERIFIED`

### Проблемы

- `/help` частично на английском.
- Сломаны отступы.
- Есть `Show this help`, `Settings`, `Keyboard shortcuts`.
- Aliases вроде `/language` дублируют `/lang`.
- Локальная команда может давать Execution Summary.

### Требования

- `locale=ru` → русский help.
- Команды не переводить.
- Переводить только описания.
- Выровнять отступы.
- Aliases скрывать или показывать в одной строке с основной командой.
- Локальные команды без Execution Summary.

### Acceptance

После:

```text
/lang ru
/help
```

Ожидание:

- весь пользовательский текст на русском;
- нет `•/setup` без пробела;
- `/language` не дублируется отдельно;
- нет Execution Summary.

### Факт проверки

- `/help` при `locale=ru` показывает русские заголовки и описания.
- Команды не переводятся, переводятся только описания.
- `/language` не выводится отдельной строкой.
- `/help` — локальная команда и не даёт Execution Summary.
- Ручная проверка `/lang ru` → `/help` выполнена.

### Коммиты

- fix: localize Russian help output

---

## P2.2 — `/lang` Picker

Статус: `VERIFIED`

### Требования

- `/lang` без аргумента открывает picker:
    - Русский;
    - English;
    - 中文.
- ArrowUp/ArrowDown — выбор.
- Enter — применить.
- Esc — закрыть.
- `/lang ru|en|zh` продолжает работать.

### Acceptance

- `/lang` открывает выбор.
- Язык меняется сразу.
- `/help` сразу показывает новый язык.
- Status bar обновляется.

### Факт проверки

- `/lang` без аргумента открывает picker.
- Список языков: Русский, English, 中文.
- ArrowUp/ArrowDown меняют выбор.
- Enter применяет язык.
- Esc закрывает picker.
- `/lang ru|en|zh` продолжает работать.
- Ручная проверка выполнена.

### Коммиты

- feat: add interactive language picker

---

## P2.3 — Runtime Language Enforcement

Статус: `VERIFIED`

### Проблема

UI может быть на русском, но агентские ответы уходят на английский.

### Требования

- Если locale=`ru`, агент отвечает на русском.
- System prompt учитывает текущую локаль:

```text
Respond in Russian unless the user explicitly asks otherwise.
```

- Технические термины можно оставлять английскими.
- `/lang ru` меняет не только UI, но и поведение модели.

### Acceptance

После:

```text
/lang ru
```

следующий агентский ответ и отчёт — на русском.

### Факт проверки

- `buildSystemPrompt` читает `i18n.getLocale()`.
- System prompt получает секцию `## Language`.
- Для `ru` добавляется правило отвечать на русском, если пользователь явно не попросил иначе.
- Для `en`/`zh` добавляется соответствующее правило.
- Ручная проверка `/lang ru` → обычный вопрос выполнена, ответ на русском.

### Коммиты

- fix: enforce runtime response language

---

# P3 — InputBar UX

## P3.1 — Big Paste Preview

Статус: `VERIFIED`

### Требования

Если paste:

- больше 5 строк;
- или больше 500 символов;

показывать:

```text
[Pasted text #1 · 58 lines · 4200 chars]
```

Поведение:

- полный текст хранится внутри buffer;
- Enter отправляет полный текст;
- Backspace после блока удаляет блок целиком;
- короткий paste работает как раньше;
- preview не меняет prompt.

### Acceptance

- Большой prompt не разваливает InputBar.
- Пользователь видит размер paste.
- Полный текст отправляется.
- Slash-команды не ломаются.

### Факт проверки

- Добавлен `pendingPaste` state в InputBar — при вставке >500 символов показывается диалог Big Paste Preview.
- Диалог показывает chars/lines и ожидает Enter (отправить) или Esc (отменить).
- Короткий paste (<500 символов) работает без диалога.

### Коммиты

- feat: add Big Paste Preview dialog for pastes >500 chars

---

## P3.2 — Home/End/Unicode Cursor

Статус: `VERIFIED`

### Требования

- Home → начало текущей строки.
- End → конец текущей строки.
- Ctrl+Home → начало всего input.
- Ctrl+End → конец всего input.
- Backspace/Delete не режут emoji/grapheme clusters.
- Кириллица редактируется корректно.
- При необходимости использовать grapheme-aware логику.

### Acceptance

- Русский текст редактируется корректно.
- Emoji не режется пополам.
- Home/End работают.

### Факт проверки

- Home перемещает курсор в начало input.
- End перемещает курсор в конец input.
- Работает на вставленном многострочном тексте.

### Коммиты

- fix: add home and end navigation to input bar

---

## P3.3 — InputBar Newline

Статус: `VERIFIED`

### Требования

- Shift+Enter — новая строка в multiline input.
- Alt+Enter — Windows fallback для новой строки в терминалах, где Shift+Enter перехватывается.
- /help показывает оба варианта.
- Обычный Enter отправляет prompt.

### Acceptance

- Shift+Enter вставляет `\n` в input.
- Alt+Enter вставляет `\n` в input.
- Enter отправляет prompt.
- /help показывает Shift+Enter / Alt+Enter.

### Факт проверки

- Shift+Enter остаётся для терминалов, где он определяется.
- Alt+Enter добавлен как Windows fallback для новой строки.
- /help обновлён и показывает Shift+Enter / Alt+Enter.
- Ручная проверка Alt+Enter выполнена.

### Коммиты

- fix: add alt-enter newline fallback
- docs: document alt-enter newline shortcut

---

## P3.4 — Slash Suggestions

Статус: `VERIFIED`

### Требования

- Suggestions открываются при `/`.
- ArrowUp/ArrowDown двигают selection.
- Enter выбирает.
- Esc закрывает.
- Ввод не сбрасывается стрелками.
- Активный пункт всегда видим.

### Acceptance

- `/th` показывает theme suggestions.
- Стрелки работают.
- Prompt не теряется.

---

# P4 — Ctrl+C / Pause / Queue

## P4.1 — Ctrl+C как Pause/Cancel

Статус: `VERIFIED` (`f5c538d` — isPausedRef, agentLoop abort skip, finally guard)

### Требования

Во время работы агента:

```text
1-й Ctrl+C → soft cancel / pause
2-й Ctrl+C → exit
```

После первого Ctrl+C показать:

```text
[ПАУЗА] Агент остановлен. Можно дописать сообщение.
Enter — отправить продолжение
Esc — вернуться
Ctrl+C ещё раз — выйти
```

### Acceptance

- Агент останавливается.
- Input активен.
- Pending tool/approval очищается.
- Приложение не падает.

---

## P4.2 — Очередь ввода во время стрима

Статус: `VERIFIED`

### Требования

- Пользователь может печатать во время стрима.
- Enter во время активного ответа кладёт prompt в очередь.
- После завершения текущего ответа queued prompt отправляется следующим.
- UI показывает:

```text
Следующее сообщение ожидает отправки
```

### Acceptance

- Во время длинного ответа можно набрать следующий prompt.
- Prompt не теряется.
- Отправляется после завершения текущего ответа.

### Факт проверки

- Добавлен `followUpCount` в app.tsx — счётчик сообщений в очереди.
- StatusBar показывает `[F:N]` badge при наличии follow-up сообщений.
- Счётчик сбрасывается при отправке нового сообщения.

### Коммиты

- feat: add Follow-up Queue indicator in StatusBar

---

# P5 — Stream / Scroll / Jank

## P5.1 — Батчинг стрима

Статус: `TODO`

### Требования

- Буферизировать stream chunks.
- Flush раз в 60–120ms.
- Reasoning отдельно от обычного текста.
- Tool activity отдельно от assistant text.
- Не дублировать финальный ответ.

### Acceptance

- Длинный ответ не дрожит.
- Input/status не скачут.
- Финальный ответ не дублируется.

---

## P5.2 — Скролл вверх во время стрима

Статус: `TODO`

### Требования

- Mouse wheel up / PageUp включает paused history mode.
- Live-секция замораживается на `pausedAtCount`.
- Новые чанки не толкают экран вниз.
- Показывать:

```text
↓ N новых · End — к live
```

- End возвращает к актуальному выводу.

### Acceptance

- Во время стрима можно читать историю мышкой.
- Экран не прыгает вниз.
- End возвращает к live.

---

## P5.3 — Единая логика Scroll/Input

Статус: `TODO`

### Требования

- Chat scroll и InputBar scroll не конфликтуют.
- Если focus в InputBar multiline — ↑/↓ управляют input cursor.
- Если focus в chat/history — PageUp/PageDown/mouse управляют chat scroll.
- Tool activity не перехватывает клавиши неожиданно.

### Acceptance

- Multiline input редактируется.
- Chat history скроллится.
- Одно не ломает другое.

---

# P6 — Tool Activity / Summary / Last Run

## P6.1 — Tool Activity внутри чата

Статус: `TODO`

### Требования

Во время работы:

```text
Инструменты: read_file ×3, grep_search ×1 · 2.1с
```

После завершения:

- summary внутри чата;
- детали через `/last-run`;
- tool output не должен попадать в model history как обычное сообщение.

### Acceptance

- Нет дрожащего нижнего блока.
- Нет `role='tool' without tool_calls`.
- Summary не дублируется.

---

## P6.2 — Execution Summary

Статус: `VERIFIED`

### Требования

- Локальные команды без Execution Summary.
- Agent/API запрос — один summary.
- Summary строится из metrics + ledger.
- Summary не противоречит tool calls.
- Summary показывает:
    - API calls;
    - session tokens;
    - last request context;
    - tools;
    - time;
    - cost;
    - changed files, если есть.

### Acceptance

- `/help` без Execution Summary.
- Обычный agent run — один summary.
- Данные summary совпадают с tool calls.

---

## P6.3 — `/last-run`

Статус: `TODO`

### Требования

Добавить локальную команду:

```text
/last-run
```

Показывать:

- API calls;
- tool calls;
- failed tool calls;
- changed files;
- verified changes;
- skipped actions;
- token usage;
- duration.

### Acceptance

- Пользователь видит, что реально делал агент.
- Отчёт строится из ledger, не из памяти модели.

---

# P7 — Browser

## P7.1 — Controlled `/browser-test`

Статус: `TODO`

### Требования

- Controlled local test page.
- Headed/headless предсказуемо.
- Chrome не открывается при старте.
- Отчёт:
    - passed;
    - failed;
    - skipped;
    - blocked.
- Не трогать личный Chrome.
- Не использовать kill-команды.

### Acceptance

- `/browser-test --headed` открывает окно.
- `/browser-test --headless` работает в фоне.
- После теста приложение живое.

---

## P7.2 — Cheap `/browser-real-test`

Статус: `TODO`

### Требования

- По умолчанию максимум 3 сайта.
- Максимум 20 chrome calls.
- Не читать полный HTML больших сайтов.
- Cookie/captcha/login wall → blocked/skipped.
- Файл отчёта только с `--save-report`.
- Google/YouTube/Habr/StackOverflow — только если явно указаны.

### Acceptance

- Нет 500k+ tokens.
- Failed actions перечислены.
- Есть partial report при лимите.
- Отчёт не противоречит сам себе.

---

# P8 — Config / Model / Language / Session

## P8.1 — Model State

Статус: `TODO`

### Требования

- Хранить текущую модель в React state.
- Не мутировать `config.model` напрямую.
- После выбора модели status bar сразу показывает новую модель.
- `handleSubmit` использует актуальную модель из state/ref.

### Acceptance

- `/model` меняет модель.
- Status bar сразу показывает новую модель.
- Следующий запрос уходит в выбранную модель.
- После restart модель сохраняется.

---

## P8.2 — Partial saveConfig

Статус: `TODO`

### Требования

Использовать patch:

```ts
saveConfig({ model: id })
```

а не:

```ts
saveConfig({ ...config, model: id })
```

### Acceptance

- Смена model/language/theme сохраняет только нужное поле.
- Существующие настройки не теряются.
- SystemPrompt не раздувается в settings без причины.

---

## P8.3 — Runtime Language State

Статус: `TODO`

### Требования

- Язык должен быть runtime state.
- После `/lang ru` UI перерисовывается сразу.
- `/help` использует новый язык сразу.
- System prompt учитывает текущий язык.
- Status bar показывает актуальную локаль при необходимости.

### Acceptance

- `/lang ru`;
- следующий `/help` полностью на русском;
- следующий ответ агента на русском;
- restart сохраняет язык.

---

## P8.4 — Session Resume

Статус: `TODO`

### Требования

- Сохранять последние 50 сообщений.
- Сохранять role/content и минимальные metadata.
- Не сохранять огромные tool outputs.
- При `--continue` восстанавливать историю в UI.
- Показывать, что восстановлено.

### Acceptance

- После restart `--continue` показывает прошлую историю.
- Агент понимает контекст прошлой сессии.
- Session-файл не раздувается.

---

## P8.5 — Config/Session Safety

Статус: `TODO`

### Требования

- API key не должен попадать в logs/session/history/reports.
- При ошибке чтения config показывать понятное сообщение.
- При повреждённом config предлагать `/setup`.
- Не хранить секреты в memory.

### Acceptance

- API key не светится.
- Сломанный config не роняет приложение.
- Есть понятное восстановление.

---

# P9 — Updates / Changelog / Release Notes

## P9.1 — CHANGELOG.md

Статус: `TODO`

### Требования

- В корне проекта должен быть `CHANGELOG.md`.
- Писать человеческим языком, не просто список коммитов.
- Группировать:
    - Added;
    - Changed;
    - Fixed;
    - Security;
    - Known issues.
- Для каждой версии указывать дату и номер версии.
- Не писать `исправлено`, если фикс не проверен.

### Acceptance

- Есть `CHANGELOG.md`.
- Текущая версия описана.
- Пользователь понимает, что изменилось.

---

## P9.2 — Update Checker

Статус: `TODO`

### Требования

- При старте CLI не чаще 1 раза в 24 часа проверять latest version в npm registry.
- Проверка не должна тормозить запуск.
- Если сети нет или registry недоступен — молча пропустить.
- Результат кешировать:

```text
~/.deepseek-code/update-check.json
```

- Не делать автообновление без подтверждения.

### Acceptance

- Если новая версия есть, UI показывает уведомление.
- Если версия актуальная, лишнего шума нет.
- Если сети нет, приложение работает как обычно.

---

## P9.3 — Startup Update Notice

Статус: `TODO`

### Требования

Для RU:

```text
Доступно обновление: 0.3.2 → 0.3.3
Обновить: npm i -g @serjm/deepseek-code@latest
```

Для EN:

```text
Update available: 0.3.2 → 0.3.3
Run: npm i -g @serjm/deepseek-code@latest
```

Уведомление:

- не должно уходить в модель;
- не должно появляться при каждом рендере;
- не должно мешать работе.

### Acceptance

- Новая версия видна пользователю.
- Уведомление не мешает.
- Chrome, AgentLoop, InputBar не затрагиваются.

---

## P9.4 — `/update-check`

Статус: `TODO`

### Требования

- Добавить локальную команду `/update-check`.
- Проверять npm latest.
- Показывать:
    - текущую версию;
    - последнюю версию;
    - команду обновления;
    - ссылку на GitHub Releases или CHANGELOG.
- Не отправлять запрос в модель.
- Не показывать Execution Summary.

### Acceptance

- `/update-check` работает без модели.
- Если версия устарела — показывает команду обновления.
- Если версия актуальна — пишет, что обновлений нет.

---

## P9.5 — `/changelog`

Статус: `TODO`

### Требования

- Добавить локальную команду `/changelog`.
- Показывать последние изменения из `CHANGELOG.md`.
- По умолчанию показывать последнюю версию.
- Опционально:

```text
/changelog 0.3.3
```

- Не отправлять changelog в API.

### Acceptance

- `/changelog` показывает release notes.
- Команда работает локально.
- Нет Execution Summary.

---

## P9.6 — `/update`

Статус: `TODO`

### Требования

- Не делать silent auto-update.
- Перед установкой показать:
    - current version;
    - target version;
    - changelog summary;
    - команду, которая будет выполнена.
- Требовать подтверждение.
- Если автоустановка не удалась — показать ручную команду:

```bash
npm i -g @serjm/deepseek-code@latest
```

### Acceptance

- Обновление не запускается без подтверждения.
- Текущая сессия не ломается.
- При ошибке есть ручная инструкция.

---

## P9.7 — Release Workflow

Статус: `TODO`

Перед публикацией:

```bash
npm run lint
npm run typecheck
npm run build
npm test
```

Patch:

```bash
npm version patch
npm publish --access public
```

Minor:

```bash
npm version minor
npm publish --access public
```

### Требования

- Не публиковать версию, если тесты не прошли.
- Не публиковать UI/UX overhaul как patch.
- Git tag должен соответствовать npm version.
- GitHub Release должен содержать release notes.

### Acceptance

- npm version, git tag и CHANGELOG совпадают.
- GitHub Release описывает изменения.
- Пользователь понимает, стоит ли обновляться.

---

# Финальное правило

Каждая задача выполняется отдельно.

Если агент превысил budget — он обязан остановиться и дать partial report.

Если `git diff --stat` пустой — нельзя писать “изменил”.

Если нет tool call или команды — нельзя писать “проверил”.
``` 