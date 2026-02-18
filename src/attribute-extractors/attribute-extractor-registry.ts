import type { Disposable } from "vscode";
import type IAttributeExtractor from "./common/attribute-extractor";
import RegExpAttributeExtractor from "./types/regexp-attribute-extractor";
import JsxAttributeExtractor from "./types/jsx-attribute-extractor";

class AttributeExtractorRegistry {
    public static getExtractors(languageId: string): IAttributeExtractor[] {
        const found = this.registry.filter((item) => item.languageId === languageId).map((item) => item.extractor);
        return found;
    }

    public static register(languageId: string, extractor: IAttributeExtractor): Disposable {
        if (!this.registry.some((value) => value.languageId === languageId && value.extractor === extractor)) {
            this.registry.push({ languageId, extractor });
            return {
                dispose: () => {
                    const index = this.registry.findLastIndex((value) => value.languageId === languageId && value.extractor === extractor);
                    if (index >= 0) this.registry.splice(index, 1);
                },
            }
        }

        return { dispose() { } };
    }

    private static registry: { languageId: string, extractor: IAttributeExtractor }[] = [];
}

export default AttributeExtractorRegistry;
