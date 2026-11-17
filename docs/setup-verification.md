# Проверка установки и интеграции ActiveBook

Проверено 17.11.2026 в Linux (Debian 13), Node.js **v24.19.0**, npm **11.9.0**,
настоящий **Chromium 154.0.8037.57** (`/usr/bin/chromium`). jsdom использовался только
для отдельного component-набора, не вместо browser-проверок.

## Источники и изоляция

Создан отдельный каталог `/workspace/active-book-review.KFzznv`. Все четыре репозитория
заново клонированы из GitHub по HTTPS. Существующие node_modules, lib, архивы core,
Vite-кэши и незафиксированные файлы исходных рабочих каталогов не копировались.
Npm registry cache также начат пустым, внутри этого проверочного каталога.
Зафиксированные TGZ демонстрационных библиотек получены только из Git.

Проверялись изменения веток `codex/reviewer-setup`, опубликованные в GitHub, без merge в main.
Исходные main: common `ea110d3`, types `f4ff0b7`, core `c13fa07`, editor `71dffa6`.
Ревизии с проверенным кодом/конфигурациями:

| Репозиторий | Ревизия |
| --- | --- |
| common | `dd6ef1c` |
| types | `8ee5438` |
| core | `028e90f` |
| editor | `3d36878` |

Последующие изменения этих веток относятся к документации, включая этот отчёт.
До объединения PR для воспроизведения нужны все четыре одноимённые ветки; после
объединения инструкция в README рассчитана на обычные клоны main.

Фактическая подготовка checkout:

```sh
git clone --branch main --single-branch https://github.com/KrimsonKing1337/active-book-common.git
git clone --branch main --single-branch https://github.com/KrimsonKing1337/active-book-types.git
git clone --branch main --single-branch https://github.com/KrimsonKing1337/active-book-core.git
git clone --branch main --single-branch https://github.com/KrimsonKing1337/active-book-editor.git
```

В каждом клоне: `git fetch origin codex/reviewer-setup`, затем
`git switch --detach FETCH_HEAD`. Исправления во время проверки поступали также
через GitHub fetch, без копирования исходников из исходных рабочих директорий.
Вначале подтверждено отсутствие node_modules во всех клонах и lib/tgz в core.

## Команды установки

Для изоляции npm задан `npm_config_cache` в новом проверочном каталоге. Эта настройка
не является требованием проекта; обычный пользователь может использовать свой npm cache.
Команды запускаются из соответствующих репозиториев в следующем порядке:

```sh
cd active-book-common
npm ci
cd ../active-book-types
npm ci
cd ../active-book-core
npm ci
npm run build
cd ../active-book-editor
npm ci
```

Первый build выявил отсутствующую зависимость cryptr. После исправления повторены
`npm ci` и `build` core, и только затем выполнен `npm ci` editor. Все шаги завершились успешно.
На момент установки editor архива core не было. Рабочие деревья после установки чистые.
Ни force, ни legacy-peer-deps, ни отключение integrity не использовались.

`node_modules/@active-book/core` в editor — настоящая ссылка на соседний core.
`npm ls react react-dom --all --json` не сообщает нарушений: обе библиотеки имеют
версию **19.3.1**. Физические зависимости core устанавливаются в его каталоге;
единую React-идентичность браузерного приложения обеспечивает существующий Vite dedupe.
Для самого core сохранён единый ESM-граф.

## Dev-сервер, ресурсы и готовый reader

Проверены обе документированные формы запуска из editor:

```sh
npm run dev
npm run dev -w active-book-editor -- --host 127.0.0.1 --port 5173 --strictPort
```

В Chromium открыт настоящий интерфейс, загружена example-book, отображены текст
и компонент из зафиксированной TGZ-библиотеки, выполнено нажатие счётчика.
Для автоматизации только native directory picker заменён получением настоящего
Chromium OPFS directory handle; чтение файлов, IndexedDB, React и core не подменялись.
После проверки каждый dev-сервер остановлен.

Подтверждено:

- Публичные exports JS/TS и ресурсов указывают непосредственно в `core/lib/src/`.
- SCSS обработан Vite, интерфейс использует Inter, поверхность книги — Roboto.
- SVG, постер и WOFF доступны через настоящий HTTP dev-сервер; байты совпадают с файлами core.
- `/vendors/dotlottie-player.wasm` возвращает 200 и `application/wasm`.
  Бинарник совпадает с core, имеет 1 490 523 байта и компилируется Chromium WebAssembly API (23 exports).
- Нет ошибок страницы, console errors и HTTP-ошибок при dev smoke-прогоне.
- Нет загрузки отдельного React из core/node_modules; runtime-компоненты не вызывают invalid hook call.

Для reader выполнены:

```sh
npm run build:editor
npm run build:book
npm run preview
```

Default example-book проверена в настоящем Chromium по `http://localhost:4173/`:
начало чтения, текст, интерактивный компонент и production WASM, без ошибок страницы/ресурсов.
После runtime workflow-тестов default `build:book` выполнен повторно: эти тесты могут
перезаписывать один dist-book своими фикстурами. Dev и preview не заменялись jsdom.

## Сборка и упаковка core

Из свежего editor дополнительно выполнены:

```sh
npm run core:build
npm run core:package
```

Обе команды проходят. SHA-256 package.json и package-lock.json core/editor до и после
совпадают; версия core остаётся **0.0.64**, зависимость editor остаётся
`file:../active-book-core`. Архив создаётся отдельно в core/tgz и не устанавливается в editor.

`test:scripts` core дополнительно проверяет два build/pack, воспроизводимость, отсутствие
тестов/фикстур/Jest setup в архиве, public exports и runtime-ресурсы. Перемещения lib/src
при установке и postinstall нет. Готовая production-упаковка сохранена.

## Результаты проверок на свежих клонах

| Репозиторий / команды | Результат |
| --- | --- |
| common: `test:infra` | 56 тестов проходят |
| types: `typecheck`, `test`, `test:unit`, `test:bundler` | Проходят; NodeNext и Bundler, без JS emit |
| core: `typecheck`, `typecheck:test` | Проходят |
| core: `test:unit` | 349 тестов, 47 suites проходят |
| core: `test:scripts` | 22 теста проходят, включая реальную упаковку |
| core: `test:scss-alias` | 8 тестов проходят |
| core: `test:browser` | 133 теста проходят |
| editor: `typecheck`, `typecheck:test` | Проходят |
| editor: `test:unit` | 240 тестов, 33 файла проходят |
| editor: `test:component` | 17 тестов, 11 файлов проходят |
| editor: `test:scripts` | 2 теста проходят: HTTP-ресурсы и реальный npm directory/pack workflow |
| editor: два browser regression-сценария контекстов на холодном Vite cache | 2/2 проходят |
| editor: полный `test:browser` | 120 passed, 1 skipped, 1 известный geometry failure |
| editor: `test:runtime` | 1 тест проходит |
| editor: `test:media:runtime` | 2 теста проходят |
| editor: `test:media:workflow` | 1 тест проходит |
| editor: `test:tgz:workflow` | 3 теста проходят |
| editor: `build:editor`, `build:book` | Проходят |
| core/editor: штатный `lint:css:check` | Проходит; покрытие линтера не расширялось |
| core: `lint:ts:check` | Известный долг: 297 ошибок / 38 предупреждений |
| editor: `lint:ts:check` | Известный долг: 1 ошибка / 49 предупреждений |

Изменённые инструменты и новые инфраструктурные тесты дополнительно проверены общим
ESLint preset в Node-окружении без TypeScript project: ошибок нет. Поскольку штатный
main ещё не проверяет scripts целиком, это отдельная проверка, не заявление о полном покрытии.
Массового autofix и изменений правил ESLint/Stylelint не было.

## Обнаруженные и устранённые блокеры

| Проблема | Минимальное исправление |
| --- | --- |
| Сохранённый src/utils/cryptr.ts импортировал не объявленный пакет; чистый tsc падал | Восстановлена зависимость cryptr 6.4.0. Файл с комментарием «Не удалять» сохранён без изменений; шифрование не объявлено реализованной возможностью |
| Directory link вывел шрифты core за стандартный Vite serving allow list, ответы 403 | Разрешён реальный lib/src связанного core, fs.strict сохранён; родительский каталог целиком не открыт |
| Vitest отдельно предсобирал подмодули core и дублировал visual/Redux React contexts | Core исключён из prebundle целиком, используется один ESM-граф; runtime-контексты не менялись |
| После исключения core динамические тестовые импорты поздно обнаруживали SDK и перезагружали suite | Его реальные frontend-зависимости заранее включены стандартным Vite nested include; холодный regression-прогон проходит |
| example-book содержала больше не поддерживаемый builtin Counter и показывала Unknown component | Удалена только устаревшая вставка из демоданных, оставлен рабочий Counter из TGZ; совместимость не добавлялась |
| Два старых теста common ожидали одиночный config.rules и старый текст deps-sync | Исправлены только обращения к flat config и expectation; правила и алгоритм deps-sync не менялись |

Ни одна существующая сторонняя зависимость не повышалась в версии. Изменение lockfile
editor в основном удаляет дубли архивного дерева и записывает npm directory link.
Рефакторинг этапов 6.1–7, JS→TS и функциональные исправления аудио/видео/эффектов не выполнялись.

## Оставшиеся ограничения

- Geometry failure: `apps/editor/src/components/EditorScreen/tests/EditorScreen.browser.test.tsx:216`.
  y=242 против 241.984375, height=622.171875 против 622. Этот тест и runtime-код не менялись;
  screenshot references не обновлялись для сокрытия ошибки.
- Указанный долг ESLint сохранён. Полные check/lint возвращают ошибку, а не «зелёный» baseline.
- Vite предупреждает о крупных JS chunks. Разбиение bundle в этой задаче не менялось.
- Нативные Windows/macOS, системный UI выбора папки и разрешения после полного перезапуска
  browser process здесь не проверялись. Для файлового workflow нужен поддерживаемый Chromium и secure context.
- Проверка не подтверждает выпуск книг, готовность публичного API или публикацию пакетов в npm.
  CI отсутствует. PR не объединялись автоматически.
