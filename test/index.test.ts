import assert from "node:assert"
import { suite, test } from "node:test"
import CssParseEngine from "../src/parse-engines/types/css-parse-engine"
// ^not working as vscode module is not provided in test harness

suite("index", () => {
  test("it works", async () => {
    const engine = new CssParseEngine()
    const definitions = await engine.parse({
      languageId: "css",
      getText() { return ".foo {}" }
    })
    assert.equal(definitions.length, 1)
  })
})
