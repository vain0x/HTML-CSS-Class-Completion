import * as vscode from "vscode"

let output: vscode.LogOutputChannel | null = null

/** Logger gateway. */
const logger = {
  setOutput(obj: vscode.LogOutputChannel | null) {
    output = obj
  },

  debug(message: string, ...args: unknown[]): void {
    if (output) {
      output.debug(message, ...args);
    } else {
      console.debug(message, ...args);
    }
  },

  info(message: string, ...args: unknown[]): void {
    if (output) {
      output.info(message, ...args);
    } else {
      console.info(message, ...args);
    }
  },

  warn(message: string, ...args: unknown[]): void {
    if (output) {
      output.warn(message, ...args);
    } else {
      console.warn(message, ...args);
    }
  },

  error(message: string, ...args: unknown[]): void {
    if (output) {
      output.error(message, ...args);
    } else {
      console.error(message, ...args);
    }
  }
}

export default logger
