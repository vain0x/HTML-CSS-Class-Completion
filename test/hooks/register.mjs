import { register } from "node:module";
import { pathToFileURL } from "node:url";

// Register swc hooks first
register("@swc-node/register/esm", pathToFileURL("./").toString());

// Register vscode resolver second (LIFO: runs before swc)
register("./vscode-resolver.mjs", import.meta.url);
