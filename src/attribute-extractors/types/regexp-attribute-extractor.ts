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
}

export default RegExpAttributeExtractor;
