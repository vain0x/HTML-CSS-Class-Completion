import assert from "node:assert";
import { suite, test } from "node:test";
import { Position } from "vscode";
import { extractClassNameFromAttribute, extractClassNameFromSelector, searchClassUsagesInDocument } from "../src/class-name-extractor";
import { createDocument } from "./mocks/text-document";

suite("extractClassNameFromSelector", () => {
    test("extracts class name from simple selector", () => {
        const doc = createDocument(".foo {}", "css");
        assert.strictEqual(extractClassNameFromSelector(doc, new Position(0, 1)), "foo");
    });

    test("extracts class name when cursor is on the dot", () => {
        const doc = createDocument(".foo {}", "css");
        assert.strictEqual(extractClassNameFromSelector(doc, new Position(0, 0)), "foo");
    });

    test("returns undefined for element selector", () => {
        const doc = createDocument("div {}", "css");
        assert.strictEqual(extractClassNameFromSelector(doc, new Position(0, 1)), undefined);
    });

    test("extracts class name with hyphens and underscores", () => {
        const doc = createDocument(".my-class_name {}", "css");
        assert.strictEqual(extractClassNameFromSelector(doc, new Position(0, 3)), "my-class_name");
    });

    test("unescapes backslashes", () => {
        const doc = createDocument(".bg-\\[\\#FAFAFA\\] {}", "css");
        assert.strictEqual(extractClassNameFromSelector(doc, new Position(0, 1)), "bg-[#FAFAFA]");
    });

    test("extracts correct class from compound selector", () => {
        const doc = createDocument(".foo.bar {}", "css");
        // cursor on "bar" part (position 5 = "b" of ".bar")
        assert.strictEqual(extractClassNameFromSelector(doc, new Position(0, 5)), "bar");
    });
});

suite("extractClassNameFromAttribute", () => {
    test("extracts class name from HTML class attribute", () => {
        const doc = createDocument('<div class="foo bar">', "html");
        // cursor on "foo" (position 13 = "o" of "foo")
        assert.strictEqual(
            extractClassNameFromAttribute(doc, new Position(0, 13), { type: "regexp", classMatchRegex: /class=["|']([-_\w,:/#@\(\)\[\] ]*$)/ }),
            "foo",
        );
    });

    test("returns undefined when cursor is outside class attribute", () => {
        const doc = createDocument("<div>foo</div>", "html");
        assert.strictEqual(
            extractClassNameFromAttribute(doc, new Position(0, 6), { type: "regexp", classMatchRegex: /class=["|']([-_\w,:/#@\(\)\[\] ]*$)/ }),
            undefined,
        );
    });

    test("extracts class name from JSX className attribute", () => {
        const doc = createDocument('<div className="active">', "typescriptreact");
        // cursor on "active" (position 16)
        assert.strictEqual(
            extractClassNameFromAttribute(doc, new Position(0, 19), { type: "jsx" }),
            "active",
        );
    });
});

suite("searchClassUsagesInDocument", () => {
    const tsxContent = `const Foo = () => (
  <div>
    <div className="foo bar" />
    <div className="foo hoge" />
  </div>
)`;

    test("finds all usages of a class in JSX file", () => {
        const doc = createDocument(tsxContent, "typescriptreact");
        const locations = searchClassUsagesInDocument(doc, "foo", { type: "jsx" });

        assert.strictEqual(locations.length, 2);
        // First usage: line 2, className="foo bar"
        assert.strictEqual(locations[0].range.start.line, 2);
        assert.strictEqual(locations[0].range.start.character, 20);
        // Second usage: line 3, className="foo hoge"
        assert.strictEqual(locations[1].range.start.line, 3);
        assert.strictEqual(locations[1].range.start.character, 20);
    });

    test("does not match class name in non-attribute context", () => {
        // "foo" appears as component name and in className
        const content = `const foo = () => <div className="foo" />`;
        const doc = createDocument(content, "typescriptreact");
        const locations = searchClassUsagesInDocument(doc, "foo", { type: "jsx" });

        // Only the className="foo" should match, not `const foo`
        assert.strictEqual(locations.length, 1);
        assert.strictEqual(locations[0].range.start.character, 34);
    });

    test("does not match partial class name", () => {
        const content = `<div className="foobar foo" />`;
        const doc = createDocument(content, "typescriptreact");
        const locations = searchClassUsagesInDocument(doc, "foo", { type: "jsx" });

        // "foobar" should not match, only "foo"
        assert.strictEqual(locations.length, 1);
        assert.strictEqual(locations[0].range.start.character, 23);
    });
});
