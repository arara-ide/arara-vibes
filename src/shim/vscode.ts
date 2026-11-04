import { Commands } from './commands';
import { Configuration } from './configuration';
import { Env } from './env';
import { EventEmitter, DisposableImpl, type Event, type Disposable } from './events';
import { Position, Range } from './position';
import {
  CodeActionKind,
  ConfigurationTarget,
  ExtensionKind,
  ExtensionMode,
  MarkdownString,
  ProcessExecution,
  ProgressLocation,
  Selection,
  StatusBarAlignment,
  TabInputText,
  TabInputTextDiff,
  Task,
  TaskPanelKind,
  TaskRevealKind,
  TaskScope,
  TextEditorRevealType,
  TextEditorSelectionChangeKind,
  ThemeColor,
  ThemeIcon,
  ViewColumn,
} from './types';
import { Uri } from './uri';
import { Window } from './window';
import { Workspace } from './workspace';

export interface VscodeInstance {
  commands: Commands;
  workspace: Workspace;
  window: Window;
  env: Env;
  extensions: {
    getExtension(id: string): { id: string; packageJSON: Record<string, unknown> } | undefined;
  };
  languages: {
    getDiagnostics(resource?: Uri): unknown[];
    onDidChangeDiagnostics: Event<unknown>;
    registerInlineCompletionItemProvider(selector: unknown, provider: unknown): Disposable;
  };
  tasks: {
    executeTask(task: Task): Promise<{ task: Task }>;
    onDidEndTask: Event<unknown>;
    onDidEndTaskProcess: Event<unknown>;
  };
  Uri: typeof Uri;
  Range: typeof Range;
  Position: typeof Position;
  Selection: typeof Selection;
  EventEmitter: typeof EventEmitter;
  Disposable: typeof DisposableImpl;
  ThemeColor: typeof ThemeColor;
  ThemeIcon: typeof ThemeIcon;
  MarkdownString: typeof MarkdownString;
  TabInputText: typeof TabInputText;
  TabInputTextDiff: typeof TabInputTextDiff;
  ProcessExecution: typeof ProcessExecution;
  Task: typeof Task;
  CodeActionKind: typeof CodeActionKind;
  ConfigurationTarget: typeof ConfigurationTarget;
  ExtensionKind: typeof ExtensionKind;
  ExtensionMode: typeof ExtensionMode;
  ProgressLocation: typeof ProgressLocation;
  StatusBarAlignment: typeof StatusBarAlignment;
  TaskPanelKind: typeof TaskPanelKind;
  TaskRevealKind: typeof TaskRevealKind;
  TaskScope: typeof TaskScope;
  TextEditorRevealType: typeof TextEditorRevealType;
  TextEditorSelectionChangeKind: typeof TextEditorSelectionChangeKind;
  ViewColumn: typeof ViewColumn;
}

export function createVscodeShim(config: Configuration, workspaceDir?: string): VscodeInstance {
  const commands = new Commands();
  const workspace = new Workspace(config, workspaceDir);
  const window = new Window();
  const env = new Env();
  const diagnosticsEmitter = new EventEmitter<unknown>();
  const taskEndEmitter = new EventEmitter<unknown>();
  const taskProcessEndEmitter = new EventEmitter<unknown>();

  return {
    commands,
    workspace,
    window,
    env,
    extensions: {
      getExtension: () => undefined,
    },
    languages: {
      getDiagnostics: () => [],
      onDidChangeDiagnostics: diagnosticsEmitter.event,
      registerInlineCompletionItemProvider: () => new DisposableImpl(() => {}),
    },
    tasks: {
      executeTask: async (task: Task) => ({ task }),
      onDidEndTask: taskEndEmitter.event,
      onDidEndTaskProcess: taskProcessEndEmitter.event,
    },
    Uri,
    Range,
    Position,
    Selection,
    EventEmitter,
    Disposable: DisposableImpl,
    ThemeColor,
    ThemeIcon,
    MarkdownString,
    TabInputText,
    TabInputTextDiff,
    ProcessExecution,
    Task,
    CodeActionKind,
    ConfigurationTarget,
    ExtensionKind,
    ExtensionMode,
    ProgressLocation,
    StatusBarAlignment,
    TaskPanelKind,
    TaskRevealKind,
    TaskScope,
    TextEditorRevealType,
    TextEditorSelectionChangeKind,
    ViewColumn,
  };
}
