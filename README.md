# ActiveBook: общая инфраструктура

`@active-book/common` — приватный ESM-пакет общих конфигураций TypeScript, ESLint,
Stylelint, Vitest и базовых стилей. Скрипты запускают проверки соседних репозиториев
и согласуют уже объявленные зависимости. Runtime книги в этот пакет не входит.

ActiveBook — разрабатываемый комплект для создания и чтения иллюстрированных историй
с текстом, медиа и эффектами. Проект находится **до первого релиза**: на новом движке
ещё нет выпущенных книг. Демонстрации и тестовые книги не являются релизами продукта.

## Репозитории

Все четыре репозитория должны находиться рядом:

```text
active-book/
├── active-book-common/  # конфигурации, соглашения и общие команды
├── active-book-types/   # публичные TypeScript-контракты без runtime
├── active-book-core/    # браузерный движок, компоненты и ресурсы
└── active-book-editor/  # редактор, сборщик историй и production reader
```

Common не является workspace. В editor остаются существующие workspaces `apps/*`
и `packages/*`. Между репозиториями используются обычные npm-зависимости `file:`.
Для клонирования необходим доступ ко всем четырём репозиториям GitHub; для зависимостей
и первой установки Chromium нужен доступ к соответствующим серверам загрузки.

## Среда разработки

- Node.js **24 LTS**, не ниже 24.15.0 в ветке 24.x.
- npm **11.x**.
- Git; для запуска и проверки интерфейса — современный Chromium/Chrome.

В `.nvmrc` каждого репозитория зафиксирован Node.js **24.19.0**. С ним проверяется
npm **11.9.0**. При использовании nvm выполните `nvm install` и `nvm use`;
nvm необязателен, если подходящая версия Node.js уже установлена.

Node.js нужен инструментам разработки и сборки. Собранная книга работает в браузере.
В core требования разработки заданы отдельно через `devEngines`: более широкий
`engines.node` распространяемого пакета не означает поддержку его инструментов на Node.js 20/22.

## Установка с нуля и запуск редактора

Команды ниже выполняются из нового родительского каталога. Не нужны готовые `lib/`,
архив core, публикация пакетов в npm или дополнительные репозитории с компонентами.

```sh
git clone https://github.com/KrimsonKing1337/active-book-common.git
git clone https://github.com/KrimsonKing1337/active-book-types.git
git clone https://github.com/KrimsonKing1337/active-book-core.git
git clone https://github.com/KrimsonKing1337/active-book-editor.git

cd active-book-common
node --version
npm --version
npm ci

cd ../active-book-types
npm ci

cd ../active-book-core
npm ci
npm run build

cd ../active-book-editor
npm ci
npm run dev
```

Откройте адрес, напечатанный Vite, обычно `http://localhost:5173`.
Редактор использует File System Access API: для работы с проектом нужен Chromium
и безопасный контекст (`localhost` подходит). На другом устройстве потребуется HTTPS.
Создайте пустую папку и выберите «Новый проект» либо откройте папку с `book.json`.
Подробности интерфейса и сборки: [README редактора](https://github.com/KrimsonKing1337/active-book-editor/blob/main/README.md).

**Порядок установки обязателен.** npm связывает локальные каталоги, но не устанавливает
их зависимости вместо владельца. Сначала установите common, затем types, затем core;
до установки/запуска editor соберите core. Его `exports` указывают в `lib/src/`.
Один `npm ci` в editor не создаёт отсутствующий `lib/` соседнего ядра.

Редактор содержит зависимость `@active-book/core: file:../active-book-core`.
После изменения core выполните `npm run core:build` в editor и перезапустите Vite.
Повторная установка архива не требуется. `npm run core:package` только собирает и
упаковывает core, не заменяя локальную зависимость и не повышая версию.

## Сборка production reader

Из корня editor:

```sh
npm run build:editor
npm run build:book
npm run preview
```

`build:editor` собирает интерфейс редактора в `apps/editor/dist/`.
`build:book` собирает зафиксированную демонстрационную книгу `example-book/` в `dist-book/`.
Её демонстрационный TGZ с компонентом уже находится в Git, собирать пятый репозиторий не нужно.
`preview` обслуживает именно `dist-book/`, обычно на `http://localhost:4173`.
Открывать reader через `file://` нельзя: ему нужны HTTP-загрузка модулей, медиа и WASM.

## Проверки

Установка и сборка выше должны быть завершены до общих проверок: тесты конфигураций
common читают соседние репозитории. Для browser suites установите Chromium из editor:

```sh
cd ../active-book-editor
npx playwright install chromium
```

На Linux для установки системных библиотек Playwright при необходимости используется
`npx playwright install --with-deps chromium` (может потребовать административных прав).
Можно выбрать уже установленный Chromium переменной `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`;
пути и примеры для PowerShell приведены в README редактора. jsdom не заменяет browser suites.

Команды common запускаются **через npm** из его каталога:

| Команда | Назначение |
| --- | --- |
| `npm run test:infra` | Собственные инфраструктурные тесты common |
| `npm run typecheck` | `typecheck` и `typecheck:test` в зарегистрированных репозиториях |
| `npm run lint` | Штатные проверки TypeScript и SCSS без исправлений |
| `npm run test:unit` | Unit, инфраструктурные, SCSS alias и Bundler-проверки, если команды объявлены |
| `npm run test:component` | Component-тесты editor в jsdom |
| `npm run test:browser` | Browser suites core/editor и интеграционный production reader |
| `npm test` | Все группы тестов, включая браузер |
| `npm run check` | Все группы проверок, включая линтеры и браузер |

Группы можно ограничить репозиториями:

```sh
npm run typecheck -- --repo active-book-types,active-book-core
npm run test:unit -- --repo active-book-editor
npm run lint:css -- --repo active-book-core,active-book-editor
```

Runner сохраняет порядок types → core → editor, пропускает отсутствующие команды,
продолжает после ошибок и в конце возвращает ненулевой код при сбое.
Он не устанавливает зависимости. Не запускайте общую группу параллельно с её подгруппами.

CI сейчас отсутствует. `test:ci` в editor — локальная команда отчётов, а не настроенный CI.
Есть известные нарушения ESLint и геометрический browser-тест editor; полная группа
`check` поэтому может завершаться ошибкой. Они не блокируют установку и запуск.
Исправление и расширение линтеров вынесены за пределы подготовки к просмотру.

## Общие конфигурации

| Export | Назначение |
| --- | --- |
| `@active-book/common/eslint` | Flat config, parser, плагины, правила TS/JSX/hooks и `importOrder` |
| `@active-book/common/stylelint` | SCSS и порядок CSS-свойств |
| `@active-book/common/tsconfig.base.json` | Строгая типизация и регистр имён файлов |
| `@active-book/common/tsconfig.library.json` | Компиляция библиотеки core |
| `@active-book/common/tsconfig.app.json` | Приложения editor с Bundler resolution |
| `@active-book/common/vitest` | Общие профили unit/component/browser и отчёты покрытия |
| `@active-book/common/styles` | Базовые стили внутренних приложений |

Потребители устанавливают `@active-book/common: file:../active-book-common`.
Плагины конфигураций принадлежат common; исполняемые ESLint/Stylelint/Vitest остаются
в потребителях. Подключение: [configs/README.md](configs/README.md).

## Согласование зависимостей

`activeBook` в `package.json` регистрирует соседние репозитории и ожидаемые версии
в `dependencies` и `devDependencies`. Команды для осознанного обновления:

```sh
npm run deps:sync
npm run deps:sync -- --repo active-book-editor
```

Это **не шаг первичной установки**. Скрипт использует обычный npm install и меняет lockfile.
Он обновляет только существующие пакеты в ожидаемых секциях; отсутствующие не добавляет,
категории не переносит, peer/optional не синхронизирует. Локальные file/link/workspace
зависимости и TGZ пропускаются. Ошибки категорий собираются, корректные обновления продолжаются;
ошибка npm останавливает работу. Отката нет, версии самих проектов не повышаются.
Тестовые/исторические custom-test репозитории не зарегистрированы и не нужны для запуска.

## Структура и соглашения

- `configs/` — используемые конфигурации и локальные тесты правил.
- `styles/` — общие стили; порядок импорта: common → core → приложение.
- `scripts/` — runner, согласование зависимостей, инициализация репозиториев.
- `presets/` — начальные `.editorconfig`, `.gitignore`, `AGENTS.md` для `init:repo`.
- `tests/` — CLI, локальный npm registry и проверки интеграции конфигураций.

`npm run init:repo -- --repo active-book-new-project` копирует начальные файлы,
не создавая workspace или package.json; существующие файлы сохраняются без `--force`.
Правила разработки: [CODING_CONVENTIONS.md](CODING_CONVENTIONS.md).
Инструкции для агентов: [AGENTS.md](AGENTS.md).
