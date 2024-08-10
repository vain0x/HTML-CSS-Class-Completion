import * as _ from "lodash";
import pMap from "p-map";
import "source-map-support/register";
import * as vscode from "vscode";
import {
    commands, CompletionItem, CompletionItemKind, Disposable,
    ExtensionContext, languages, Location, Position, Range, TextDocument, Uri, window,
    workspace,
} from "vscode";
import CssClassDefinition from "./common/css-class-definition";
import Fetcher from "./fetcher";
import Notifier from "./notifier";
import ParseEngineGateway from "./parse-engine-gateway";
import IParseOptions from "./parse-engines/common/parse-options";

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

        console.log("Looking for parseable documents...");
        const uris: Uri[] = await Fetcher.findAllParseableDocuments();

        if (!uris || uris.length === 0) {
            console.log("Found no documents");
            notifier.statusBarItem.hide();
            return;
        }

        console.log("Found all parseable documents.");
        const definitions: CssClassDefinition[] = [];

        const configuration = vscode.workspace.getConfiguration();
        const parseOptions: IParseOptions = {
            enableExternalStylesheetSupport: configuration.get<boolean>(Configuration.EnableExternalStylesheetSupport)!,
        };

        let filesParsed = 0;
        let failedLogs = "";
        let failedLogsCount = 0;

        console.log("Parsing documents and looking for CSS class definitions...");

        try {
            await pMap(uris, async (uri) => {
                try {
                    Array.prototype.push.apply(definitions, await ParseEngineGateway.callParser(uri, parseOptions));
                } catch (error) {
                    failedLogs += `${uri.path}\n`;
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

        uniqueDefinitions = _.uniqBy(definitions, (def) => def.className);

        console.log("Summary:");
        console.log(uris.length, "parseable documents found");
        console.log(definitions.length, "CSS class definitions found");
        console.log(uniqueDefinitions.length, "unique CSS class definitions found");
        console.log(failedLogsCount, "failed attempts to parse. List of the documents:");
        console.log(failedLogs);

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
    classMatchRegex: RegExp,
    classPrefix = "",
    splitChar = " "
) => languages.registerCompletionItemProvider(languageSelector, {
    provideCompletionItems(document: TextDocument, position: Position): CompletionItem[] {
        const start: Position = new Position(position.line, 0);
        const range: Range = new Range(start, position);
        const text: string = document.getText(range);

        // Check if the cursor is on a class attribute and retrieve all the css rules in this class attribute
        const rawClasses: RegExpMatchArray | null = text.match(classMatchRegex);
        if (!rawClasses || rawClasses.length === 1) {
            return [];
        }

        // Will store the classes found on the class attribute
        const classesOnAttribute = rawClasses[1].split(splitChar);

        // Creates a collection of CompletionItem based on the classes already cached
        const completionItems = uniqueDefinitions.map((definition) => {
            const completionItem = new CompletionItem(definition.className, CompletionItemKind.Variable);
            const completionClassName = `${classPrefix}${definition.className}`;

            completionItem.filterText = completionClassName;
            completionItem.insertText = completionClassName;
            completionItem.range = document.getWordRangeAtPosition(position, /[-\w,@\\:\[\]]+/);

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

const registerDefinitionProvider = (languageSelector: string, classMatchRegex: RegExp) => languages.registerDefinitionProvider(languageSelector, {
    provideDefinition(document, position, _token) {
        // Check if the cursor is on a class attribute and retrieve all the css rules in this class attribute
        {
            const start: Position = new Position(position.line, 0);
            const range: Range = new Range(start, position);
            const text: string = document.getText(range);

            const rawClasses: RegExpMatchArray | null = text.match(classMatchRegex);
            if (!rawClasses || rawClasses.length === 1) {
                return;
            }
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
            disposables.push(registerCompletionProvider(extension, /class=["|']([\w-@:\/ ]*$)/));
        });

const registerCSSProviders = (disposables: Disposable[]) =>
    workspace.getConfiguration()
        .get<string[]>(Configuration.CSSLanguages)
        ?.forEach((extension) => {
            // The @apply rule was a CSS proposal which has since been abandoned,
            // check the proposal for more info: http://tabatkins.github.io/specs/css-apply-rule/
            // Its support should probably be removed
            disposables.push(registerCompletionProvider(extension, /@apply ([.\w-@:\/ ]*$)/, "."));
        });

const registerJavaScriptProviders = (disposables: Disposable[]) =>
    workspace.getConfiguration()
        .get<string[]>(Configuration.JavaScriptLanguages)
        ?.forEach((extension) => {
            disposables.push(registerCompletionProvider(extension, /className=(?:{?"|{?'|{?`)([\w-@:\/ ]*$)/));
            disposables.push(registerCompletionProvider(extension, /class=(?:{?"|{?')([\w-@:\/ ]*$)/));
            disposables.push(registerDefinitionProvider(extension, /class(?:Name)?=["|']([\w- ]*$)/));
        });

function registerEmmetProviders(disposables: Disposable[]) {
    const emmetRegex = /(?=\.)([\w-@:\/. ]*$)/;

    const registerProviders = (modes: string[]) => {
        modes.forEach((language) => {
            disposables.push(registerCompletionProvider(language, emmetRegex, "", "."));
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
            console.error(newErr);
            window.showErrorMessage(newErr.message);
        }
    }, null, disposables);
    context.subscriptions.push(...disposables);

    context.subscriptions.push(commands.registerCommand(Command.Cache, async () => {
        try {
            await cache();
        } catch (err) {
            const newErr = new Error("Failed to cache the CSS classes in the workspace", { cause: err });
            console.error(newErr);
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
        console.error(newErr);
        window.showErrorMessage(newErr.message);
    }
}

export function deactivate(): void {
    unregisterProviders(htmlDisposables);
    unregisterProviders(cssDisposables);
    unregisterProviders(javaScriptDisposables);
    unregisterProviders(emmetDisposables);
}
