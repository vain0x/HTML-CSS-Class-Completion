export function resolve(specifier, context, nextResolve) {
  if (specifier === "vscode") {
    return {
      shortCircuit: true,
      url: new URL("../mocks/vscode.ts", import.meta.url).href,
    };
  }
  return nextResolve(specifier, context);
}
