export const rule = {
  meta: {
    type: 'layout',
    docs: {
      description: 'Require separate lines for three or more elements inside curly braces',
    },
    fixable: 'whitespace',
    schema: [],
    messages: {
      multiline: 'Three or more elements must be placed on separate lines.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;

    const check = (node, elements) => {
      if (elements.length < 3) {
        return;
      }

      const first = elements[0];
      const last = elements.at(-1);

      const opening = sourceCode.getTokenBefore(first, {
        filter: (token) => token.value === '{',
      });

      const closing = sourceCode.getTokenAfter(last, {
        filter: (token) => token.value === '}',
      });

      const boundaries = [[opening, first]];

      for (let index = 1; index < elements.length; index++) {
        boundaries.push([elements[index - 1], elements[index]]);
      }

      boundaries.push([last, closing]);

      const violations = boundaries.filter(([before, after]) => {
        return before.loc.end.line === after.loc.start.line;
      });

      if (!violations.length) {
        return;
      }

      const openingLine = sourceCode.lines[opening.loc.start.line - 1];
      const baseIndent = openingLine.match(/^[ \t]*/)[0];

      const existingIndents = elements.map((elementCur) => {
        const line = sourceCode.lines[elementCur.loc.start.line - 1];

        return line.slice(0, elementCur.loc.start.column);
      });

      const existingIndent = existingIndents.find((prefix) => /^[ \t]+$/.test(prefix));

      const elementIndent = existingIndent ?? `${baseIndent}  `;

      context.report({
        node,
        messageId: 'multiline',

        fix(fixer) {
          const fixes = [];

          for (const [, after] of violations) {
            const previous = sourceCode.getTokenBefore(after, {
              includeComments: true,
            });

            const start = previous.range[1];
            const end = after.range[0];
            const whitespace = sourceCode.text.slice(start, end);

            if (!/^[ \t]*$/.test(whitespace)) {
              continue;
            }

            const indent = after === closing ? baseIndent : elementIndent;

            const fix = fixer.replaceTextRange([start, end], `\n${indent}`);

            fixes.push(fix);
          }

          return fixes.length ? fixes : null;
        },
      });
    };

    return {
      ObjectExpression: (node) => check(node, node.properties),
      ObjectPattern: (node) => check(node, node.properties),

      ImportDeclaration: (node) => {
        const elements = node.specifiers.filter((specifier) => {
          return specifier.type === 'ImportSpecifier';
        });

        check(node, elements);
      },

      ExportNamedDeclaration: (node) => check(node, node.specifiers),

      TSTypeLiteral: (node) => check(node, node.members),
      TSInterfaceBody: (node) => check(node, node.body),
      TSEnumBody: (node) => check(node, node.members),
    };
  },
};

export default {
  rules: {
    'object-newline': rule,
  },
};
