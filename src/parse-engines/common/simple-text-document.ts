/**
 * A minimum standin for vscode.TextDocument that is passed to a `ParseEngine`.
 */
interface ISimpleTextDocument {
    languageId: string;
    getText(): string;

    /** URI. The value must be of `vscode.Uri | undefined`. */
    uri?: unknown;
}

export default ISimpleTextDocument;
