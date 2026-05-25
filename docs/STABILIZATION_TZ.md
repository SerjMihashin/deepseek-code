# DeepSeek Code Stabilization TZ

Дата: 2026-05-24
Проект: `@serjm/deepseek-code`
CLI: `dsc`
Ветка: `master`
Текущая опубликованная версия: `0.4.3`
Целевая ближайшая версия: `0.4.4`

## Главная цель

Довести `deepseek-code` до стабильного AI coding agent CLI для реальной разработки больших проектов. Агент должен прозрачно показывать работу, не ломать TUI, не скрывать ошибки, не оставлять временный мусор, честно строить отчеты и быть готовым к безопасной публикации в npm после ручного подтверждения пользователя.

## Что добавляем

- Релизный процесс `0.4.4` с явными проверками: lint, typecheck, build, tests, pack dry-run.
- Документированный large-project acceptance exam.
- Улучшенную политику Windows shell: PowerShell-compatible команды на Windows, без слепого `sed/head/cat`.
- Явные budget modes: `audit`, `normal`, `large`, `off` без жесткого default.
- Честное abort/error reporting для неожиданных stream abort/timeout.
- Правило session log: после каждой успешной итерации обновлять `docs/SESSION_LOG.md`.

## Что обновляем

- `CHANGELOG.md`: секция `0.4.4` с реальными изменениями и known issues.
- `package.json`: версия `0.4.4` только на релизной итерации.
- System prompt в `src/core/agent-loop.ts`: Windows policy, temp cleanup, honest report.
- TUI help/status: показать `PageUp/PageDown/End`, paused/follow state и отсутствие mouse wheel.
- Execution Summary: убедиться, что failed calls и partial failures отображаются честно.

## Что дорабатываем

- TUI: разделить live activity, streaming assistant text и status bar, чтобы интерфейс меньше дергался.
- Input: сохранить стабильность slash-команд и live follow-up.
- AgentLoop: различать user cancel и неожиданный abort.
- Cleanup: временные файлы не должны оставаться в `git status`.
- Budget: расширить `/budget` без включения жесткого лимита по умолчанию.

## Что не делаем сейчас

- Не включаем raw mouse reporting и mouse wheel в боевом TUI.
- Не включаем default interactive budget.
- Не делаем `npm publish`, `git tag`, `git push`, auto-commit без явного подтверждения.
- Не переписываем весь TUI одним большим изменением.

## Итерации

### Iteration 0: Documentation Baseline

Статус: `DONE`

Цель: зафиксировать актуальное ТЗ, отчет и session log.

Acceptance:
- Есть `docs/STABILIZATION_TZ.md`.
- Есть `docs/STABILIZATION_REPORT.md`.
- Есть `docs/SESSION_LOG.md`.
- В памяти Codex записано правило обновлять session log после успешной итерации.

### Iteration 1: 0.4.4 Release Audit

Статус: `DONE`

Цель: проверить текущую ветку как safe release candidate.

Работы:
- Проверить коммиты после `v0.4.3`.
- Подтвердить, что mouse wheel не включен.
- Подтвердить, что default budget не включен.
- Запустить `npm run lint`, `npm run typecheck`, `npm run build`, `npm test`.
- Проверить `git status --short --untracked-files=all`.

Acceptance:
- Все проверки либо passed, либо failures описаны в отчете.
- Нет временного мусора.
- Понятно, что входит и не входит в `0.4.4`.

### Iteration 2: Release Notes and Version

Статус: `DONE`

Цель: подготовить релизные файлы без публикации.

Работы:
- Обновить `CHANGELOG.md` для `0.4.4`.
- Обновить `package.json` и `package-lock.json` до `0.4.4`.
- Запустить проверки повторно.
- Запустить `npm pack --dry-run`.

Acceptance:
- Версия согласована в package files.
- Changelog описывает реальные изменения.
- Pack dry-run показывает ожидаемый состав пакета.

### Iteration 2.5: Pre-release Smoke Verification

Статус: `DONE`

Цель: проверить собранный CLI перед решением о публикации.

Работы:
- Проверить `node dist\cli\index.js --version`.
- Проверить `node dist\cli\index.js --help`.
- Проверить `node dist\cli\index.js --json` без prompt.
- Проверить `node dist\cli\index.js --headless` без prompt.
- Исправить найденные release blockers.

Acceptance:
- `--version` возвращает `0.4.4`.
- `--help` показывает usage.
- `--json` и `--headless` без prompt не запускают agent run.
- После фиксов проходят lint, typecheck, build, tests, pack dry-run.

### Iteration 3: Abort and Error Reporting Hardening

Статус: `DONE`

Цель: агент не должен молча исчезать.

Работы:
- Различить user cancel и неожиданный abort/timeout.
- Показать понятное сообщение при unexpected abort.
- По возможности вывести partial Execution Summary.
- Добавить тесты для error path.

Acceptance:
- User cancel не выглядит как crash.
- Unexpected abort виден пользователю.
- Финальный отчет не пишет success после обрыва.

### Iteration 4: Windows Shell and Temp Cleanup Policy

Статус: `TODO`

Цель: снизить failed shell calls и мусорные файлы на Windows.

Работы:
- Усилить system prompt: PowerShell/cmd-compatible commands on Windows.
- Запретить `sed/head/cat` без проверки доступности.
- Предпочитать `read_file`, `grep_search`, `glob`.
- Добавить финальный cleanup/check policy для temp files.

Acceptance:
- Prompt содержит явную Windows policy.
- Agent reports mention temp files if cleanup failed.
- `git status` не содержит мусор после successful run.

### Iteration 5: TUI Stability Stage 1

Статус: `TODO`

Цель: сделать интерфейс понятнее без mouse wheel.

Работы:
- Улучшить status/help для `PageUp/PageDown/End`.
- Явно показывать paused/follow state.
- Стабилизировать live activity card.
- Не включать terminal mouse mode.

Acceptance:
- Пользователь понимает, как читать историю.
- Ввод не ломается во время работы агента.
- Нет mouse escape мусора в input.

### Iteration 6: Budget Modes

Статус: `TODO`

Цель: сделать budget управляемым режимом, а не ловушкой.

Работы:
- Добавить `/budget normal`.
- Добавить `/budget large`.
- Оставить default `off`.
- Обновить help/status.

Acceptance:
- Большие задачи не душатся по умолчанию.
- Маленький аудит можно ограничить вручную.
- Halt report честно объясняет причину остановки.

### Iteration 7: Large Project Exam

Статус: `TODO`

Цель: проверить, что агент пригоден для реальной разработки.

Работы:
- Дать агенту задачу создать/доработать web-проект.
- Проверить build/dev/browser acceptance.
- Проверить failed tool calls, временные файлы, честность отчета.
- Зафиксировать результат в `docs/STABILIZATION_REPORT.md`.

Acceptance:
- Есть честный итог: passed, failed, not checked.
- Нет публикации/коммита без подтверждения.
- Решено, готов ли следующий релиз.
