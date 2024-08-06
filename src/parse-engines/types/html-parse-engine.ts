import * as css from "@adobe/css-tools";
import * as html from "htmlparser2";
import pMap from "p-map";
import * as vscode from "vscode";
import CssClassDefinition from "../../common/css-class-definition";
import CssClassExtractor from "../common/css-class-extractor";
import IParseEngine from "../common/parse-engine";
import ISimpleTextDocument from "../common/simple-text-document";

class HtmlParseEngine implements IParseEngine {
    public languageId = "html";
    public extension = "html";

    public async parse(textDocument: ISimpleTextDocument, uri: vscode.Uri | undefined): Promise<CssClassDefinition[]> {
        const definitions: CssClassDefinition[] = [];
        const urls: string[] = [];
        let tag: string;
        let isRelStylesheet = false;
        let linkHref: string | null;

        const parser = new html.Parser({
            onattribute: (name: string, value: string) => {
                if (name === "rel" && value === "stylesheet") {
                    isRelStylesheet = true;
                }

                if (tag === "link" && name === "href" && value.indexOf("http") === 0) {
                    linkHref = value;
                }
            },
            onclosetag: () => {
                if (tag === "link" && isRelStylesheet && linkHref) {
                    urls.push(linkHref);
                }

                isRelStylesheet = false;
                linkHref = null;
            },
            onopentagname: (name: string) => {
                tag = name;
            },
            ontext: (text: string) => {
                if (tag === "style") {
                    definitions.push(...CssClassExtractor.extract(css.parse(text), uri));
                }
            },
        });

        parser.write(textDocument.getText());
        parser.end();

        await pMap(urls, async (url) => {
            const res = await fetch(url);
            if (!res.ok) {
                // Tolerable.
            }
            const content = await res.text();

            let uri: vscode.Uri | undefined;
            try {
                uri = vscode.Uri.parse(url);
            } catch (err) {
                // Tolerable.
            }
            definitions.push(...CssClassExtractor.extract(css.parse(content), uri));
        }, { concurrency: 10 });

        return definitions;
    }
}

export default HtmlParseEngine;
