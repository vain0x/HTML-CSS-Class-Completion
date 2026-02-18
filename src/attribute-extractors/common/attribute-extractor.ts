import type { Position, TextDocument } from "vscode";

interface IAttributeExtractor {
    /**
     * Check if the cursor is on a class attribute
     * and retrieves all the class names in the attribute
     *
     * - This method is used to trigger completion.
     * - Unless matched, completion isn't provided at the position.
     *
     * @returns The class names on the attribute to be excluded from the completion list. Returns null if the position isn't on such an attribute.
     */
    extract(document: TextDocument, position: Position): string[] | null;
}

export default IAttributeExtractor;
