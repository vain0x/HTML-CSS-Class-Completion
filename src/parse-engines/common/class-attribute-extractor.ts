import { TextDocument, Position, Range } from "vscode";
import ClassAttributeMatcher from "../../common/class-attribute-matcher";

class ClassAttributeExtractor {
  static extract(document: TextDocument, position: Position, matcher: ClassAttributeMatcher): string[] | null {
    const start: Position = new Position(position.line, 0);
    const range: Range = new Range(start, position);
    const text: string = document.getText(range);

    // Classes already written in the completion target. These classes are excluded.
    const classesOnAttribute: string[] = [];

    switch (matcher.type) {
      case "regexp": {
        const { classMatchRegex, splitChar = " " } = matcher;
        // Check if the cursor is on a class attribute and retrieve all the css rules in this class attribute.
        // Unless matched, completion isn't provided at the position.
        const rawClasses: RegExpMatchArray | null = text.match(classMatchRegex);
        if (!rawClasses || rawClasses.length === 1) {
          return null;
        }

        // Will store the classes found on the class attribute.
        classesOnAttribute.push(...rawClasses[1].split(splitChar));
        break;
      }
      case "jsx": {
        // Pattern that matches the text between `class` attribute name and the cursor,
        // e.g. `className={"table__row md:w-[200px] `.
        const REGEXP = /class(?:Name)?=(?:{?["'`])([\w-@:\/ ]*$)/;

        let matched = false;

        // Apply the regexp rule.
        {
          const rawClasses = text.match(REGEXP);
          if (rawClasses && rawClasses.length >= 2) {
            matched = true;
            classesOnAttribute.push(...rawClasses[1].split(" "));
          }
        }

        // Special case for `className={}`,
        // e.g. `className={"widget " + (p ? "widget--modified" : "")}.
        // The completion is provided if the position is in the braces and in a string literal.
        const attributeIndex = text.lastIndexOf("className={");
        if (attributeIndex >= 0) {
          const start = attributeIndex + "className={".length;
          let index = start;

          // Stack to find matching braces and quotes.
          // Whenever an open brace or opening quote is found, push it.
          // When the closer is found, pop it.
          let stack: string[] = [];

          const inQuote = () => {
            const top = stack.at(-1);
            return top === "\"" || top === "'" || top === "`";
          };

          for (; index < text.length; index++) {
            const char = text[index];
            if (stack.length === 0 && char === "}") {
              break;
            }
            switch (char) {
              case "{":
                stack.push("{");
                break;

              case "}": {
                const last = stack.at(-1);
                if (last === "{" || last === "${") {
                  stack.pop();
                }
                break;
              }
              case "\"":
              case "'":
              case "`":
                if (stack.at(-1) === char) {
                  stack.pop();
                } else {
                  stack.push(char);
                }
                break;

              // Escape sequence (e.g. `\"`.)
              case "\\":
                if (inQuote() && index + 1 < text.length) {
                  index++;
                }
                break;

              // String interpolation (`${...}`.)
              case "$":
                if (stack.at(-1) === "`" && index + 1 < text.length && text[index + 1] === "{") {
                  stack.push("${");
                  index++;
                }
                break;
            }
          }

          if (index === text.length && inQuote()) {
            matched = true;

            // Roughly extract all tokens that look like css name.
            // (E.g. in `className={"a" + (b ? "" : "")}`, both "a" and "b" are matched.)
            const wordMatches = text.slice(start).match(/[-\w,@\\:\[\]]+/g);
            if (wordMatches != null && wordMatches.length >= 1) {
              classesOnAttribute.push(...wordMatches);
            }
          }
        }

        if (!matched) {
          // Unless any rule is matched, completion isn't provided at the position.
          return null;
        }
        break;
      }
    }
    return classesOnAttribute;
  }
}

export default ClassAttributeExtractor;
