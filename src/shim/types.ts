import { Position, Range } from './position';
import type { Uri } from './uri';

export const ConfigurationTarget = {
  Global: 1,
  Workspace: 2,
  WorkspaceFolder: 3,
} as const;

export const ExtensionMode = {
  Production: 1,
  Development: 2,
  Test: 3,
} as const;

export const ExtensionKind = {
  UI: 1,
  Workspace: 2,
} as const;

export const ProgressLocation = {
  SourceControl: 1,
  Window: 10,
  Notification: 15,
} as const;

export const StatusBarAlignment = {
  Left: 1,
  Right: 2,
} as const;

export const ViewColumn = {
  Active: -1,
  Beside: -2,
  One: 1,
  Two: 2,
  Three: 3,
} as const;

export const TextEditorRevealType = {
  Default: 0,
  InCenter: 1,
  InCenterIfOutsideViewport: 2,
  AtTop: 3,
} as const;

export const TextEditorSelectionChangeKind = {
  Keyboard: 1,
  Mouse: 2,
  Command: 3,
} as const;

export const TaskPanelKind = {
  Shared: 1,
  Dedicated: 2,
  New: 3,
} as const;

export const TaskRevealKind = {
  Always: 1,
  Silent: 2,
  Never: 3,
} as const;

export const TaskScope = {
  Global: 1,
  Workspace: 2,
} as const;

export const CodeActionKind = {
  Empty: '',
  QuickFix: 'quickfix',
  Refactor: 'refactor',
} as const;

export class Selection extends Range {
  constructor(readonly anchor: Position, readonly active: Position) {
    super(anchor, active);
  }
}

export class ThemeColor {
  constructor(readonly id: string) {}
}

export class ThemeIcon {
  constructor(readonly id: string, readonly color?: ThemeColor) {}
}

export class MarkdownString {
  constructor(public value: string = '', public isTrusted: boolean = false) {}
  appendMarkdown(value: string) {
    this.value += value;
    return this;
  }
  appendText(value: string) {
    this.value += value;
    return this;
  }
}

export class TabInputText {
  constructor(readonly uri: Uri) {}
}

export class TabInputTextDiff {
  constructor(readonly original: Uri, readonly modified: Uri) {}
}

export class ProcessExecution {
  constructor(readonly process: string, readonly args: string[] = [], readonly options?: unknown) {}
}

export class Task {
  constructor(
    readonly definition: unknown,
    readonly scope: unknown,
    readonly name: string,
    readonly source: string,
    readonly execution?: unknown,
  ) {}
}
