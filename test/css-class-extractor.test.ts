import * as css from "@adobe/css-tools";
import assert from "node:assert";
import { suite, test } from "node:test";
import CssClassExtractor from "../src/parse-engines/common/css-class-extractor";

suite("CssClassExtractor", () => {
  test("extracts a single class name", () => {
    const ast = css.parse(".foo {}");
    const definitions = CssClassExtractor.extract(ast, undefined);
    assert.equal(definitions.length, 1);
    assert.equal(definitions[0].className, "foo");
  });
});
