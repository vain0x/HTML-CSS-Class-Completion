import type { Position, TextDocument } from "vscode";
import AttributeExtractorRegistry from "./attribute-extractors/attribute-extractor-registry";

class AttributeExtractorGateway {
    public static callExtractor(document: TextDocument, position: Position): string[] | null {
        let classNames: Set<string> | undefined;
        AttributeExtractorRegistry.getExtractors(document.languageId).forEach((extractor) => {
            const extract = extractor.extract(document, position);
            if (extract != null) {
                classNames ??= new Set();
                extract.forEach((className) => {
                    classNames!.add(className);
                });
            }
        });
        return classNames ? [...classNames] : null;
    }
}

export default AttributeExtractorGateway;
