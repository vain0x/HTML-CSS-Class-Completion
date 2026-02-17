import type vscode from "vscode";
import { Position, Range } from "vscode";
import { TextDocument } from "vscode-languageserver-textdocument";

class MockTextDocument {
    private doc: TextDocument;

    constructor(content: string, languageId: string) {
        this.doc = TextDocument.create("file:///test.txt", languageId, 1, content);
    }

    get uri() { return this.doc.uri; }
    get languageId() { return this.doc.languageId; }
    get lineCount() { return this.doc.lineCount; }
    offsetAt(position: Position) { return this.doc.offsetAt(position); }

    positionAt(offset: number) {
        const p = this.doc.positionAt(offset);
        return new Position(p.line, p.character);
    }

    getText(range?: Range) {
        return this.doc.getText(range && {
            start: { line: range.start.line, character: range.start.character },
            end: { line: range.end.line, character: range.end.character },
        });
    }

    getWordRangeAtPosition(position: Position, regex: RegExp): Range | undefined {
        const lineText = this.doc.getText({
            start: { line: position.line, character: 0 },
            end: { line: position.line + 1, character: 0 },
        }).replace(/\n$/, "");

        const flags = regex.flags.includes("g") ? regex.flags : regex.flags + "g";
        const globalRegex = new RegExp(regex.source, flags);
        let match: RegExpExecArray | null;
        while ((match = globalRegex.exec(lineText)) !== null) {
            const start = match.index;
            const end = start + match[0].length;
            if (start <= position.character && position.character < end) {
                return new Range(
                    new Position(position.line, start),
                    new Position(position.line, end),
                );
            }
        }
        return undefined;
    }
}

export const createDocument = (content: string, languageId = "html") =>
    new MockTextDocument(content, languageId) as unknown as vscode.TextDocument;
