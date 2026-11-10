# Общие конфигурации

Все потребители устанавливают `@active-book/common: file:../active-book-common`.
Сначала выполните npm ci в common: npm file:-ссылка разрешается в исходный каталог,
поэтому зависимости самого config-пакета должны быть установлены там.

## ESLint

```js
import { defineConfig, globalIgnores } from 'eslint/config';
import common, { importOrder } from '@active-book/common/eslint';

export default defineConfig([
  globalIgnores(['dist/**']),
  {
    extends: [common],
    rules: {
      'import-x/order': ['error', {
        ...importOrder,
        pathGroups: [{ pattern: '@app{,/**}', group: 'internal' }],
      }],
    },
  },
]);
```

В common находятся eslint:recommended, TypeScript recommended, parser, общие plugins,
язык, форматирование, JSX/hooks и общие группы import-x/order. В core/editor остаются
только ignores, import aliases/pathGroups, parser project и специфичные Jest rules/tests.
Исполняемый ESLint — локальная devDependency, согласованная с peerDependency common.

## Stylelint

Локальная .stylelintrc.js:

```js
export { default } from '@active-book/common/stylelint';
```

Общие SCSS rules и весь style-order используются из одного места. Extends/plugins
разрешаются через createRequire относительно common; локальным repos не нужны копии
плагинов или config/styles/config-order. Локальные дополнительные rules можно добавить
обычным Stylelint extends.

## TypeScript

Используйте стандартный extends, например `"extends": "@active-book/common/tsconfig.library.json"`.
Base задаёт strict и явное forceConsistentCasingInFileNames (и ранее включённое по
умолчанию в TypeScript 5.9). Library задаёт общие настройки emit/interop/SCSS-проектов
ядра и библиотек. App задаёт ES2022/DOM, Bundler resolution и noEmit для editor.

Локально остаются target библиотек, lib, moduleResolution types, JSX приложений,
exactOptionalPropertyTypes, types, aliases, include/exclude, baseUrl и outDir.
Практически пустой tsconfig.base.json editor теперь подключает профиль app; workspaces
наследуют его. Набор прежних compilerOptions проверен через tsc --showConfig.

## Vitest

Export @active-book/common/vitest содержит default coverage config и профили unit,
component, browser(mode). Browser имеет Playwright, headless Chromium, slowMo=300 в
preview и прежнее правило имён screenshot: tests/screenshots/<test>/<name>-<browser>-<platform>.
Это небольшой профиль с одним параметром режима, без универсального конструктора.

В editor используются стандартные mergeConfig/defineConfig и extends:true у проектов.
Root, coverage include, test include, setupFiles, Vite config/plugins, aliases и
optimizeDeps остаются в его vitest.config.ts. Профили применяются и в отдельном
временном проекте в тестах common. Jest и Vite-конфигурации сборки не переносились.
