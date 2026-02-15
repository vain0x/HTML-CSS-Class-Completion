import { Position, TextDocument } from "vscode";
import type ClassAttributeMatcher from "./common/class-attribute-matcher";
import ClassAttributeExtractor from "./parse-engines/common/class-attribute-extractor";

const CLASS_NAME_REGEX = /[-_\w,:/#@\(\)\[\]]+/;
const SELECTOR_CLASS_REGEX = /\.(?:[-_\w]|\\.)+/;

/**
 * Extracts the CSS class name at the cursor position within an HTML/JSX class attribute.
 * Returns undefined if the cursor is not inside a class attribute.
 */
export const extractClassNameFromAttribute = (document: TextDocument, position: Position, matcher: ClassAttributeMatcher): string | undefined => {
    if (ClassAttributeExtractor.extract(document, position, matcher) == null) return undefined;
    const range = document.getWordRangeAtPosition(position, CLASS_NAME_REGEX);
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
