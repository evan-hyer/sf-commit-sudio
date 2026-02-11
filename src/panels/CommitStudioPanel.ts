import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { ExtensionHostService } from '../services/ExtensionHostService.js';
import type { WebviewMessage } from '../types.js';

/**
 * Manages the lifecycle of the SF Commit Studio Webview panel.
 *
 * Implements a singleton pattern — only one panel can exist at a time.
 * Uses the Disposable pattern to clean up resources when the panel closes.
 */
export class CommitStudioPanel {
    /**
     * The singleton instance of the panel.
     */
    public static currentPanel: CommitStudioPanel | undefined;
    
    /**
     * The unique identifier for the webview view type.
     */
    public static readonly viewType = 'sfCommitStudio';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _service: ExtensionHostService;
    private _disposables: vscode.Disposable[] = [];

    /**
     * Private constructor to enforce the singleton pattern.
     * 
     * @param panel - The underlying WebviewPanel
     * @param extensionUri - The URI of the extension directory
     */
    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._service = new ExtensionHostService();

        // Set the webview's initial HTML content
        this._update();

        // Listen for when the panel is disposed
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from the webview — cast to typed message
        this._panel.webview.onDidReceiveMessage(
            (message: WebviewMessage) => {
                this._service.handleMessage(message, this._panel.webview);
            },
            null,
            this._disposables
        );
    }

    /**
     * Creates a new panel or reveals the existing one.
     * Singleton pattern ensures only one instance at a time.
     * 
     * @param extensionUri - The base URI for the extension
     */
    public static createOrShow(extensionUri: vscode.Uri): void {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it
        if (CommitStudioPanel.currentPanel) {
            CommitStudioPanel.currentPanel._panel.reveal(column);
            return;
        }

        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel(
            CommitStudioPanel.viewType,
            'SF Commit Studio',
            column || vscode.ViewColumn.One,
            CommitStudioPanel._getWebviewOptions(extensionUri),
        );

        CommitStudioPanel.currentPanel = new CommitStudioPanel(panel, extensionUri);
    }

    /**
     * Disposes the panel and all associated resources.
     */
    public dispose(): void {
        CommitStudioPanel.currentPanel = undefined;

        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    /**
     * Updates the webview content.
     */
    private _update(): void {
        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
    }

    /**
     * Returns webview options with scripts enabled, local resource roots
     * restricted to `media/`, and context retained when hidden.
     * 
     * @param extensionUri - The URI of the extension
     * @returns A combination of WebviewOptions and WebviewPanelOptions
     * @private
     */
    private static _getWebviewOptions(
        extensionUri: vscode.Uri
    ): vscode.WebviewOptions & vscode.WebviewPanelOptions {
        return {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
        };
    }

    /**
     * Generates the full HTML document for the Webview, including:
     * - A strict Content Security Policy with a cryptographic nonce
     * - References to the external CSS and JS files in `media/`
     * - The full UI skeleton (header, tabs, grid, status bar)
     * 
     * @param webview - The webview instance to generate HTML for
     * @returns The complete HTML string
     * @private
     */
    private _getHtmlForWebview(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js')
        );
        const stylesUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'main.css')
        );

        // Cryptographically secure nonce for CSP
        const nonce = crypto.randomBytes(16).toString('hex');

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} https: data:; script-src 'nonce-${nonce}';">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${stylesUri}" rel="stylesheet">
                <title>SF Commit Studio</title>
            </head>
            <body>
                <div class="app-container">
                    <!-- [A] HEADER BAR -->
                    <header class="header">
                        <div class="header__row">
                            <div class="header__field">
                                <label for="org-selector">Org</label>
                                <div class="header__org-controls">
                                    <select id="org-selector" aria-label="Select Salesforce Org">
                                        <option value="" disabled selected>Loading orgs...</option>
                                    </select>
                                    <button id="btn-refresh" class="btn-icon" title="Refresh Metadata" aria-label="Refresh">↻</button>
                                </div>
                            </div>
                            <div class="header__field header__field--grow">
                                <label for="user-story-ref">User Story Ref</label>
                                <input id="user-story-ref" type="text" placeholder="US-0000000" aria-label="User Story Reference">
                            </div>
                        </div>
                        <div class="header__row">
                            <div class="header__field header__field--grow">
                                <label for="commit-message">Commit Message</label>
                                <textarea id="commit-message" placeholder="Enter your commit message..." rows="3" aria-label="Commit Message"></textarea>
                            </div>
                            <div class="header__actions">
                                <button id="btn-commit" class="primary" disabled aria-label="Commit Changes">
                                    Commit Changes
                                </button>
                            </div>
                        </div>
                    </header>

                    <!-- [B] TAB BAR -->
                    <nav class="tab-bar" aria-label="View Tabs">
                        <button id="tab-all" class="tab active" aria-selected="true">All Metadata</button>
                        <button id="tab-selected" class="tab" aria-selected="false">Selected Metadata</button>
                    </nav>

                    <!-- [C] DATA GRID -->
                    <main class="grid-container">
                        <div id="loading-overlay" class="loading-overlay hidden">
                            <div class="spinner"></div>
                            <span>Loading metadata...</span>
                        </div>
                        <div id="error-banner" class="error-banner hidden">
                            <span id="error-message">Error message</span>
                            <button id="btn-retry">Retry</button>
                        </div>
                        <div id="success-banner" class="success-banner hidden">
                            <span id="success-message"></span>
                        </div>
                        <table class="grid" role="grid" aria-label="Metadata Changes">
                            <thead>
                                <tr role="row">
                                    <th class="grid__header grid__header--checkbox">
                                        <input type="checkbox" id="select-all" aria-label="Select All">
                                    </th>
                                    <th class="grid__header grid__header--sortable" data-sort="componentName" tabindex="0">
                                        Name <span class="sort-icon"></span>
                                        <input type="text" id="filter-name" class="grid__filter" placeholder="Filter..." onclick="event.stopPropagation()">
                                    </th>
                                    <th class="grid__header grid__header--sortable" data-sort="type" tabindex="0">
                                        Type <span class="sort-icon"></span>
                                        <select id="filter-type" class="grid__filter" onclick="event.stopPropagation()">
                                            <option value="">All Types</option>
                                        </select>
                                    </th>
                                    <th class="grid__header grid__header--sortable" data-sort="modifiedBy" tabindex="0">
                                        Last Modified By <span class="sort-icon"></span>
                                        <input type="text" id="filter-user" class="grid__filter" placeholder="Filter..." onclick="event.stopPropagation()">
                                    </th>
                                    <th class="grid__header grid__header--sortable" data-sort="date" tabindex="0">
                                        Last Modified Date <span class="sort-icon"></span>
                                    </th>
                                    <th class="grid__header">
                                        Created By
                                    </th>
                                </tr>
                            </thead>
                            <tbody id="grid-body">
                                <!-- Rows will be populated by JS -->
                            </tbody>
                        </table>
                    </main>

                    <!-- [D] STATUS BAR -->
                    <footer class="status-bar">
                        <div id="item-count">Showing 0-0 of 0 items</div>
                        <div class="pagination">
                            <select id="page-size" aria-label="Items per page">
                                <option value="25">25</option>
                                <option value="50">50</option>
                                <option value="100">100</option>
                            </select>
                            <button id="btn-prev" disabled aria-label="Previous Page">◄</button>
                            <span id="page-numbers"></span>
                            <button id="btn-next" disabled aria-label="Next Page">►</button>
                        </div>
                    </footer>
                </div>
                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>`;
    }
}