import * as postcss from "postcss";
import * as vscode from "vscode";
import CssClassDefinition from "../../common/css-class-definition";

export default class CssClassExtractor {
    /**
     * @description Extracts class names from CSS AST
     */
    public static extract(ast: postcss.Root, uri: vscode.Uri | undefined): CssClassDefinition[] {
        const classNameRegex = /[.]((?:[-_\w]|\\.)+)/g;

        const definitions: CssClassDefinition[] = [];

        ast.walkRules((rule) => {
            const comments = collectComments(rule);

            const selector = rule.selector;
            while (true) {
                const item = classNameRegex.exec(selector);
                if (!item) break;

                const className = item[1].replaceAll("\\", ""); // unescaped
                const definition = new CssClassDefinition(className);
                definition.comments = comments;
                definition.location = computeClassLocation(rule, item.index, item[0].length, uri);
                definitions.push(definition);
            }
        });

        return definitions;
    }
}

/** Collect documentation comments attached to the rule. */
function collectComments(rule: postcss.Rule): string[] | undefined {
    const comments: string[] = [];

    let node: postcss.ChildNode | undefined = rule.prev();
    while (node && node.type === "comment") {
        const text = node.text;
        // Only if it looks like `/** ... */`.
        if (text.startsWith("*")) {
            comments.push(text.slice(1).trim());
        }
        node = node.prev();
    }

    if (comments.length === 0) {
        return undefined;
    }

    comments.reverse();
    return comments;
}

/**
 * Computes the location of a class name match within a rule's selector.
 */
function computeClassLocation(
    rule: postcss.Rule,
    offset: number,
    length: number,
    uri: vscode.Uri | undefined,
): vscode.Location | undefined {
    if (!uri || !rule.source?.start) {
        return undefined;
    }

    const start = toVscodePosition(rule.positionBy({ index: offset }));
    const end = toVscodePosition(rule.positionBy({ index: offset + length }));
    return new vscode.Location(uri, new vscode.Range(start, end));
}


function toVscodePosition(p: postcss.Position): vscode.Position {
    return new vscode.Position(p.line - 1, p.column - 1);
}
