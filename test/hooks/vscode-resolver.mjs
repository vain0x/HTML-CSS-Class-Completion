export function resolve(specifier, context, nextResolve) {
  if (specifier === "vscode") {
    return {
      url: new URL("../mocks/vscode.ts", import.meta.url).href,
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}
