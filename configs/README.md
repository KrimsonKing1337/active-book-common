# Аудит конфигураций

Изучены актуальные clones `active-book-types`, `active-book-core`, `active-book-editor`
и `active-book-custom-test` с GitHub, а не старые каталоги activeBook-* в образе среды.
Исходные ревизии: types `7ad69b8`, core `db08bf1`, editor `b9b35cb`; custom-test —
`7b5afda` (main на момент работы).

| Инструмент | Общая часть здесь | Что остаётся локальным |
| --- | --- | --- |
| ESLint core/editor | eslint.rules.js: форматирование, TypeScript, JSX, hooks, общий порядок групп импортов в локальном правиле | загрузка plugins, import-x/order с алиасами, ignores, project parser, Jest и tests override core |
| Stylelint core/editor | stylelint.js и style-order/: одинаковые SCSS rules, plugins и полный порядок CSS-свойств | рабочие .stylelintrc.js пока сохранены для отдельного clone |
| TypeScript | tsconfig.json: strict, совпадающий во всех repos | module/resolution, target/lib, JSX, emit, paths, includes/excludes, exactOptionalPropertyTypes, skipLibCheck |
| EditorConfig core/editor | .editorconfig: 2 пробела, LF, UTF-8, финальная строка, 120 символов | локальные копии (EditorConfig не имеет общего extends) |
| Prettier | не обнаружен, не добавляется | — |
| Vitest/Jest/Vite | не переносятся | проекты тестов, aliases/transforms, browser/provider, build и workspace wiring |
| Husky/lint-staged | не переносятся | hooks и команды привязаны к repo и его путям |

eslint.rules.js экспортирует только совпадающую часть правил core/editor. Различия
числовых и строковых обозначений severity (`2` и `error`) семантически эквивалентны.
`import-x/order` остаётся локальным целиком из-за разных pathGroups; не нужно
вводить конструктор сложного правила ради нескольких общих полей.
TypeScript base намеренно минимален: строгая проверка общая, а настройки окружения
и генерации существенно различаются. Например types проверяет декларации в NodeNext
и не скрывает ошибки библиотек, editor использует Bundler, core генерирует lib.
Не усиливаем strictPropertyInitialization в core/custom-test и не меняем emit.

## Подключение до появления npm-реестра

Не импортируйте `../active-book-common/configs/...` из работающих конфигураций.
Такой путь ломает CI с единственным clone; ESM resolution plugins также зависит
от места файла. common сейчас не обязателен для установки и проверок соседей.

Рекомендуемый простой вариант сейчас — хранить проверенные **локальные снимки**
нужных общих файлов в `config/common/`, записывать исходный commit common рядом
в комментарии/README и обновлять их обычным review. Это несколько файлов, не новый
механизм синхронизации. Рабочие локальные конфигурации оставлены как исходные снимки;
общая основа подготовлена здесь для следующего осознанного обновления.

При подключении снимка rules в ESLint локальное правило с алиасами остаётся рядом:

```js
import sharedRules from './config/common/eslint.rules.js';

// Внутри существующего объекта rules, сохраняя локальную настройку plugins:
// ...sharedRules,
// 'import-x/order': existingLocalImportOrder,
// ...localJestRules,
```

Для Stylelint копируйте stylelint.js **вместе** с style-order/ и используйте его как
локальный extends. EditorConfig копируется в корень. tsconfig base можно скопировать
локально и подключить через extends, сохраняя локальные compilerOptions и пути.

Альтернатива при уже настроенном Git-доступе CI — приватная Git devDependency на
common, закреплённая полным commit SHA. Тогда импорт идёт из node_modules, а не
соседнего каталога. Это штатный npm, но требует авторизации к private Git на каждом
runner, поэтому автоматически такой способ не внедрён. Отдельные публикуемые npm-пакеты
с peerDependencies инструментов имеют смысл после появления реестра.
