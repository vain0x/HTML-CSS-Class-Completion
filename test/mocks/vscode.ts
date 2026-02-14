export { URI as Uri } from "vscode-uri";

export class Position {
  constructor(
    public readonly line: number,
    public readonly character: number,
  ) {}
}

export class Range {
  constructor(
    public readonly start: Position,
    public readonly end: Position,
  ) {}
}

export class Location {
  constructor(
    public readonly uri: import("vscode-uri").URI,
    public readonly range: Range,
  ) {}
}
