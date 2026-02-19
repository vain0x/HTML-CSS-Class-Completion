import { Position, Range, TextDocument } from "vscode";
import type IAttributeExtractor from "../common/attribute-extractor";

class HtmlAttributeExtractor implements IAttributeExtractor {
    extract(document: TextDocument, position: Position): string[] | null {
        // Extract the text between the start of the given line and the position.
        const startOfLine = new Position(position.line, 0);
        const rangeBefore = new Range(startOfLine, position);
        const textBefore = document.getText(rangeBefore);

        // Find all class attributes in the same line before the position,
        // and pick the last occurrence.
        let lastMatch: RegExpExecArray | undefined;
        for (const m of textBefore.matchAll(classAttributeRegExp)) {
            lastMatch = m;
        }
        if (!lastMatch) {
            return null;
        }

        // The index at `class = <|>value`.
        const offset = lastMatch.index + lastMatch[0].length;

        // The entire text at the line including the rest after the position.
        const lineText = document.lineAt(position.line).text;

        // The attribute value.
        let value: string;
        // The index at the end of the attribute (before quote if any.)
        let endIndex: number;

        const quote = lineText[offset];
        if (quote === "\"" || quote === "'") {
            // Find the end of the quote.
            const j = lineText.indexOf(quote, offset + 1);
            if (j >= 0) {
                value = lineText.slice(offset + 1, j); // until the quote
                endIndex = j;
            } else {
                value = lineText.slice(offset + 1); // until the end of the line
                endIndex = lineText.length;
            }
        } else {
            // unquoted syntax
            const regexp = new RegExp(unquotedValueRegExp, "y");
            regexp.lastIndex = offset;
            const match = regexp.exec(lineText);
            value = match?.[0] ?? "";
            endIndex = offset + value.length;
        }

        // Ensure the given position is on the attribute.
        if (endIndex < position.character) {
            return null;
        }

        value = value.trim();
        if (!value) {
            return [];
        }

        const classNames = value.split(/\s+/g);
        return classNames;
    }
}

const classAttributeRegExp = /\bclass\s*=\s*/gi;

// https://html.spec.whatwg.org/multipage/syntax.html#attributes-2
const unquotedValueRegExp = /[^\s"'=<>`]+/y;

export default HtmlAttributeExtractor;
