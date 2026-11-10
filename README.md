# ActiveBook common

Приватный ESM-пакет с конфигурациями и небольшими скриптами для соседних репозиториев
ActiveBook. Требуются Node.js 24.15+ и npm 11+. Репозитории намеренно связаны через
локальные зависимости; автономная работа без common не предусматривается.

```text
active-book/
├── active-book-common/
├── active-book-types/
├── active-book-core/
├── active-book-editor/
└── active-book-custom-test/
```

Common не является workspace. Workspaces самого editor сохраняются.

## Установка и подключение

Сначала установите common, затем потребителей. При наличии lock-файла используйте
`npm ci`. Все команды скриптов common запускайте через npm: он передаёт путь к своему
CLI в `npm_execpath`, поэтому поиск npm и shell-экранирование не нужны.

В потребителях подключена обычная локальная зависимость:

```json
{
  "devDependencies": {
    "active-book-common": "file:../active-book-common"
  }
}
```

Конфигурации действительно загружаются из пакета через явные exports:

| Export | Назначение |
| --- | --- |
| active-book-common/eslint | ESLint Flat Config и общие параметры importOrder |
| active-book-common/stylelint | SCSS и порядок CSS-свойств, с разрешением плагинов внутри common |
| active-book-common/tsconfig.base.json | строгая типизация и согласованное написание имён файлов |
| active-book-common/tsconfig.library.json | настройки компилируемых библиотек core/custom-test |
| active-book-common/tsconfig.app.json | настройки приложений editor с Bundler resolution |
| active-book-common/vitest | coverage, unit/component и browser с Playwright/preview/screenshots |

Примеры наследования и границы конфигураций: [configs/README.md](configs/README.md).
ESLint/Stylelint плагины принадлежат common. Исполняемые eslint/stylelint/vitest остаются
в потребителях и согласованы peerDependencies common. Peers помечены optional, чтобы
потребитель только TypeScript-профиля не устанавливал все линтеры и тестовые инструменты.
Сам common устанавливает нужные инструменты для своих проверок в devDependencies.

В editor остаётся `@vitest/browser-playwright`: его context-типы непосредственно
используются `vitest/browser` и tsconfig.test.json. Копия в common нужна для загрузки
общего browser-профиля при file:-ссылке. Обе имеют одну существующую версию 4.1.12.
Jest ядра не переносился. Runtime-код приложения и ядра не менялся.

Первичная установка ядра в editor по-прежнему требует сборки соседнего core:
после установки types/core выполните `npm run core:package` в editor. Команда вызывает
`make` один раз, читает **после сборки** имя/версию, вычисляет scoped tarball и устанавливает
его в корень редактора через `npm install <archive> --save`. make повышает версию;
npm штатно обновляет manifest/lock. Корневой пакет владеет архивом, runtime workspace
использует его через `*`. `--no-save` оставил бы ссылку на удалённый старый архив.

## Политика зависимостей

Секции внутри activeBook имеют обычные названия npm и не связаны с собственными
зависимостями common в корне package.json:

```json
{
  "activeBook": {
    "repositories": {
      "active-book-types": "",
      "active-book-core": "",
      "active-book-editor": "",
      "active-book-custom-test": ""
    },
    "dependencies": { "classnames": "2.5.1" },
    "devDependencies": { "typescript": "5.9.3", "eslint": "10.14.0" }
  }
}
```

Все четыре секции необязательны: отсутствие поля означает пустой объект.
Один пакет может принадлежать только одной секции политики. Собственные root
peerDependencies + devDependencies common — обычное npm-устройство config-пакета,
а не часть политики синхронизации.

```sh
npm run deps:sync
npm run deps:sync -- --repo active-book-editor
npm run deps:sync -- --repo active-book-types,active-book-core
```

Команда рассматривает только **уже объявленные** пакеты, отдельно в корне и каждом
workspace. Если пакет отсутствует, он не добавляется. Workspaces определяет сам npm
через `npm pkg get --workspaces --json`; собственного обхода glob-паттернов нет.

| Секция | Флаг установки |
| --- | --- |
| dependencies | --save-prod |
| devDependencies | --save-dev |
| peerDependencies | --save-peer |
| optionalDependencies | --save-optional |

Изменения группируются: одна категория — один install в соответствующем root/workspace.
Для prod/dev/optional npm получает существующие пакеты и `--save-exact`. Перенос между
prod/dev выполняет сам npm. Двойная декларация или перенос с изменением смысла
peer/optional считается конфликтом и требует явного решения.

Peer-политика может содержать диапазон совместимости. npm install с аргументом
`package@range` может сузить его до установленной версии. Поэтому для peers сначала
штатный `npm pkg set` записывает декларации, затем один `npm install --save-peer` без
аргументов пакетов обновляет установку и lock, сохраняя исходные диапазоны.
Это также работает для точных peer-версий; собственного semver-парсера нет.

Локальные file:/link:/workspace: и .tgz декларации пропускаются. Версии самих проектов
не синхронизируются. Без расхождений install не запускается. Ошибка npm прекращает
синхронизацию с кодом 1; уже сделанные изменения остаются видимыми в Git.
Нет snapshots, собственного rollback или ручного редактирования lock-файлов.
Команда устанавливает зависимости и может выполнять обычные npm lifecycle-скрипты.

Начальная политика использует существующие версии: classnames 2.5.1; в dev-секции —
TypeScript 5.9.3, ESLint 10.14.0, Stylelint 16.26.1, Vitest 4.1.12 и Playwright 1.65.0.
React/его типы, разные Vite, Node-типы и Jest/Vitest не объединяются произвольно.
Пустые peer/optional категории можно не указывать, пока согласованной политики для них нет.

## Проверки

Общий объект activeBook.checks задаёт группы; отдельные списки для repos не нужны.
Каждый repo участвует только в тех проверках, для которых имеет npm scripts.

| Команда | Выполняет |
| --- | --- |
| npm run check | все группы, **включая browser/runtime** |
| npm run typecheck | typecheck, typecheck:test |
| npm run lint | TypeScript + CSS |
| npm run lint:ts / lint:css | соответствующую группу линтеров без --fix |
| npm test | unit + component + browser/runtime |
| npm run test:unit | unit, scripts, scss-alias и bundler, если script существует |
| npm run test:component | component в jsdom |
| npm run test:browser | browser и runtime |
| npm run test:infrastructure | только собственные тесты common |

Все группы поддерживают `--repo` (через запятую или повторением флага):

```sh
npm run lint -- --repo active-book-core --repo active-book-editor
npm run test:unit -- --repo active-book-types,active-book-editor
```

Порядок ключей activeBook.repositories является порядком зависимостей: types, core,
editor, custom-test. Простой фильтр его сохраняет. Пустой путь означает `../<repo>`
от common; непустой путь — явный абсолютный или относительный к common.

Проверки не устанавливают зависимости самих репозиториев. Отсутствующие scripts отмечаются SKIP; вывод
выполняемых команд сохраняется. Ошибка не останавливает остальные проверки/repos.
В конце выводится таблица passed/failed/skipped и отдельный список ошибок с repo,
script и exit code. Итоговый код 1 означает хотя бы один сбой. Агрегирующие локальные
`test`/`check` не запускаются. В editor typecheck проверяет workspace-исходники,
а typecheck:test запускается отдельно, без дублирования. В types для контрактов NodeNext
добавлен test:unit; существующие test/test:bundler продолжают работать.

Для браузеров заранее установите Chromium средствами Playwright. Можно явно выбрать
имеющийся браузер через PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH (в Linux проверен /usr/bin/chromium).
Установка браузера не входит в check. На Windows задавайте переменную обычным способом
PowerShell; Node-скрипты не используют команды cd или платформозависимый shell.

## Новый репозиторий

```sh
npm run init:repo -- --repo active-book-new-project
```

Из presets/ копируются .editorconfig, .gitignore и AGENTS.md. Существующие файлы
сохраняются; `--force` явно разрешает перезапись. Новый repo может ещё отсутствовать
в регистрации; по умолчанию используется соседняя директория. Если путь уже записан
в repositories, используется он. Скрипт не создаёт Git/npm-проект и не меняет package.json.

Затем добавьте локальную devDependency common, нужные imports/extends, npm scripts
и запись в repositories в правильном порядке. Локальный AGENTS.md ссылается на общий
документ и содержит особенности проекта. EditorConfig/Gitignore после копирования
настраиваются локально и автоматически больше не синхронизируются.

## Структура и тесты

- configs/ — настоящие общие конфигурации и порядок CSS-свойств.
- scripts/ — общий доступ к repo-конфигурации, deps-sync.js, check.js, init-repo.js.
- presets/ — три начальных локальных файла.
- tests/ — сценарии CLI, настоящий npm с локальным registry и загрузка конфигураций.

Тесты проверяют категории/flags, необязательные секции, отсутствие лишних установок,
workspace manifests/locks, peer-диапазоны, конфликты, выбор всех групп, пропуски,
продолжение после ошибок и init без перезаписи. Нативный npm-тест использует только
временные данные и локальный HTTP registry. Конфигурации проверяются в core/editor,
а Vitest дополнительно запускается в новом временном проекте с unit и jsdom.
Архивный процесс редактора проверяется отдельным offline npm-тестом.


## Результат проверки рефакторинга

Проверено на Linux, Node.js 24.19.0, npm 11.9.0:

- npm ci прошёл во всех пяти репозиториях, без старых node_modules.
- npm run test:infrastructure: 12 тестов, включая настоящий npm/local registry и
  новый Vitest-проект с unit/jsdom.
- Финальный npm run check с системным Chromium: types 3, core 7, editor 9,
  custom-test 1 — всего 20 npm-проверок, без ошибок. В их числе 47 Jest-тестов,
  8 scss-alias, 62 browser-теста core, 67 unit, 8 component и 14 browser-тестов editor,
  offline-тест packageCore и production runtime scenario.
- Полная сборка core/установка архива через core:package и build:editor/build:book
  прошли. make штатно изменил core с 0.0.57 на 0.0.58; editor сохраняет архив 0.0.58.
- deps:sync применён к реальным repos, зафиксировав уже используемые версии.
  Повторный запуск: OK: no changes во всех четырёх repos, без install.
- Эффективные ESLint/Stylelint rules сопоставлены с исходными; compilerOptions всех
  девяти tsconfig сохранены, кроме явно записанного уже действующего casing default.

Один ранний test:runtime под параллельной нагрузкой получил толщину 50 вместо 45.
Сценарий прошёл на исходной ревизии, при отдельном повторе и в финальном общем check;
runtime-код и сам сценарий не менялись. Это остаётся сигналом нестабильности теста.
ESLint выводит существующие предупреждения, сборка — предупреждения о размере chunks.
Windows/macOS нативно не запускались; новые скрипты используют Node API без shell.

Скрипты common + packageCore сократились с 525 до 237 строк, с 9 до 5 файлов.
Из core/editor удалены 18 файлов дублировавшегося style-order. Новые профили и presets
добавлены явно; тесты больше не удерживают старый поиск npm, rollback или обход globs.
