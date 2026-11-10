# ActiveBook common

Общие правила, заготовки конфигураций и небольшие инструменты для **самостоятельных**
репозиториев ActiveBook. Это приватный ESM-пакет, без workspaces и внешних зависимостей.
Требуются Node.js 24.15+ и npm 11+: используется стандартный `fs.glob`.
Установка зависимостей самого common для запуска команд не требуется.

```text
active-book-common/
├── AGENTS.md
├── configs/                  # общие основы, аудит и способы подключения
├── scripts/
│   ├── repositories.js       # конфигурация и поиск manifests/workspaces
│   ├── npm.js                # запуск npm без shell
│   ├── dependencies/         # check и sync версий
│   └── check/                # последовательный запуск npm scripts
├── tests/                    # node:test, включая настоящий npm
└── package.json              # activeBook.repositories/sharedDependencies/checks
```

## Размещение репозиториев

По умолчанию клонируйте рядом `active-book-types`, `active-book-core`,
`active-book-editor`, `active-book-custom-test` и `active-book-common`.
Имена npm-пакетов берутся из настоящих package.json и могут отличаться от имён repos.
Common не устанавливает соседей и не собирает ядро автоматически.

В `package.json → activeBook.repositories` пустая строка означает `../<имя>` относительно
common. Непустой путь может быть относительным к common или абсолютным; например:

```json
{
  "active-book-editor": "../other-checkouts/editor"
}
```

Неизвестный `--repo`, недоступный repo, неправильный путь, повреждённый JSON и
некорректная конфигурация завершают команду с ненулевым кодом. Для доступных repos
отчёт продолжается. Это помогает заметить неполную облачную среду; для работы с её
доступной частью используйте явный фильтр.

## Версии зависимостей

```sh
npm run deps:check
npm run deps:check -- --repo active-book-core
npm run deps:sync -- --repo active-book-types,active-book-custom-test
npm run deps:check -- --repo active-book-core --repo active-book-editor
```

`deps:check` только читает manifests и выводит repo, путь, секцию, пакет, текущую и
ожидаемую версию. Код 1 означает расхождения или ошибки; код 0 — отсутствие расхождений.
Отсутствующая зависимость нормальна. Проверяются `dependencies`, `devDependencies`,
`peerDependencies`, `optionalDependencies`, корень и npm workspaces (массив или
`workspaces.packages`, glob-паттерны и исключения). `bundledDependencies` не содержит
версий; overrides/resolutions не являются декларациями зависимостей и не переписываются.

`sharedDependencies` задаёт **точные строки версий**, включая при необходимости prerelease.
Диапазон `^5.9.3` отличается от политики `5.9.3`, даже если сейчас установлен один пакет.
В начальную политику включены только уже используемые общие инструменты:

| Пакет | Версия | Причина |
| --- | --- | --- |
| typescript | 5.9.3 | одинаковая проверка публичных типов во всех четырёх repos |
| eslint | 10.14.0 | одинаковое исполнение общих правил core/editor |
| @typescript-eslint/parser | 8.72.1 | согласованная версия с плагином |
| @typescript-eslint/eslint-plugin | 8.72.1 | одинаковая диагностика TypeScript |

Эти версии уже присутствуют в manifests/locks; обновления на новые версии не предлагаются.
Исходные диапазоны сохранены: первое `deps:check` ожидаемо сообщает о `^` вместо точных
версий. Синхронизация на реальных repos не запускается скрыто. Применяйте её явной
командой и проверяйте diff manifest/lock. Для editor сначала нужен доступный архив core,
указанный в его file:-зависимости, либо явное обновление через `core:package`.

React/React DOM требуют согласования при интеграции, но custom-test пока использует
19.2.3, а core/editor — 19.3.1. Они не включены, чтобы не совмещать настройку инфраструктуры
с обновлением runtime/peer-контрактов. По той же причине не унифицируются @types/node
(20.x и 26.x), Vite (7.x и 8.x), Jest/Vitest и разные major jest-dom.

`deps:sync` меняет только существующие декларации в тех же секциях. Пропускаются
`file:`, tarballs, URL, git, npm aliases, workspace: и dist-tags; в отчёте они помечены
`SKIP special`. Они не считаются нарушением политики registry-версий. Пакеты ActiveBook
запрещено включать в sharedDependencies. Версии самих проектов не изменяются.

После изменения manifests в корне **каждого изменённого repo** запускается:

```sh
npm install --package-lock-only --ignore-scripts --no-audit --no-fund --package-lock=true
```

Lock генерирует npm; файл не редактируется вручную. npm учитывает workspaces и
`npm-shrinkwrap.json`, если он используется. Команда может обращаться в registry,
но не устанавливает пакеты в node_modules и не запускает lifecycle-скрипты.
При ошибке npm исходные manifests и существующие locks восстанавливаются побайтно;
новый незавершённый lock удаляется. Операция атомарна в пределах одного repo,
ранее успешно обработанные repos сохраняют результат. После успеха отдельно
выполните обычную установку (`npm ci`) там, где нужно обновить node_modules.

## Проверки

```sh
npm run check
npm run check -- --repo active-book-editor
npm run check:browser -- --repo active-book-core
npm test
```

Порядок определяется зависимостями npm-пакетов из manifests, включая workspaces,
dev/peer/optional: types раньше core/editor/custom-test, core раньше editor.
Фильтр выбирает только указанные repos, без автоматического добавления зависимостей.
Необходимо заранее установить их зависимости и подготовить локальные артефакты.
Цикл между repos и неоднозначный владелец npm-пакета считаются ошибкой.

| Repo | Проверки по умолчанию |
| --- | --- |
| types | typecheck, test (контракты NodeNext), test:bundler |
| core | typecheck, typecheck:test, lint:ts:check, lint:css:check, test:unit (Jest последовательно), test:scss-alias |
| editor | typecheck (включая workspaces/test), оба lint:*:check, test:unit, test:component (jsdom), test:scripts |
| custom-test | typecheck без генерации dist |

Списки находятся в `activeBook.checks` и `activeBook.browserChecks`, это обычные имена
существующих root npm scripts. Отсутствующий script отмечается `SKIP`; ошибка любого
запущенного script даёт итоговый код 1. Отчёт содержит RUN/PASS/FAIL и результат repo.
Проверки продолжаются после сбоя, чтобы собрать полный отчёт.

Для новых repos достаточно добавить путь. Без явного списка запускаются доступные
`typecheck`, `lint:check`, `test:unit`; произвольный `test` автоматически не запускается,
поскольку он может включать браузер. При добавлении repo сначала изучите его scripts.
В custom-test `validate` требует готовый dist, поэтому не является быстрой проверкой
исходников; полный `make` остаётся отдельной командой.

Общая проверка не вызывает install/build/make и не меняет зависимости. Новые scripts
`lint:*:check` работают без `--fix`; существующие команды с исправлениями сохранены.
Браузерные, визуальные и runtime-тесты включаются только через `check:browser`
(нужны отдельно установленные браузеры). Обычный `npm test` editor по-прежнему включает
все проекты; common намеренно использует его отдельные быстрые scripts.

Команды разрешают пути от расположения файлов common. Из любой директории:

```sh
npm --prefix /path/to/active-book-common run check -- --repo active-book-types
node /path/to/active-book-common/scripts/dependencies/check.js --repo active-book-types
```

На Windows используйте соответствующий путь и те же npm-команды. Дочерний npm
запускается через Node и npm-cli.js без shell и команд `cd`.

## Общие конфигурации и AGENTS

Аудит и варианты подключения описаны в [configs/README.md](configs/README.md).
Рабочие конфигурации соседей сохранены локально: клонирование одного repo не должно
ломаться из-за отсутствия common. Зависимости на соседние ActiveBook file:/tgz были
в проектах до этой задачи и остаются отдельным ограничением их установки.

Общие правила вынесены в AGENTS.md. Локальные документы содержат ссылку на него,
автономный минимум и предметные правила React/UI, сборки и проверок. Ссылка не
является автоматическим импортом, особенно в Codex с единственным clone.

## Проверка реализации

`npm test` проверяет фильтры/пути, ошибочный JSON/конфигурацию, workspace globs,
все секции зависимостей, специальные спецификаторы, отсутствие побочных записей
у deps:check, откат при ошибке npm, порядок/пропуски/сбои проверок и явное включение
браузера. Интеграционный тест использует настоящий npm и локальный HTTP registry
с тестовым пакетом, обновляет workspace lock и подтверждает отсутствие установки.
Все данные создаются во временных каталогах, в том числе с пробелами в пути.

В editor `npm run test:scripts` отдельно проверяет packageCore, ошибки make/install,
выбор scoped tarball после сборки и настоящую offline-установку npm с runtime workspace.

Проверено в текущей среде (Linux, Node 24.19.0, npm 11.9.0):

- `npm test` common: 10 тестов; `test:scripts` editor: 3 теста.
- `npm run check` common: все 16 проверок четырёх repos прошли, включая 47 Jest-тестов
  core, 8 scss-alias тестов, 67 unit- и 8 component-тестов editor.
- `build:editor` и `build:book` editor, `make` custom-test прошли.
- `core:package` с полной сборкой core и npm-установкой проверен в изолированной копии.
  Версии ActiveBook и manifest/lock пути в рабочих clones сохранены исходными.
- `deps:check` из другой директории вернул код 1 для 12 отличий диапазонов от точных
  версий; SHA-256 всех отслеживаемых файлов четырёх repos до/после совпал.
- Общие ESLint rules дают ту же эффективную конфигурацию, что локальные core/editor;
  Stylelint-объекты совпадают полностью. `npm ci` common работает без зависимостей.

Нативное исполнение проверено на Linux. Windows/macOS требуют проверки на соответствующих
runner; переносимость обеспечивается Node API и отсутствием shell в новых скриптах.
Браузерные/визуальные/E2E suites в этой задаче не запускались; общий быстрый check их не включает.

## Позже

После появления реестра выделить версионируемые пакеты конфигураций, подключить их
обычными devDependencies и удалить временные копии. Опубликовать core/types и заменить
file:/tgz обычными версиями. Затем удалить `core:package`, согласовать React/peer policy
и добавить CI-матрицу Windows/Linux/macOS. Common при этом остаётся отдельным repo.
