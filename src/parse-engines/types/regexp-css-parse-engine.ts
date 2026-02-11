import CssClassDefinition from "../../common/css-class-definition";
import IParseEngine from "../common/parse-engine";
import RegexpCssClassExtractor from "../common/regexp-css-class-extractor";
import ISimpleTextDocument from "../common/simple-text-document";

/** Regexp-based CSS parse engine. */
class RegexpCssParseEngine implements IParseEngine {
    public languageId = "css";
    public extension = "css";

    public async parse(textDocument: ISimpleTextDocument): Promise<CssClassDefinition[]> {
        const code: string = textDocument.getText();
        return RegexpCssClassExtractor.extract(code, textDocument.uri as any);
    }
}

export default RegexpCssParseEngine;
