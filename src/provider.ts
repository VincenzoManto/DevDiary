import * as vscode from 'vscode';
import { getDashboardHtml } from './extension';
import { CodeTimeTracker } from './tracker';

export class DevDiaryDashboardViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'devDiaryDashboard';

  private _view?: vscode.WebviewView;

  constructor(private readonly _context: vscode.ExtensionContext) {
  }

  public resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext, token: vscode.CancellationToken) {
    this._view = webviewView;

    webviewView.webview.options = {
      // Abilita gli script nel webview
      enableScripts: true,

      // Mantieni l'accesso ai file locali
      localResourceRoots: [this._context.extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const tracker = new CodeTimeTracker(this._context);

    const entries = tracker!.getEntries();
    const errors = tracker!.getErrors();
    const commits = tracker!.getCommits();
    const comments = tracker!.getComments();
    const lines = tracker!.getLines();
    const files = tracker!.getFiles();
    // Restituisci il contenuto HTML
    return getDashboardHtml(this._context, webview, entries, errors, lines, files, commits, comments);
  }
}
