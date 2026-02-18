import { Location, Position, TextDocument } from "vscode";
import AttributeExtractorGateway from "./attribute-extractor-gateway";

const CLASS_NAME_REGEX = /[-_\w,:/#@\(\)\[\]]+/;
const SELECTOR_CLASS_REGEX = /\.(?:[-_\w]|\\.)+/;

/**
 * Extracts the CSS class name at the cursor position within an HTML/JSX class attribute.
 * Returns undefined if the cursor is not inside a class attribute.
 */
export const extractClassNameFromAttribute = (document: TextDocument, position: Position): string | undefined => {
    const classNames = AttributeExtractorGateway.callExtractor(document, position);
    if (!classNames) return undefined;
    const range = classNames && document.getWordRangeAtPosition(position, CLASS_NAME_REGEX);
    if (!range) return undefined;
    return document.getText(range);
};

/**
 * Extracts the CSS class name at the cursor position within a CSS selector.
 * Returns undefined if the cursor is not on a class selector (e.g. `.foo`).
 */
export const extractClassNameFromSelector = (document: TextDocument, position: Position): string | undefined => {
    const range = document.getWordRangeAtPosition(position, SELECTOR_CLASS_REGEX);
    if (!range) return undefined;
    const text = document.getText(range);
    if (!text.startsWith(".")) return undefined;
    return text.slice(1).replaceAll("\\", "");
};

/**
 * Searches a document for all usages of a CSS class name within class attributes.
 */
export const searchClassUsagesInDocument = (document: TextDocument, className: string): Location[] => {
    const locations: Location[] = [];
    const text = document.getText();
    let searchIndex = 0;
    while (true) {
        const index = text.indexOf(className, searchIndex);
        if (index === -1) break;
        searchIndex = index + className.length + 1;

        // Verify exact match
        const wordRange = document.getWordRangeAtPosition(document.positionAt(index), CLASS_NAME_REGEX);
        if (!wordRange || document.getText(wordRange) !== className) continue;

        // Ensure it appears in a class attribute
        const endPosition = document.positionAt(index + className.length);
        const classNames = AttributeExtractorGateway.callExtractor(document, endPosition);
        if (!classNames) continue;
        locations.push(new Location(document.uri, wordRange));
    }
    return locations;
};
