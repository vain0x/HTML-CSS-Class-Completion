import * as vscode from "vscode";
import CssClassDefinition from "./../../common/css-class-definition";
import ISimpleTextDocument from "./simple-text-document";

interface IParseEngine {
    languageId: string;
    extension: string;
    parse(textDocument: ISimpleTextDocument, uri: vscode.Uri): Promise<CssClassDefinition[]>;
}

export default IParseEngine;
