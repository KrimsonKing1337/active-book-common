# ActiveBook common

Приватный ESM-пакет `@active-book/common` с конфигурациями и небольшими скриптами для соседних репозиториев
ActiveBook. Требуются Node.js 24.15+ и npm 11+. Репозитории намеренно связаны через
локальные зависимости; автономная работа без common не предусматривается.

```text
active-book/
├── active-book-common/
├── active-book-types/
├── active-book-core/
└── active-book-editor/
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
    "@active-book/common": "file:../active-book-common"
  }
}
```

Конфигурации действительно загружаются из пакета через явные exports:

| Export | Назначение |
| --- | --- |
| @active-book/common/eslint | ESLint Flat Config и общие параметры importOrder |
| @active-book/common/stylelint | SCSS и порядок CSS-свойств, с разрешением плагинов внутри common |
| @active-book/common/tsconfig.base.json | строгая типизация и согласованное написание имён файлов |
| @active-book/common/tsconfig.library.json | настройки компилируемых библиотек core/custom-test |
| @active-book/common/tsconfig.app.json | настройки приложений editor с Bundler resolution |
| @active-book/common/vitest | coverage, unit/component и browser с Playwright/preview/screenshots |

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
      "active-book-editor": ""
    },
    "dependencies": { "classnames": "2.5.1", "react": "19.3.1", "react-dom": "19.3.1" },
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

Скрипт синхронизирует только версии **в уже правильной секции**. Одинаковая версия
не вызывает install. Изменения одной категории группируются в один обычный
`npm install package@version --save-<category> --save-exact` на root/workspace.
Категории не меняются автоматически ни для одного типа зависимостей.

Несовпадение категории и несколько деклараций одного пакета — ошибки конфигурации.
Такая зависимость исключается из обновлений; в конце выводятся repo/workspace,
пакет, Expected/Actual секции и `No changes made`. Корректные пакеты продолжают
обновляться, в том числе в следующих workspaces/repos. При хотя бы одной такой
ошибке итоговый exit code равен 1. Конфигурация с одним пакетом в двух секциях самой
политики также недопустима.

Все категории, включая peerDependencies, используют обычный npm install со списком
пакетов. Специального сохранения peer-диапазонов, npm pkg set и установки без списка
пакетов нет: npm сохраняет версию по своим правилам. Текущая политика использует точные
версии и не задаёт общие peer-пакеты.

Локальные file:/link:/workspace: и .tgz декларации в ожидаемой секции пропускаются.
Версии проектов не меняются. Ошибка самого npm прекращает синхронизацию немедленно
со стандартным выводом npm и ненулевым кодом; отката и повторных попыток нет.
Lock-файлы обновляет npm, ручного редактирования нет. Обычные lifecycle-скрипты npm
могут выполняться во время установки.

Политика prod фиксирует classnames 2.5.1, React и React DOM **19.3.1 без диапазонов**.
Dev-политика: TypeScript 5.9.3, ESLint 10.14.0, Stylelint 16.26.1, Vitest 4.1.12,
Playwright 1.65.0. React-типы, разные Vite/Node-типы и Jest не унифицируются произвольно.
Пустые peer/optional секции можно не указывать.

В `@active-book/book-builder` React остаётся peerDependency `^19.2.3`. Общая политика
ожидает dependencies, поэтому deps:sync честно сообщает одну ошибку конфигурации и
не меняет ни секцию, ни версию этой декларации. Runtime-dependencies core и двух
приложений editor фиксируются на 19.3.1. Решение о категории React для book-builder
должно приниматься явно, отдельно от синхронизации версий.

Управляются только types, core и editor. `active-book-custom-test` и
`active-book-custom-test-book` не зарегистрированы и не участвуют в deps:sync,
check, lint, test или подгруппах; явный --repo с этими именами отклоняется.
Они обслуживаются вручную, их зависимости не изменяются.

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
editor. Простой фильтр его сохраняет. Пустой путь означает `../<repo>`
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
workspace manifests/locks, ошибки категорий без переноса, продолжение обновлений и исключение
тестовых repos, выбор всех групп, пропуски,
продолжение после ошибок и init без перезаписи. Нативный npm-тест использует только
временные данные и локальный HTTP registry. Конфигурации проверяются в core/editor,
а Vitest дополнительно запускается в новом временном проекте с unit и jsdom.
Архивный процесс редактора проверяется отдельным offline npm-тестом.


## Проверка текущего изменения

`deps-sync.js` сокращён с 92 до 77 строк. Удалены автоматические переносы prod/dev,
специальные ветвления peer/optional, npm pkg set и install без списка пакетов.
Ошибки категорий теперь собираются в массив строк; одна общая проверка исключает
обновление всех конфликтующих деклараций.

Тесты включают настоящий npm/local registry: конфликтующая зависимость остаётся в
своей секции с исходной строкой версии, корректные версии/lock/workspaces обновляются.
Переименование npm-пакета проверяется загрузкой общих ESLint/Stylelint/TypeScript/Vitest
конфигураций и запуском нового Vitest-проекта. Windows/macOS нативно не запускались.


Проверено для этого изменения: 14 тестов common (включая настоящий npm/local registry),
проверки типов всех трёх управляемых repos, TypeScript/CSS lint, unit-тесты (47 Jest,
8 scss-alias, 67 unit редактора и offline-тест архива), 8 component-тестов и build:editor.
Повторный deps:sync не запускает install и возвращает код 1 только из-за сохранённой
peer-декларации React в book-builder. Браузерные suites в этой задаче не перезапускались.
Файлы и зависимости тестовых репозиториев не изменены.
