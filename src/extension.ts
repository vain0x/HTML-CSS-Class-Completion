import pMap from "p-map";
import * as vscode from "vscode";
import {
    commands, CompletionItem, CompletionItemKind, Disposable,
    ExtensionContext, languages, Location, Position, TextDocument, Uri, window,
    workspace,
} from "vscode";
import AttributeExtractorGateway from "./attribute-extractor-gateway";
import AttributeExtractorRegistry from "./attribute-extractors/attribute-extractor-registry";
import JsxAttributeExtractor from "./attribute-extractors/types/jsx-attribute-extractor";
import RegExpAttributeExtractor from "./attribute-extractors/types/regexp-attribute-extractor";
import { extractClassNameFromAttribute, extractClassNameFromSelector, searchClassUsagesInDocument } from "./class-name-extractor";
import CssClassDefinition from "./common/css-class-definition";
import type LanguageFeaturesOption from "./common/language-features-option";
import Fetcher from "./fetcher";
import logger from "./logger";
import Notifier from "./notifier";
import ParseEngineGateway from "./parse-engine-gateway";
import type IParseEngine from "./parse-engines/common/parse-engine";
import IParseOptions from "./parse-engines/common/parse-options";
import ParseEngineRegistry from "./parse-engines/parse-engine-registry";
import CssParseEngine from "./parse-engines/types/css-parse-engine";
import RegexpCssParseEngine from "./parse-engines/types/regexp-css-parse-engine";

enum Command {
    Cache = "html-css-class-completion.cache",
}

enum Configuration {
    IncludeGlobPattern = "html-css-class-completion.includeGlobPattern",
    ExcludeGlobPattern = "html-css-class-completion.excludeGlobPattern",
    EnableEmmetSupport = "html-css-class-completion.enableEmmetSupport",
    EnableExternalStylesheetSupport = "html-css-class-completion.enableExternalStylesheetSupport",
    HTMLLanguages = "html-css-class-completion.HTMLLanguages",
    CSSLanguages = "html-css-class-completion.CSSLanguages",
    JavaScriptLanguages = "html-css-class-completion.JavaScriptLanguages",
    CSSParser = "html-css-class-completion.CSSParser",
    LanguageFeatures = "html-css-class-completion.LanguageFeatures",
}

const notifier: Notifier = new Notifier(Command.Cache);
let uniqueDefinitions: CssClassDefinition[] = [];
let allDefinitionsMap: Map<string, CssClassDefinition[]> = new Map();

const completionTriggerChars = ['"', "'", " ", "."];

let caching = false;
let cacheRequested = false;

const htmlDisposables: Disposable[] = [];
const cssDisposables: Disposable[] = [];
const javaScriptDisposables: Disposable[] = [];
const emmetDisposables: Disposable[] = [];

async function performCache(): Promise<void> {
    try {
        notifier.notify("eye", "Looking for CSS classes in the workspace...");

        logger.debug("Looking for parseable documents...");
        const uris: Uri[] = await Fetcher.findAllParseableDocuments();

        if (!uris || uris.length === 0) {
            logger.debug("Found no documents");
            notifier.statusBarItem.hide();
            return;
        }

        logger.debug("Found all parseable documents.", uris);
        const definitions: CssClassDefinition[] = [];

        const configuration = vscode.workspace.getConfiguration();
        const parseOptions: IParseOptions = {
            enableExternalStylesheetSupport: configuration.get<boolean>(Configuration.EnableExternalStylesheetSupport)!,
        };

        let filesParsed = 0;
        let failedLogs: { uri: Uri, err: unknown }[] = [];
        let failedLogsCount = 0;

        logger.debug("Parsing documents and looking for CSS class definitions...");

        try {
            await pMap(uris, async (uri) => {
                try {
                    Array.prototype.push.apply(definitions, await ParseEngineGateway.callParser(uri, parseOptions));
                } catch (err) {
                    failedLogs.push({ uri, err });
                    failedLogsCount++;
                }
                filesParsed++;
                const progress = ((filesParsed / uris.length) * 100).toFixed(2);
                notifier.notify("eye", "Looking for CSS classes in the workspace... (" + progress + "%)", false);
            }, { concurrency: 30 });
        } catch (err) {
            notifier.notify("alert", "Failed to cache the CSS classes in the workspace (click for another attempt)");
            throw new Error("Failed to parse the documents", { cause: err });
        }

        const grouped = Map.groupBy(definitions, (def) => def.className);
        allDefinitionsMap = grouped;
        uniqueDefinitions = [...grouped].map(([_className, group]) => group[0]);

        let summary = "Summary:\n";
        summary += `${uris.length} parseable documents found\n`;
        summary += `${definitions.length} CSS class definitions found\n`;
        summary += `${uniqueDefinitions.length} unique CSS class definitions found\n`;
        if (failedLogsCount !== 0) {
            summary += `${failedLogsCount} failed attempts to parse. List of the documents:\n`;
            summary += failedLogs.map((x) => `${x.uri}: ${x.err}`).join("\n");
            logger.warn(summary);
        } else {
            summary += "All success."
            logger.info(summary);
        }

        notifier.notify("zap", "CSS classes cached (click to cache again)");
    } catch (err) {
        notifier.notify("alert", "Failed to cache the CSS classes in the workspace (click for another attempt)");
        throw new Error("Failed to cache the class definitions during the iterations over the documents that were found", { cause: err });
    }
}

async function cache() {
    if (caching) {
        // Let the running cache function redo.
        cacheRequested = true;
        return;
    }

    while (true) {
        caching = true;
        try {
            await performCache();
        } finally {
            caching = false;
        }

        // If the function itself was called while performing the process above,
        // the result might be invalidated. Redo the process to refresh it.
        // This trick reduces works and prevents parallel execution.
        if (cacheRequested) {
            cacheRequested = false;
            continue;
        } else {
            return;
        }
    }
}

const registerCompletionProvider = (
    languageSelector: string,
    classPrefix = "",
) => languages.registerCompletionItemProvider(languageSelector, {
    provideCompletionItems(document: TextDocument, position: Position): CompletionItem[] | undefined {
        // Check if the cursor is on class attribute and collect class names on the attribute.
        const classesOnAttribute = AttributeExtractorGateway.callExtractor(document, position);
        if (classesOnAttribute == null) {
            return undefined;
        }

        const wordRangeAtPosition = document.getWordRangeAtPosition(position, /[-_\w,:/#@\(\)\[\]]+/);

        // Creates a collection of CompletionItem based on the classes already cached
        const completionItems = uniqueDefinitions.map((definition) => {
            const completionItem = new CompletionItem(definition.className, CompletionItemKind.Variable);
            const completionClassName = `${classPrefix}${definition.className}`;

            completionItem.filterText = completionClassName;
            completionItem.insertText = completionClassName;
            completionItem.range = wordRangeAtPosition;

            if (definition.comments && definition.comments.length !== 0) {
                completionItem.detail = definition.comments![0].split(/\r?\n/, 2)[0];
            }

            return completionItem;
        });

        // Removes from the collection the classes already specified on the class attribute
        for (const classOnAttribute of classesOnAttribute) {
            for (let j = 0; j < completionItems.length; j++) {
                if (completionItems[j].insertText === classOnAttribute) {
                    completionItems.splice(j, 1);
                }
            }
        }

        return completionItems;
    },
}, ...completionTriggerChars);

const registerDefinitionProvider = (languageSelector: string) => languages.registerDefinitionProvider(languageSelector, {
    provideDefinition(document, position, _token) {
        const word = extractClassNameFromAttribute(document, position);
        if (word == null) {
            return;
        }

        const definition = uniqueDefinitions.find((definition) => {
            return definition.className === word;
        });
        if (definition == null || !definition.location) {
            return;
        }

        return definition.location as Location;
    },
});

const findReferences = async (
    className: string,
    token: vscode.CancellationToken,
): Promise<Location[]> => {
    const locations: Location[] = [];

    // CSS definition locations from cache
    const definitions = allDefinitionsMap.get(className);
    if (definitions) {
        for (const def of definitions) {
            if (def.location) {
                locations.push(def.location);
            }
        }
    }

    // Search workspace files for usages in class attributes
    const uris = await vscode.workspace.findFiles("**/*.{html,jsx,tsx}", "**/node_modules/**");

    const perFileResults = await pMap(uris, async (uri) => {
        if (token.isCancellationRequested) return [];

        const doc = await workspace.openTextDocument(uri);

        return searchClassUsagesInDocument(doc, className);
    }, { concurrency: 30 });

    locations.push(...perFileResults.flat());
    return locations;
};

const registerReferenceProvider = (
    languageSelector: string,
    extractClassName: (document: TextDocument, position: Position) => string | undefined,
) => languages.registerReferenceProvider(languageSelector, {
    async provideReferences(document, position, _context, token) {
        const className = extractClassName(document, position);
        if (!className) return [];
        return await findReferences(className, token);
    },
});

const registerHTMLProviders = (disposables: Disposable[]) => {
    workspace.getConfiguration()
        ?.get<string[]>(Configuration.HTMLLanguages)
        ?.forEach((extension) => {
            disposables.push(AttributeExtractorRegistry.register(extension, RegExpAttributeExtractor.html));

            const completionEnabled = workspace.getConfiguration().get<LanguageFeaturesOption>(Configuration.LanguageFeatures)?.completion ?? true;
            if (completionEnabled) {
                disposables.push(registerCompletionProvider(extension));
            }

            const referencesEnabled = workspace.getConfiguration().get<LanguageFeaturesOption>(Configuration.LanguageFeatures)?.references ?? true;
            if (referencesEnabled) {
                disposables.push(registerReferenceProvider(extension, (doc, pos) => extractClassNameFromAttribute(doc, pos)));
            }
        });
}

const registerCSSProviders = (disposables: Disposable[]) => {
    const parser = workspace.getConfiguration()
        .get<string>(Configuration.CSSParser);
    let engine: IParseEngine | undefined;
    if (parser === "regexp") {
        engine = new RegexpCssParseEngine();
    } else { // postcss
        engine = new CssParseEngine();
    }
    ParseEngineRegistry.setParseEngine(engine);

    workspace.getConfiguration()
        .get<string[]>(Configuration.CSSLanguages)
        ?.forEach((extension) => {
            disposables.push(AttributeExtractorRegistry.register(extension, RegExpAttributeExtractor.css));

            const completionEnabled = workspace.getConfiguration().get<LanguageFeaturesOption>(Configuration.LanguageFeatures)?.completion ?? true;
            if (completionEnabled) {
                disposables.push(registerCompletionProvider(extension));
            }

            const referencesEnabled = workspace.getConfiguration().get<LanguageFeaturesOption>(Configuration.LanguageFeatures)?.references ?? true;
            if (referencesEnabled) {
                disposables.push(registerReferenceProvider(extension, extractClassNameFromSelector));
            }
        });
}

const registerJavaScriptProviders = (disposables: Disposable[]) => {
    workspace.getConfiguration()
        .get<string[]>(Configuration.JavaScriptLanguages)
        ?.forEach((extension) => {
            disposables.push(AttributeExtractorRegistry.register(extension, new JsxAttributeExtractor()));

            const completionEnabled = workspace.getConfiguration().get<LanguageFeaturesOption>(Configuration.LanguageFeatures)?.completion ?? true;
            if (completionEnabled) {
                disposables.push(registerCompletionProvider(extension));
            }

            const definitionsEnabled = workspace.getConfiguration().get<LanguageFeaturesOption>(Configuration.LanguageFeatures)?.definitions ?? true;
            if (definitionsEnabled) {
                disposables.push(registerDefinitionProvider(extension));
            }

            const referencesEnabled = workspace.getConfiguration().get<LanguageFeaturesOption>(Configuration.LanguageFeatures)?.references ?? true;
            if (referencesEnabled) {
                disposables.push(registerReferenceProvider(extension, (doc, pos) => extractClassNameFromAttribute(doc, pos)));
            }
        });
}

function registerEmmetProviders(disposables: Disposable[]) {
    const registerProviders = (modes: string[]) => {
        modes.forEach((language) => {
            disposables.push(AttributeExtractorRegistry.register(language, RegExpAttributeExtractor.emmet));

            const completionEnabled = workspace.getConfiguration().get<LanguageFeaturesOption>(Configuration.LanguageFeatures)?.completion ?? true;
            if (completionEnabled) {
                disposables.push(registerCompletionProvider(language));
            }
        });
    };

    const htmlLanguages = workspace.getConfiguration().get<string[]>(Configuration.HTMLLanguages);
    if (htmlLanguages) {
        registerProviders(htmlLanguages);
    }

    const javaScriptLanguages = workspace.getConfiguration().get<string[]>(Configuration.JavaScriptLanguages);
    if (javaScriptLanguages) {
        registerProviders(javaScriptLanguages);
    }
}

function unregisterProviders(disposables: Disposable[]) {
    disposables.forEach(disposable => disposable.dispose());
    disposables.length = 0;
}

export async function activate(context: ExtensionContext): Promise<void> {
    const outputChannel = vscode.window.createOutputChannel("html-css-class-completion", { log: true });
    logger.setOutput(outputChannel);
    context.subscriptions.push({
        dispose: () => {
            logger.setOutput(null);
            outputChannel.dispose();
        },
    });

    const disposables: Disposable[] = [];
    workspace.onDidChangeConfiguration(async (e) => {
        try {
            if (e.affectsConfiguration(Configuration.IncludeGlobPattern) ||
                e.affectsConfiguration(Configuration.ExcludeGlobPattern) ||
                e.affectsConfiguration(Configuration.EnableExternalStylesheetSupport)) {
                await cache();
            }

            if (e.affectsConfiguration(Configuration.EnableEmmetSupport) || e.affectsConfiguration(Configuration.LanguageFeatures)) {
                const isEnabled = workspace.getConfiguration()
                    .get<boolean>(Configuration.EnableEmmetSupport);
                isEnabled ? registerEmmetProviders(emmetDisposables) : unregisterProviders(emmetDisposables);
            }

            if (e.affectsConfiguration(Configuration.HTMLLanguages) || e.affectsConfiguration(Configuration.LanguageFeatures)) {
                unregisterProviders(htmlDisposables);
                registerHTMLProviders(htmlDisposables);
            }

            if (e.affectsConfiguration(Configuration.CSSLanguages)
                || e.affectsConfiguration(Configuration.CSSParser)
                || e.affectsConfiguration(Configuration.LanguageFeatures)) {
                unregisterProviders(cssDisposables);
                registerCSSProviders(cssDisposables);
            }

            if (e.affectsConfiguration(Configuration.JavaScriptLanguages) || e.affectsConfiguration(Configuration.LanguageFeatures)) {
                unregisterProviders(javaScriptDisposables);
                registerJavaScriptProviders(javaScriptDisposables);
            }
        } catch (err) {
            const newErr = new Error("Failed to automatically reload the extension after the configuration change", { cause: err });
            logger.error("Error during configuration change", newErr);
            window.showErrorMessage(newErr.message);
        }
    }, null, disposables);
    context.subscriptions.push(...disposables);

    context.subscriptions.push(commands.registerCommand(Command.Cache, async () => {
        try {
            await cache();
        } catch (err) {
            const newErr = new Error("Failed to cache the CSS classes in the workspace", { cause: err });
            logger.error("Error during cache (command)", newErr);
            window.showErrorMessage(newErr.message);
        }
    }));

    context.subscriptions.push(workspace.onDidSaveTextDocument(textDocument => {
        if (textDocument.languageId === "css") {
            commands.executeCommand(Command.Cache);
        }
    }));

    if (workspace.getConfiguration().get<boolean>(Configuration.EnableEmmetSupport)) {
        registerEmmetProviders(emmetDisposables);
    }

    registerHTMLProviders(htmlDisposables);
    registerCSSProviders(cssDisposables);
    registerJavaScriptProviders(javaScriptDisposables);

    try {
        await cache();
    } catch (err) {
        const newErr = new Error("Failed to cache the CSS classes in the workspace for the first time", { cause: err });
        logger.error("Error during cache (initial)", newErr);
        window.showErrorMessage(newErr.message);
    }
}

export function deactivate(): void {
    unregisterProviders(htmlDisposables);
    unregisterProviders(cssDisposables);
    unregisterProviders(javaScriptDisposables);
    unregisterProviders(emmetDisposables);
}
