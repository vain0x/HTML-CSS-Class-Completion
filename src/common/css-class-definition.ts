"use strict";

import * as vscode from "vscode";

class CssClassDefinition {
    public constructor(public className: string) { }

    /** Documentation comments written in front of the definition. */
    comments?: string[];

    location?: vscode.Location;
}

export default CssClassDefinition;
