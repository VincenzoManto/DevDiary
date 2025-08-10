// tracker.ts
import * as vscode from 'vscode';
import * as cp from 'child_process';

export type TimeCategory = 'writing' | 'thinking' | 'debugging' | 'rest' | 'error';

export interface TimeEntry {
  start: number;
  end: number;
  category: TimeCategory;
  workspace: string;
  language: string;
}

export interface ErrorEntry {
  timestamp: number;
  message: string;
  language: string;
  workspace: string;
}

export class CodeTimeTracker {
  private context: vscode.ExtensionContext;
  private currentCategory: TimeCategory | null = 'rest';
  private currentStart: number = 0;
  private lastInput: number = 0;
  private lastFocus: boolean = false;
  private lastDebug: boolean = false;
  private lastWorkspace: string = '';
  private lastLanguage: string = '';
  private inputTimeout: ReturnType<typeof setTimeout> | null = null;
  private commits = 0;
  private commentLines = new Set<number>();

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    // Load initial values from global state to persist metrics across sessions
    this.commits = this.context.globalState.get<number>('codeCommits', 0);

    this.setupListeners();
    this.startErrorMonitor();
    this.setupGitListener();
  }

  /**
   * Public method to save all metrics when the extension is deactivated.
   * This is a crucial hook for a real-world extension to prevent data loss.
   */
  public onDeactivate() {
    this.saveAllMetrics();
  }

  private setupListeners() {
    vscode.window.onDidChangeWindowState((e: vscode.WindowState) => this.handleWindowFocus(e.focused));
    vscode.workspace.onDidChangeTextDocument((e: vscode.TextDocumentChangeEvent) => this.handleTyping(e));
    vscode.debug.onDidStartDebugSession(() => this.handleDebug(true));
    vscode.debug.onDidTerminateDebugSession(() => this.handleDebug(false));
  }

  private startErrorMonitor() {
    // Listen for custom events from all debug sessions
    this.context.subscriptions.push(
      vscode.debug.onDidReceiveDebugSessionCustomEvent((event) => {
        // We look for 'output' events with category 'stderr', which typically indicates an error.
        if (event.event === 'output' && event.body.category === 'stderr') {
          const message = event.body.output;
          this.saveError({
            timestamp: Date.now(),
            message: message,
            language: this.lastLanguage,
            workspace: this.lastWorkspace,
          });
        }
      })
    );
  }

  private handleWindowFocus(focused: boolean) {
    this.lastFocus = focused;
    if (!focused) {
      this.switchCategory('rest');
    } else {
      this.switchCategory('thinking');
    }
  }

  private handleTyping(e: vscode.TextDocumentChangeEvent) {
    if (!this.lastFocus) return;

    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const language = editor.document.languageId;
    const workspace = vscode.workspace.workspaceFolders?.[0]?.name || 'unknown';
    this.lastLanguage = language;
    this.lastWorkspace = workspace;
    this.lastInput = Date.now();

    // Improved comment counting logic: check if the added text starts a new comment line
    for (const change of e.contentChanges) {
      const addedText = change.text;
      if (addedText.trim().length > 0) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          const line = editor.document.lineAt(change.range.start.line).text.trim();
          console.log(`Checking line for comments: "${line}"`);

          if (line.startsWith('//') || line.startsWith('/*') || line.startsWith('#')) {
            this.commentLines.add(change.range.start.line);
          }
        }
      }
    }

    this.switchCategory('writing');
    if (this.inputTimeout) clearTimeout(this.inputTimeout);
    this.inputTimeout = setTimeout(() => {
      if (Date.now() - this.lastInput > 10000) {
        this.switchCategory('thinking');
      }
    }, 11000);
  }

 private async setupGitListener() {
    try {
      const gitExtension = vscode.extensions.getExtension('vscode.git');
      if (!gitExtension) {
        console.warn('Estensione Git non disponibile.');
        return;
      }
      
      const git = gitExtension.exports;
      if (!git || !git.getAPI) {
        console.error('API dell\'estensione Git non trovata.');
        return;
      }
      
      const gitApi = git.getAPI(1);
      
      if (gitApi) {
        // Funzione per ascoltare i commit su un repository
        const setupRepositoryListener = (repo: any) => {
          this.context.subscriptions.push(repo.onDidCommit(() => {
            console.log('Commit Git rilevato!');
            this.commits++;
            this.saveAllMetrics();
          }));
        };

        // Ascolta i commit su tutti i repository già aperti
        gitApi.repositories.forEach(setupRepositoryListener);

        // Ascolta l'apertura di nuovi repository in futuro
        this.context.subscriptions.push(gitApi.onDidOpenRepository(setupRepositoryListener));
        
      } else {
        console.error('Impossibile ottenere l\'API Git.');
      }
    } catch (err) {
      console.error('Errore durante l\'inizializzazione del listener Git:', err);
    }
  }

  private handleDebug(active: boolean) {
    this.lastDebug = active;
    if (active) {
      this.switchCategory('debugging');
    } else {
      this.switchCategory(this.lastFocus ? 'thinking' : 'rest');
    }
  }

  private switchCategory(category: TimeCategory) {
    if (this.currentCategory === category) return;
    const now = Date.now();
    if (this.currentCategory && this.currentStart) {
      this.saveEntry({
        start: this.currentStart,
        end: now,
        category: this.currentCategory,
        workspace: this.lastWorkspace,
        language: this.lastLanguage,
      });
      // Metrics are saved in a separate function call
      this.saveAllMetrics();
    }
    this.currentCategory = category;
    this.currentStart = now;
  }

  /**
   * Saves all in-memory metrics to the global state.
   */
  private saveAllMetrics() {
    // Only save the non-time-based metrics here for efficiency
    this.context.globalState.update('codeCommits', this.commits);
    this.context.globalState.update('codeComments', this.commentLines.size);
  }

  private saveEntry(entry: TimeEntry) {
    const data = this.context.globalState.get<TimeEntry[]>('codeTimeData', []);
    data.push(entry);
    this.context.globalState.update('codeTimeData', data);
  }

  private saveError(error: ErrorEntry) {
    const data = this.context.globalState.get<ErrorEntry[]>('codeErrors', []);
    data.push(error);
    this.context.globalState.update('codeErrors', data);
  }

  public getEntries(): TimeEntry[] {
    return this.context.globalState.get<TimeEntry[]>('codeTimeData', []);
  }

  public getErrors(): ErrorEntry[] {
    return this.context.globalState.get<ErrorEntry[]>('codeErrors', []);
  }

  public getCommits(): number {
    // Fetch from the in-memory property for better performance
    return this.commits;
  }

  public getComments(): number {
    // Fetch from the in-memory property for better performance
    return this.context.globalState.get<number>('codeComments', 0);
  }
}
