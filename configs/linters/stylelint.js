import { createRequire } from 'node:module';
import createConfigOrder from './style-order/configCreator.js';

const require = createRequire(import.meta.url);
const configOrder = createConfigOrder();

export default {
  allowEmptyInput: true,
  extends: [require.resolve('stylelint-config-standard-scss')],
  plugins: [
    require.resolve('stylelint-scss'),
    require.resolve('stylelint-order'),
    require.resolve('stylelint-declaration-block-no-ignored-properties'),
  ],
  rules: {
    'selector-pseudo-class-no-unknown': [
      true,
      {
        'ignorePseudoClasses': ['global']
      }
    ],
    'value-keyword-case': [
      'lower',
      {
        'camelCaseSvgKeywords': true
      }
    ],

    'scss/dollar-variable-pattern': null,
    'scss/double-slash-comment-whitespace-inside': null,
    'scss/double-slash-comment-empty-line-before': null,
    'scss/at-import-no-partial-leading-underscore': null,
    'scss/at-rule-no-unknown': true,
    'scss/load-no-partial-leading-underscore': null,

    'at-rule-empty-line-before': null,
    'at-rule-no-unknown': null,
    'declaration-block-no-redundant-longhand-properties': null,
    'keyframes-name-pattern': null,
    'selector-class-pattern': null,
    'no-descending-specificity': null,
    'declaration-empty-line-before': null,
    'selector-pseudo-element-colon-notation': 'single',
    'plugin/declaration-block-no-ignored-properties': true,

    'order/order': [
      'custom-properties',
      'dollar-variables',
      'declarations',
      'rules',
      'at-rules'
    ],
    'order/properties-order': configOrder,
  },
};
