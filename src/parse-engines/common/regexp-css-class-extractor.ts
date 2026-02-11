import * as vscode from "vscode";
import CssClassDefinition from "../../common/css-class-definition";

/** Regexp-based CSS class extractor. */
export default class RegexpCssClassExtractor {
    /**
     * @description Extracts class names from CSS text
     */
    public static extract(code: string, uri: vscode.Uri | undefined): CssClassDefinition[] {
        // matches e.g. `.w-\[120px\]`
        const classNameRegex = /\.((?:[-_\w]|\\.)+)/g;

        const definitions: CssClassDefinition[] = [];

        for (const [line, lineText] of code.split(/\r?\n/g).entries()) {
            for (const m of lineText.matchAll(classNameRegex)) {
                const definition = new CssClassDefinition(m[1].replaceAll("\\", ""));

                // unimplemented
                // definition.comments = [];

                const ch = m.index, len = m[0].length;
                definition.location = new vscode.Location(uri as any, new vscode.Range(
                    new vscode.Position(line, ch),
                    new vscode.Position(line, ch + len)
                ));
                definitions.push(definition);
            }
        }

        return definitions;
    }
}
