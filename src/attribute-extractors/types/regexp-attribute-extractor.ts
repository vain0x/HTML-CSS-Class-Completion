import { Position, Range, TextDocument } from "vscode";
import type IAttributeExtractor from "../common/attribute-extractor";

class RegExpAttributeExtractor implements IAttributeExtractor {
    matcher: RegExp;
    splitChar: string;

    constructor(matcher: RegExp, splitChar: string) {
        this.matcher = matcher;
        this.splitChar = splitChar;
    }

    extract(document: TextDocument, position: Position): string[] | null {
        const start: Position = new Position(position.line, 0);
        const range: Range = new Range(start, position);
        const text: string = document.getText(range);

        const classesOnAttribute: string[] = [];

        const classMatchRegex = this.matcher;
        const splitChar = this.splitChar ?? " ";

        const rawClasses: RegExpMatchArray | null = text.match(classMatchRegex);
        if (!rawClasses || rawClasses.length === 1) {
            return null;
        }

        // Will store the classes found on the class attribute.
        classesOnAttribute.push(...rawClasses[1].split(splitChar));
        return classesOnAttribute;
    }

    static html = new RegExpAttributeExtractor(/class=["|']([-_\w,:/#@\(\)\[\] ]*$)/, " ");

    // The @apply rule was a CSS proposal which has since been abandoned,
    // check the proposal for more info: http://tabatkins.github.io/specs/css-apply-rule/
    // Its support should probably be removed
    static css = new RegExpAttributeExtractor(/@apply ((?:\.|[-_\w,:/#@\(\)\[\] ])*$)/, ".");

    static emmet = new RegExpAttributeExtractor(/(?=\.)([\w-@:\/. ]*$)/, ".");
}

export default RegExpAttributeExtractor;
