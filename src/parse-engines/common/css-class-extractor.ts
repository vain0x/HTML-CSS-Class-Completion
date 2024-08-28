import * as css from "@adobe/css-tools";
import * as vscode from "vscode";
import CssClassDefinition from "../../common/css-class-definition";

export default class CssClassExtractor {
    /**
     * @description Extracts class names from CSS AST
     */
    public static extract(ast: css.CssStylesheetAST, uri: vscode.Uri | undefined): CssClassDefinition[] {
        const classNameRegex = /[.]((?:[-\w]|\\.)+)/g;

        const definitions: CssClassDefinition[] = [];

        // go through each of the selectors of the current rule
        const addRule = (rule: css.CssRuleAST, comments: string[] | undefined) => {
            rule.selectors?.forEach((selector: string) => {
                let item: RegExpExecArray | null = classNameRegex.exec(selector);
                while (item) {
                    const definition = new CssClassDefinition(item[1].replaceAll("\\", ""));
                    definition.comments = comments;
                    definition.location = toLocation(rule, uri);
                    definitions.push(definition);

                    item = classNameRegex.exec(selector);
                }
            });
        };

        // go through each of the rules or media query...
        ast.stylesheet?.rules.forEach((rule: css.CssAtRuleAST, index) => {
            // ...of type rule
            if (rule.type === "rule") {
                addRule(rule, collectComments(ast.stylesheet!.rules, index));
            }
            // of type media queries (and layers)
            if (rule.type === "media" || rule.type === "layer") {
                // go through rules inside media queries
                rule.rules?.forEach((r: css.CssAtRuleAST, i) => {
                    if (r.type === "rule") {
                        addRule(r, collectComments(rule.rules!, i));
                    }
                });
            }
        });
        return definitions;
    }
}

function collectComments(rules: (css.CssRuleAST | css.CssCommentAST | css.CssAtRuleAST)[], index: number): string[] | undefined {
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

const toLocation = (node: css.CssCommonPositionAST, uri: vscode.Uri | undefined) => {
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

const toPosition = (node: CssPosition) => {
    return new vscode.Position(node.line - 1, node.column - 1);
}

interface CssPosition {
    line: number;
    column: number;
}
