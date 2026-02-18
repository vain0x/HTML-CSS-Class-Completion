import { after, before, type SuiteContext, type TestContext } from "node:test";
import type { Disposable } from "vscode";

export const setup = (cb: (context: TestContext | SuiteContext) => Disposable) => {
    let disposable: Disposable | undefined

    before((context) => {
        disposable = cb(context);
    });

    after(() => {
        disposable?.dispose();
        disposable = undefined;
    });
}
