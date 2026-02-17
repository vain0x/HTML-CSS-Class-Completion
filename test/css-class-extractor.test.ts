import assert from "node:assert";
import { suite, test } from "node:test";
import * as postcss from "postcss";
import * as vscode from "vscode";
import CssClassExtractor from "../src/parse-engines/common/css-class-extractor";

/** Parse CSS and extract class definitions. */
function extract(code: string, uri?: vscode.Uri) {
    return CssClassExtractor.extract(postcss.parse(code), uri);
}

/** Shorthand to get just the class names. */
function extractNames(code: string) {
    return extract(code).map((d) => d.className);
}

suite("CssClassExtractor", () => {
    test("extracts multiple classes from a compound selector", () => {
        assert.deepStrictEqual(extractNames(".foo.bar {}"), ["foo", "bar"]);
    });

    test("extracts classes from multiple rules", () => {
        assert.deepStrictEqual(extractNames(".a {} .b {} .c {}"), ["a", "b", "c"]);
    });

    test("extracts classes inside @media", () => {
        assert.deepStrictEqual(
            extractNames("@media (max-width: 968px) { .responsive {} }"),
            ["responsive"],
        );
    });

    // --- Location ---

    test("returns location when uri is provided", () => {
        const uri = vscode.Uri.file("/test.css");
        const defs = extract(".foo {}", uri);
        assert.equal(defs.length, 1);

        const loc = defs[0].location;
        assert.ok(loc, "location should be defined");
        assert.equal(loc.range.start.line, 0);
        assert.equal(loc.range.start.character, 0);
        assert.equal(loc.range.end.line, 0);
        assert.equal(loc.range.end.character, 4); // ".foo"
    });

    test("location reflects correct line numbers", () => {
        const uri = vscode.Uri.file("/test.css");
        const code = `
.first {}
.second {}
`.trimStart();
        const defs = extract(code, uri);
        assert.equal(defs.length, 2);
        assert.equal(defs[0].location!.range.start.line, 0);
        assert.equal(defs[1].location!.range.start.line, 1);
    });

    test("location points to individual class in compound selector", () => {
        const uri = vscode.Uri.file("/test.css");
        const defs = extract(".foo.bar {}", uri);
        assert.equal(defs.length, 2);
        // .foo at column 0-4, .bar at column 4-8
        assert.equal(defs[0].location!.range.start.character, 0);
        assert.equal(defs[0].location!.range.end.character, 4);
        assert.equal(defs[1].location!.range.start.character, 4);
        assert.equal(defs[1].location!.range.end.character, 8);
    });

    test("location points to individual class in selector list", () => {
        const uri = vscode.Uri.file("/test.css");
        // ".foo, .bar {}"
        const defs = extract(".foo, .bar {}", uri);
        assert.equal(defs.length, 2);
        assert.equal(defs[0].location!.range.start.character, 0);
        assert.equal(defs[0].location!.range.end.character, 4);
        assert.equal(defs[1].location!.range.start.character, 6);
        assert.equal(defs[1].location!.range.end.character, 10);
    });

    // --- Comments ---

    test("attaches doc comment preceding a rule", () => {
        const code = `/** Primary button style */\n.btn-primary {}`;
        const defs = extract(code);
        assert.deepStrictEqual(defs[0].comments, ["Primary button style"]);
    });

    test("attaches multiple consecutive doc comments", () => {
        const code = `/** Line 1 */\n/** Line 2 */\n.multi {}`;
        const defs = extract(code);
        assert.deepStrictEqual(defs[0].comments, ["Line 1", "Line 2"]);
    });

    test("ignores non-doc comments (without leading *)", () => {
        const code = `/* not a doc comment */\n.plain {}`;
        const defs = extract(code);
        assert.equal(defs[0].comments, undefined);
    });

    test("does not attach comment if separated by another rule", () => {
        const code = `/** orphan */\n.gap {}\n.next {}`;
        const defs = extract(code);
        assert.equal(defs[1].comments, undefined);
    });

    // --- Escape ---

    test("handles negative value class", () => {
        assert.deepStrictEqual(extractNames(".-mt-4 {}"), ["-mt-4"]);
    });

    test("handles escaped class names", () => {
        assert.deepStrictEqual(
            extractNames(".bg-\\[\\#FAFAFA\\] {}"),
            ["bg-[#FAFAFA]"],
        );

        assert.deepStrictEqual(
            extractNames(".md\\:w-1\\/2 {}"),
            ["md:w-1/2"],
        );

        assert.deepStrictEqual(
            extractNames(".lg\\:grid-cols-\\[1fr_minmax\\(0\\,_1fr\\)\\] {}"),
            ["lg:grid-cols-[1fr_minmax(0,_1fr)]"],
        );
    });

    // --- CSS nesting ---

    test("extracts class names in css nesting", () => {
        const definitions = extract(".foo { & .bar {} }");
        assert.equal(definitions.length, 2);
        assert.equal(definitions[0].className, "foo");
        assert.equal(definitions[1].className, "bar");
    });
});
