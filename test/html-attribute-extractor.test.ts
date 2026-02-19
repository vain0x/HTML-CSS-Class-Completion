import assert from "node:assert";
import { suite, test } from "node:test";
import { Position } from "vscode";
import HtmlAttributeExtractor from "../src/attribute-extractors/types/html-attribute-extractor";
import { createDocument } from "./mocks/text-document";

const extractor = new HtmlAttributeExtractor();

suite("HtmlAttributeExtractor", () => {
    test("double-quoted attribute", () => {
        const doc = createDocument('<div class="foo bar">'); // foo bar<|>
        const result = extractor.extract(doc, new Position(0, 19));
        assert.deepStrictEqual(result, ["foo", "bar"]);
    });

    test("single-quoted attribute", () => {
        const doc = createDocument("<div class='foo bar'>"); // foo bar<|>
        const result = extractor.extract(doc, new Position(0, 19));
        assert.deepStrictEqual(result, ["foo", "bar"]);
    });

    test("unquoted attribute", () => {
        const doc = createDocument("<div class=foo>");
        const result = extractor.extract(doc, new Position(0, 14)); // foo<|>
        assert.deepStrictEqual(result, ["foo"]);
    });

    test("includes class names after position", () => {
        const doc = createDocument('<div class="alpha beta gamma">'); // beta<|>
        const result = extractor.extract(doc, new Position(0, 22));
        assert.deepStrictEqual(result, ["alpha", "beta", "gamma"]);
    });

    test("resolves to only class attribute at the position", () => {
        const doc = createDocument('<div class="a b" class="c d" class="e f">');
        const result = extractor.extract(doc, new Position(0, 27)); // d<|>
        assert.deepStrictEqual(result, ["c", "d"]);
    });

    test("returns empty", () => {
        const doc = createDocument('<div class="">'); // class="<|>"
        const result = extractor.extract(doc, new Position(0, 12));
        assert.deepStrictEqual(result, []);
    });

    test("outside of attribute", () => {
        const doc = createDocument('<div class="a b" other="" class="c d">'); // other="<|>"
        const result = extractor.extract(doc, new Position(0, 24));
        assert.strictEqual(result, null);
    });

    test("superfluous spaces", () => {
        const doc = createDocument('<div class="  foo  bar  ">');
        const result = extractor.extract(doc, new Position(0, 22)); // bar<|>
        assert.deepStrictEqual(result, ["foo", "bar"]);
    });

    test("weird class names", () => {
        const doc = createDocument(`<div class="text-[#777] lg:cols-[31.4px,_15%] bg-[url('/@/!.png')]">`);
        const result = extractor.extract(doc, new Position(0, 24));
        assert.deepStrictEqual(result, ["text-[#777]", "lg:cols-[31.4px,_15%]", "bg-[url('/@/!.png')]"]);
    });
});
