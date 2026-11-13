export const rule = {
  meta: {
    type: 'layout',
    docs: {
      description: 'Allow at most two array or tuple elements per line',
    },
    fixable: 'whitespace',
    schema: [],
    messages: {
      maxTwo: 'No more than two array or tuple elements may appear on one line.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;

    const check = (node, elements) => {
      const openingLine = sourceCode.lines[node.loc.start.line - 1];
      const baseIndent = openingLine.match(/^[ \t]*/)[0];

      const existingIndents = elements.filter(Boolean).map((elementCur) => {
        const line = sourceCode.lines[elementCur.loc.start.line - 1];

        return line.slice(0, elementCur.loc.start.column);
      });

      const existingIndent = existingIndents.find((prefix) => /^[ \t]+$/.test(prefix));
      const elementIndent = existingIndent ?? baseIndent + '  ';

      let currentLine = -1;
      let countOnLine = 0;

      for (const element of elements) {
        if (!element) {
          continue;
        }

        if (element.loc.start.line !== currentLine) {
          currentLine = element.loc.start.line;
          countOnLine = 0;
        }

        countOnLine++;

        if (countOnLine <= 2) {
          continue;
        }

        // A new line before this element starts a fresh pair on that line.
        countOnLine = 1;

        context.report({
          node: element,
          messageId: 'maxTwo',

          fix(fixer) {
            const previous = sourceCode.getTokenBefore(element, { includeComments: true });

            if (!previous) {
              return null;
            }

            const whitespace = sourceCode.text.slice(previous.range[1], element.range[0]);

            if (!/^[ \t]*$/.test(whitespace)) {
              return null;
            }

            return fixer.replaceTextRange(
              [previous.range[1], element.range[0]],
              '\n' + elementIndent,
            );
          },
        });
      }
    };

    return {
      ArrayExpression: (node) => check(node, node.elements),
      ArrayPattern: (node) => check(node, node.elements),
      TSTupleType: (node) => check(node, node.elementTypes),
    };
  },
};

export default {
  rules: {
    'max-two': rule,
  },
};
