import { Position, Range, TextDocument } from "vscode";
import ClassAttributeMatcher from "../../common/class-attribute-matcher";
import logger from "../../logger";

class ClassAttributeExtractor {
  static findAll(document: TextDocument, matcher: ClassAttributeMatcher): ClassAttributeToken[] {
    const text = document.getText();
    const output: ClassAttributeToken[] = [];

    logger.info("finding:", document.uri.fsPath.split("/").pop());

    switch (matcher.type) {
      case "regexp": {
        // TODO: regexps should be configured with matcher
        const allMatches = [...text.matchAll(ClassAttributeRegExp)];
        // logger.info(`regexp extractor match:`, allMatches.length, allMatches.map(m => m[0]).join(";\n"));
        for (const m of allMatches) {
          // index range of class attribute value (inside of quotes)
          let start = m.index;
          if (m[0].startsWith("className=")) {
            start += "className=".length;
          } else {
            start += "class=".length;
          }
          let endIndex = m.index + m[0].length;
          if (text[start] === "'" || text[start] === "\"") {
            start++;
            endIndex--;
          }

          // find all class-name like tokens
          const content = text.slice(start, endIndex);
          logger.info("content=", content, { index: m.index, start, endIndex });
          const nameMatches = [...content.matchAll(ClassNameRegExp)];
          logger.info(`regexp extractor tokens:`, nameMatches.length, nameMatches.map(n => n[0]).join("; "))
          for (const m of nameMatches) {
            const range = new Range(
              document.positionAt(start + m.index),
              document.positionAt(start + m.index + m[0].length)
            );
            output.push({
              range,
              className: m[0],
            });
          }
        }
        break;
      }
      case "jsx":
        // TODO:
        break;
    }
    return output;
  }

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
        const REGEXP = /class(?:Name)?=(?:{?["'`])([-_\w,:/#@\(\)\[\] ]*$)/;

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
            const wordMatches = text.slice(start).match(/[-_\w,:/#@\(\)\[\]]+/g);
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

interface ClassAttributeToken {
  range: Range
  className: string
}

// const tokenizeClassAttribute = (document: TextDocument, attributeRange: Range, matcher: ClassAttributeMatcher): ClassAttributeToken[] => {
//   const text = document.getText(attributeRange);
//   const classes: ClassAttributeToken[] = [];

// switch (matcher.type) {
//   case "regexp": {
//     // TODO
//     break;
//   }
//   case "jsx": {
//     // Pattern that matches the text between `class` attribute name and the cursor,
//     // e.g. `className={"table__row md:w-[200px] `.
//     const REGEXP = /class(?:Name)?=(?:{?["'`])([-_\w,:/#@\(\)\[\] ]*)(?:["'`])/;

//     let matched = false;

//     // Apply the regexp rule.
//     {
//       const rawClasses = text.match(REGEXP);
//       if (rawClasses && rawClasses.length >= 2) {
//         matched = true;
//         classesOnAttribute.push(...rawClasses[1].split(" "));
//       }
//     }

//     // Special case for `className={}`,
//     // e.g. `className={"widget " + (p ? "widget--modified" : "")}.
//     // The completion is provided if the position is in the braces and in a string literal.
//     const attributeIndex = text.lastIndexOf("className={");
//     if (attributeIndex >= 0) {
//       const start = attributeIndex + "className={".length;
//       let index = start;

//       // Stack to find matching braces and quotes.
//       // Whenever an open brace or opening quote is found, push it.
//       // When the closer is found, pop it.
//       let stack: string[] = [];

//       const inQuote = () => {
//         const top = stack.at(-1);
//         return top === "\"" || top === "'" || top === "`";
//       };

//       for (; index < text.length; index++) {
//         const char = text[index];
//         if (stack.length === 0 && char === "}") {
//           break;
//         }
//         switch (char) {
//           case "{":
//             stack.push("{");
//             break;

//           case "}": {
//             const last = stack.at(-1);
//             if (last === "{" || last === "${") {
//               stack.pop();
//             }
//             break;
//           }
//           case "\"":
//           case "'":
//           case "`":
//             if (stack.at(-1) === char) {
//               stack.pop();
//             } else {
//               stack.push(char);
//             }
//             break;

//           // Escape sequence (e.g. `\"`.)
//           case "\\":
//             if (inQuote() && index + 1 < text.length) {
//               index++;
//             }
//             break;

//           // String interpolation (`${...}`.)
//           case "$":
//             if (stack.at(-1) === "`" && index + 1 < text.length && text[index + 1] === "{") {
//               stack.push("${");
//               index++;
//             }
//             break;
//         }
//       }

//       if (index === text.length && inQuote()) {
//         matched = true;

//         // Roughly extract all tokens that look like css name.
//         // (E.g. in `className={"a" + (b ? "" : "")}`, both "a" and "b" are matched.)
//         const wordMatches = text.slice(start).match(/[-_\w,:/#@\(\)\[\]]+/g);
//         if (wordMatches != null && wordMatches.length >= 1) {
//           classesOnAttribute.push(...wordMatches);
//         }
//       }
//     }

//     if (!matched) {
//       // Unless any rule is matched, completion isn't provided at the position.
//       return null;
//     }
//     break;
//   }
// }
// }

const ClassAttributeRegExp = /\bclass(?:Name)?=(?:"[^"\n]*"|'[^'\n]*'|\S+\b)/gi;
const ClassNameRegExp = /[-_\w,:/#@\(\)\[\]]+/g;

export default ClassAttributeExtractor;
