export const rule = {
  meta: {
    type: 'layout',
    docs: {
      description: 'Require multiline TypeScript type bodies and separate lines for three or more elements inside curly braces',
    },
    fixable: 'whitespace',
    schema: [],
    messages: {
      multiline: 'Three or more elements must be placed on separate lines.',
      typeMultiline: 'Type members and braces must be placed on separate lines.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;

    const reportBoundaries = (node, elements, opening, closing, boundaries, requireMultiline) => {
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
      const elementIndent = existingIndent ?? baseIndent + '  ';

      let messageId = 'multiline';

      if (requireMultiline) {
        messageId = 'typeMultiline';
      }

      context.report({
        node,
        messageId,

        fix(fixer) {
          const fixes = [];

          for (const [, after] of violations) {
            const previous = sourceCode.getTokenBefore(after, {
              includeComments: true,
            });

            if (!previous) {
              continue;
            }

            const start = previous.range[1];
            const end = after.range[0];
            const whitespace = sourceCode.text.slice(start, end);

            if (!/^[ \t]*$/.test(whitespace)) {
              continue;
            }

            const indent = after === closing ? baseIndent : elementIndent;

            fixes.push(fixer.replaceTextRange([start, end], '\n' + indent));
          }

          return fixes.length ? fixes : null;
        },
      });
    };

    const check = (node, elements, requireMultiline = false) => {
      if (!requireMultiline && elements.length < 3) {
        return;
      }

      let opening;
      let closing;

      if (elements.length) {
        const first = elements[0];
        const last = elements.at(-1);

        opening = sourceCode.getTokenBefore(first, {
          filter: (token) => token.value === '{',
        });
        closing = sourceCode.getTokenAfter(last, {
          filter: (token) => token.value === '}',
        });
      } else {
        opening = sourceCode.getFirstToken(node);
        closing = sourceCode.getLastToken(node);
      }

      if (!opening || !closing) {
        return;
      }

      const boundaries = [[opening, elements[0] ?? closing]];

      for (let index = 1; index < elements.length; index++) {
        boundaries.push([elements[index - 1], elements[index]]);
      }

      if (elements.length) {
        boundaries.push([elements.at(-1), closing]);
      }

      reportBoundaries(node, elements, opening, closing, boundaries, requireMultiline);
    };

    const checkMappedType = (node) => {
      const opening = sourceCode.getFirstToken(node);
      const closing = sourceCode.getLastToken(node);

      if (!opening || !closing) {
        return;
      }

      const first = sourceCode.getTokenAfter(opening, { includeComments: true });
      const last = sourceCode.getTokenBefore(closing, { includeComments: true });

      if (!first || !last) {
        return;
      }

      const boundaries = [[opening, first], [last, closing]];

      reportBoundaries(node, [first], opening, closing, boundaries, true);
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

      TSTypeLiteral: (node) => check(node, node.members, true),
      TSInterfaceBody: (node) => check(node, node.body, true),
      TSMappedType: checkMappedType,
      TSEnumBody: (node) => check(node, node.members),
    };
  },
};

export default {
  rules: {
    'object-newline': rule,
  },
};
