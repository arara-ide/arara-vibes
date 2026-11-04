export class Position {
  constructor(readonly line: number, readonly character: number) {}
  isBefore(other: Position) {
    return this.line < other.line || this.line === other.line && this.character < other.character;
  }
}

export class Range {
  readonly start: Position;
  readonly end: Position;
  constructor(startLine: number | Position, startCharacter: number | Position, endLine?: number, endCharacter?: number) {
    this.start = startLine instanceof Position ? startLine : new Position(startLine, startCharacter as number);
    this.end = startCharacter instanceof Position ? startCharacter : new Position(endLine!, endCharacter!);
  }
  get isEmpty() {
    return this.start.line === this.end.line && this.start.character === this.end.character;
  }
}
