import pMap from "p-map";
import "source-map-support/register";
import * as vscode from "vscode";
import {
    commands, CompletionItem, CompletionItemKind, Disposable,
    ExtensionContext, languages, Location, Position, Range, TextDocument, Uri, window,
    workspace,
} from "vscode";
import type ClassAttributeMatcher from "./common/class-attribute-matcher";
import CssClassDefinition from "./common/css-class-definition";
import Fetcher from "./fetcher";
import Notifier from "./notifier";
import ParseEngineGateway from "./parse-engine-gateway";
import ClassAttributeExtractor from "./parse-engines/common/class-attribute-extractor";
import IParseOptions from "./parse-engines/common/parse-options";
import logger from "./logger"

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
}

const notifier: Notifier = new Notifier(Command.Cache);
let uniqueDefinitions: CssClassDefinition[] = [];

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

        uniqueDefinitions = [...Map.groupBy(definitions, (def) => def.className)].map(([_className, group]) => group[0]);

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
    matcher: ClassAttributeMatcher,
    classPrefix = "",
) => languages.registerCompletionItemProvider(languageSelector, {
    provideCompletionItems(document: TextDocument, position: Position): CompletionItem[] {
        // Check if the cursor is on class attribute and collect class names on the attribute.
        const classesOnAttribute = ClassAttributeExtractor.extract(document, position, matcher);
        if (classesOnAttribute == null) {
            return [];
        }

        const wordRangeAtPosition = document.getWordRangeAtPosition(position, /[-\w,@\\:\[\]]+/);

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

const registerDefinitionProvider = (languageSelector: string, matcher: ClassAttributeMatcher) => languages.registerDefinitionProvider(languageSelector, {
    provideDefinition(document, position, _token) {
        // Check if the cursor is on class attribute.
        const classesOnAttribute = ClassAttributeExtractor.extract(document, position, matcher);
        if (classesOnAttribute == null) {
            return;
        }

        const range: Range | undefined = document.getWordRangeAtPosition(position, /[-\w,@\\:\[\]]+/);
        if (range == null) {
            return;
        }

        const word: string = document.getText(range);

        const definition = uniqueDefinitions.find((definition) => {
            return definition.className === word;
        });
        if (definition == null || !definition.location) {
            return;
        }

        return definition.location as Location;
    },
})

const registerHTMLProviders = (disposables: Disposable[]) =>
    workspace.getConfiguration()
        ?.get<string[]>(Configuration.HTMLLanguages)
        ?.forEach((extension) => {
            disposables.push(registerCompletionProvider(extension, { type: "regexp", classMatchRegex: /class=["|']([-\w,@\\:\[\] ]*$)/ }));
        });

const registerCSSProviders = (disposables: Disposable[]) =>
    workspace.getConfiguration()
        .get<string[]>(Configuration.CSSLanguages)
        ?.forEach((extension) => {
            // The @apply rule was a CSS proposal which has since been abandoned,
            // check the proposal for more info: http://tabatkins.github.io/specs/css-apply-rule/
            // Its support should probably be removed
            disposables.push(registerCompletionProvider(extension, { type: "regexp", classMatchRegex: /@apply ((?:\.|[-\w,@\\:\[\] ])*$)/ }, "."));
        });

const registerJavaScriptProviders = (disposables: Disposable[]) =>
    workspace.getConfiguration()
        .get<string[]>(Configuration.JavaScriptLanguages)
        ?.forEach((extension) => {
            disposables.push(registerCompletionProvider(extension, { type: "jsx" }));
            disposables.push(registerDefinitionProvider(extension, { type: "jsx" }));
        });

function registerEmmetProviders(disposables: Disposable[]) {
    const emmetRegex = /(?=\.)([\w-@:\/. ]*$)/;

    const registerProviders = (modes: string[]) => {
        modes.forEach((language) => {
            disposables.push(registerCompletionProvider(language, { type: "regexp", classMatchRegex: emmetRegex, splitChar: "" }, "."));
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

            if (e.affectsConfiguration(Configuration.EnableEmmetSupport)) {
                const isEnabled = workspace.getConfiguration()
                    .get<boolean>(Configuration.EnableEmmetSupport);
                isEnabled ? registerEmmetProviders(emmetDisposables) : unregisterProviders(emmetDisposables);
            }

            if (e.affectsConfiguration(Configuration.HTMLLanguages)) {
                unregisterProviders(htmlDisposables);
                registerHTMLProviders(htmlDisposables);
            }

            if (e.affectsConfiguration(Configuration.CSSLanguages)) {
                unregisterProviders(cssDisposables);
                registerCSSProviders(cssDisposables);
            }

            if (e.affectsConfiguration(Configuration.JavaScriptLanguages)) {
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
