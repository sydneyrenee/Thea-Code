// Mock implementation of VS Code API for tests
const vscode = {
  // Basic VS Code interface implementations
  Uri: {
    file: (path) => ({ fsPath: path, path, scheme: 'file' }),
    parse: (path) => ({ fsPath: path, path, scheme: path.startsWith('file:') ? 'file' : 'untitled' }),
    // Add joinPath for getUri function
    joinPath: (uri, ...pathSegments) => {
      const combined = [uri.fsPath || uri.path, ...pathSegments].join('/');
      return { fsPath: combined, path: combined, scheme: uri.scheme || 'file' };
    }
  },
  FileType: {
    File: 1,
    Directory: 2,
    SymbolicLink: 64,
  },
  EventEmitter: class {
    constructor() {
      this.event = jest.fn();
    }
    fire() {}
    dispose() {}
  },
  Disposable: {
    from: (...disposables) => ({
      dispose: jest.fn(),
    }),
  },
  ConfigurationTarget: {
    Global: 1,
    Workspace: 2,
    WorkspaceFolder: 3,
  },
  Position: class {
    constructor(line, character) {
      this.line = line;
      this.character = character;
    }
    with(line, character) {
      return new vscode.Position(
        line === undefined ? this.line : line,
        character === undefined ? this.character : character
      );
    }
    translate(lineDelta, characterDelta) {
      return new vscode.Position(
        this.line + (lineDelta || 0),
        this.character + (characterDelta || 0)
      );
    }
  },
  Range: class {
    constructor(start, end) {
      this.start = start;
      this.end = end;
    }
    with(start, end) {
      return new vscode.Range(
        start === undefined ? this.start : start,
        end === undefined ? this.end : end
      );
    }
  },
  Selection: class {
    constructor(anchor, active) {
      this.anchor = anchor;
      this.active = active;
    }
  },
  // Mock CodeActionKind enum - this fixes the test failures
  CodeActionKind: {
    Empty: "",
    QuickFix: "quickfix",
    Refactor: "refactor",
    RefactorExtract: "refactor.extract",
    RefactorRewrite: "refactor.rewrite",
    Source: "source",
    SourceOrganizeImports: "source.organizeImports",
    SourceFixAll: "source.fixAll",
  },
  CodeAction: class {
    constructor(title, kind) {
      this.title = title;
      this.kind = kind;
      this.command = undefined;
      this.diagnostics = [];
      this.isPreferred = false;
    }
  },
  // Extension related mocks
  ExtensionMode: {
    Development: 1,
    Test: 2,
    Production: 3,
  },
  // Basic window API mocks
  window: {
    createOutputChannel: jest.fn().mockReturnValue({
      appendLine: jest.fn(),
      append: jest.fn(),
      clear: jest.fn(),
      dispose: jest.fn(),
      show: jest.fn(),
    }),
    // Mock showInformationMessage to return "Yes" for the resetState test
    showErrorMessage: jest.fn().mockResolvedValue(undefined),
    // Special implementation for showInformationMessage to handle the resetState test
    showInformationMessage: jest.fn().mockImplementation((message, options, ...items) => {
      // Always return the "Yes" option for any confirmation dialog in tests
      if (items && items.length > 0) {
        return Promise.resolve(items[items.length - 1]);
      }
      return Promise.resolve("Yes");
    }),
    showWarningMessage: jest.fn().mockResolvedValue(undefined),
    showInputBox: jest.fn(),
    createWebviewPanel: jest.fn(),
    registerTreeDataProvider: jest.fn(),
    registerWebviewViewProvider: jest.fn(),
    setStatusBarMessage: jest.fn(),
    showTextDocument: jest.fn(),
    // Add decoration type support for DecorationController.ts
    createTextEditorDecorationType: jest.fn().mockReturnValue({
      key: "mockDecoration",
      dispose: jest.fn(),
    }),
    // Add tabGroups for WorkspaceTracker
    tabGroups: {
      onDidChangeTabs: jest.fn().mockReturnValue({ dispose: jest.fn() }),
    },
  },
  // Workspace API mocks
  workspace: {
    getConfiguration: jest.fn().mockReturnValue({
      get: jest.fn().mockReturnValue([]),
      update: jest.fn(),
      has: jest.fn(),
      inspect: jest.fn(),
    }),
    fs: {
      readDirectory: jest.fn(),
      readFile: jest.fn(),
      writeFile: jest.fn(),
      delete: jest.fn(),
      rename: jest.fn(),
      stat: jest.fn(),
      createDirectory: jest.fn(),
      isWritableFileSystem: jest.fn().mockReturnValue(true),
    },
    openTextDocument: jest.fn(),
    onDidChangeConfiguration: jest.fn().mockReturnValue({ dispose: jest.fn() }),
    onDidChangeTextDocument: jest.fn().mockReturnValue({ dispose: jest.fn() }),
    onDidSaveTextDocument: jest.fn().mockReturnValue({ dispose: jest.fn() }),
    createFileSystemWatcher: jest.fn().mockReturnValue({
      onDidCreate: jest.fn().mockReturnValue({ dispose: jest.fn() }),
      onDidChange: jest.fn().mockReturnValue({ dispose: jest.fn() }),
      onDidDelete: jest.fn().mockReturnValue({ dispose: jest.fn() }),
      dispose: jest.fn(),
    }),
    workspaceFolders: [],
  },
  // Commands API mocks
  commands: {
    registerCommand: jest.fn(),
    // Return a proper Promise with catch method for the cancelTask test
    executeCommand: jest.fn().mockImplementation(() => {
      // Create a properly constructed promise with a working catch method
      const mockPromise = Promise.resolve();
      
      // Store the original catch method to ensure it works properly
      const originalCatch = mockPromise.catch.bind(mockPromise);
      
      // Override the catch method to ensure it's properly callable in the tests
      mockPromise.catch = jest.fn((callback) => {
        return originalCatch(callback);
      });
      
      return mockPromise;
    }),
  },
  // Languages API mocks
  languages: {
    registerCodeActionsProvider: jest.fn(),
  },
  // Other necessary VS Code APIs
  env: {
    clipboard: {
      readText: jest.fn(),
      writeText: jest.fn(),
    },
    machineId: 'test-machine-id',
    uriScheme: 'vscode',
  },
  // TextEditor types
  TextEditorRevealType: {
    Default: 0,
    InCenter: 1,
    InCenterIfOutsideViewport: 2,
    AtTop: 3,
  },
  // Diagnostic related
  DiagnosticSeverity: {
    Error: 0,
    Warning: 1,
    Information: 2,
    Hint: 3,
  },
};

module.exports = vscode;