import { Position, TextDocument } from "vscode";
import JsxAttributeExtractor from "../../attribute-extractors/types/jsx-attribute-extractor";
import RegExpAttributeExtractor from "../../attribute-extractors/types/regexp-attribute-extractor";
import ClassAttributeMatcher from "../../common/class-attribute-matcher";

class ClassAttributeExtractor {
    static extract(document: TextDocument, position: Position, matcher: ClassAttributeMatcher): string[] | null {
        switch (matcher.type) {
            case "regexp": {
                const { classMatchRegex, splitChar = " " } = matcher;
                const extractor = new RegExpAttributeExtractor(classMatchRegex, splitChar);
                return extractor.extract(document, position);
            }
            case "jsx": {
                const extractor = new JsxAttributeExtractor();
                return extractor.extract(document, position);
            }
        }
    }
}

export default ClassAttributeExtractor;
