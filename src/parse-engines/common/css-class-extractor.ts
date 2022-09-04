import * as css from "css";
import * as vscode from "vscode";
import CssClassDefinition from "../../common/css-class-definition";

export default class CssClassExtractor {
    /**
     * @description Extracts class names from CSS AST
     */
    public static extract(ast: css.Stylesheet, uri: vscode.Uri | undefined): CssClassDefinition[] {
        const classNameRegex = /[.](([\w-]|\\[@:/])+)/g;

        const definitions: CssClassDefinition[] = [];

        // go through each of the selectors of the current rule
        const addRule = (rule: css.Rule, comments: string[] | undefined) => {
            rule.selectors?.forEach((selector: string) => {
                let item: RegExpExecArray | null = classNameRegex.exec(selector);
                while (item) {
                    const definition = new CssClassDefinition(item[1].replace("\\", ""));
                    definition.comments = comments;
                    definition.location = toLocation(rule, uri);
                    definitions.push(definition);

                    item = classNameRegex.exec(selector);
                }
            });
        };

        // go through each of the rules or media query...
        ast.stylesheet?.rules.forEach((rule: css.Rule & css.Media, index) => {
            // ...of type rule
            if (rule.type === "rule") {
                addRule(rule, collectComments(ast.stylesheet!.rules, index));
            }
            // of type media queries
            if (rule.type === "media") {
                // go through rules inside media queries
                rule.rules?.forEach((r: css.Rule, i) => addRule(r, collectComments(rule.rules!, i)));
            }
        });
        return definitions;
    }
}

function collectComments(rules: (css.Rule | css.Comment | css.AtRule)[], index: number): string[] | undefined {
    if (!rules || index === 0) {
        return undefined;
    }

    const comments = [];
    for (let j = index - 1; j >= 0; j--) {
        const node = rules[j] as { comment?: string };
        if (!node.comment) {
            break;
        }

        // Only if it looks like `/** ... */`.
        if (node.comment.startsWith("*")) {
            comments.push(node.comment.slice(1).trim());
        }
    }
    if (comments.length === 0) {
        return undefined;
    }

    comments.reverse();
    return comments;
}

const toLocation = (node: css.Node, uri: vscode.Uri | undefined) => {
    if (!uri || !node.position) {
        return undefined;
    }

    const start = node.position.start && toPosition(node.position.start);
    if (!start) {
        return undefined;
    }

    const end = node.position.end && toPosition(node.position.end);
    if (!end) {
        return undefined;
    }

    return new vscode.Location(uri, new vscode.Range(start, end));
}

const toPosition = (node: css.Position) => {
    if (node.line == null || node.column == null) {
        return undefined;
    }

    return new vscode.Position(node.line - 1, node.column - 1);
}
