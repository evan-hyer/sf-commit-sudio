import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { CommitStudioPanel } from '../../panels/CommitStudioPanel.js';

/**
 * Unit tests for CommitStudioPanel.
 *
 * Tests the singleton lifecycle, panel creation, and disposal behavior.
 * The HTML content generation is tested for correct structure and CSP.
 */
suite('CommitStudioPanel', () => {
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();
        // Reset the singleton state between tests
        CommitStudioPanel.currentPanel = undefined;
    });

    teardown(() => {
        sandbox.restore();
        CommitStudioPanel.currentPanel = undefined;
    });

    // ─── Singleton Behavior ────────────────────────────────────────

    suite('createOrShow - singleton pattern', () => {
        test('should create a new panel when none exists', () => {
            const mockPanel = createMockPanel(sandbox);
            sandbox.stub(vscode.window, 'createWebviewPanel').returns(mockPanel);

            const extensionUri = vscode.Uri.file('/test/extension');
            CommitStudioPanel.createOrShow(extensionUri);

            assert.ok(
                CommitStudioPanel.currentPanel !== undefined,
                'currentPanel should be set after createOrShow'
            );
        });

        test('should reveal existing panel instead of creating a new one', () => {
            const mockPanel = createMockPanel(sandbox);
            const createStub = sandbox
                .stub(vscode.window, 'createWebviewPanel')
                .returns(mockPanel);

            const extensionUri = vscode.Uri.file('/test/extension');

            // First call creates
            CommitStudioPanel.createOrShow(extensionUri);
            assert.strictEqual(createStub.callCount, 1, 'Should create panel on first call');

            // Second call reveals
            CommitStudioPanel.createOrShow(extensionUri);
            assert.strictEqual(
                createStub.callCount,
                1,
                'Should NOT create a second panel'
            );
            assert.ok(
                mockPanel.reveal.called,
                'Should reveal the existing panel'
            );
        });
    });

    // ─── Disposal ──────────────────────────────────────────────────

    suite('dispose', () => {
        test('should clear currentPanel on dispose', () => {
            const mockPanel = createMockPanel(sandbox);
            sandbox.stub(vscode.window, 'createWebviewPanel').returns(mockPanel);

            const extensionUri = vscode.Uri.file('/test/extension');
            CommitStudioPanel.createOrShow(extensionUri);

            assert.ok(CommitStudioPanel.currentPanel !== undefined);

            // Trigger disposal
            CommitStudioPanel.currentPanel!.dispose();

            assert.strictEqual(
                CommitStudioPanel.currentPanel,
                undefined,
                'currentPanel should be undefined after dispose'
            );
        });

        test('should dispose the underlying panel', () => {
            const mockPanel = createMockPanel(sandbox);
            sandbox.stub(vscode.window, 'createWebviewPanel').returns(mockPanel);

            const extensionUri = vscode.Uri.file('/test/extension');
            CommitStudioPanel.createOrShow(extensionUri);
            CommitStudioPanel.currentPanel!.dispose();

            assert.ok(
                mockPanel.dispose.called,
                'Should dispose the underlying WebviewPanel'
            );
        });
    });

    // ─── Webview Options ───────────────────────────────────────────

    suite('webview configuration', () => {
        test('should enable scripts in webview', () => {
            const mockPanel = createMockPanel(sandbox);
            const createStub = sandbox
                .stub(vscode.window, 'createWebviewPanel')
                .returns(mockPanel);

            const extensionUri = vscode.Uri.file('/test/extension');
            CommitStudioPanel.createOrShow(extensionUri);

            const options = createStub.firstCall.args[3] as vscode.WebviewOptions & vscode.WebviewPanelOptions;
            assert.strictEqual(
                options.enableScripts,
                true,
                'Should enable scripts in webview'
            );
        });

        test('should set retainContextWhenHidden', () => {
            const mockPanel = createMockPanel(sandbox);
            const createStub = sandbox
                .stub(vscode.window, 'createWebviewPanel')
                .returns(mockPanel);

            const extensionUri = vscode.Uri.file('/test/extension');
            CommitStudioPanel.createOrShow(extensionUri);

            const options = createStub.firstCall.args[3] as vscode.WebviewOptions & vscode.WebviewPanelOptions;
            assert.strictEqual(
                options.retainContextWhenHidden,
                true,
                'Should retain context when hidden to prevent data loss'
            );
        });

        test('should restrict localResourceRoots to media directory', () => {
            const mockPanel = createMockPanel(sandbox);
            const createStub = sandbox
                .stub(vscode.window, 'createWebviewPanel')
                .returns(mockPanel);

            const extensionUri = vscode.Uri.file('/test/extension');
            CommitStudioPanel.createOrShow(extensionUri);

            const options = createStub.firstCall.args[3] as vscode.WebviewOptions & vscode.WebviewPanelOptions;
            assert.ok(
                options.localResourceRoots,
                'Should specify localResourceRoots'
            );
            assert.strictEqual(
                options.localResourceRoots!.length,
                1,
                'Should have exactly one resource root'
            );
        });
    });

    // ─── HTML Content ──────────────────────────────────────────────

    suite('webview HTML content', () => {
        test('should set HTML content on creation', () => {
            const mockPanel = createMockPanel(sandbox);
            sandbox.stub(vscode.window, 'createWebviewPanel').returns(mockPanel);

            const extensionUri = vscode.Uri.file('/test/extension');
            CommitStudioPanel.createOrShow(extensionUri);

            const html = mockPanel.webview.html;
            assert.ok(html.length > 0, 'HTML content should not be empty');
        });

        test('HTML should contain Content-Security-Policy meta tag', () => {
            const mockPanel = createMockPanel(sandbox);
            sandbox.stub(vscode.window, 'createWebviewPanel').returns(mockPanel);

            const extensionUri = vscode.Uri.file('/test/extension');
            CommitStudioPanel.createOrShow(extensionUri);

            const html = mockPanel.webview.html;
            assert.ok(
                html.includes('Content-Security-Policy'),
                'HTML should contain a CSP meta tag'
            );
        });

        test('HTML should contain nonce-based script tag', () => {
            const mockPanel = createMockPanel(sandbox);
            sandbox.stub(vscode.window, 'createWebviewPanel').returns(mockPanel);

            const extensionUri = vscode.Uri.file('/test/extension');
            CommitStudioPanel.createOrShow(extensionUri);

            const html = mockPanel.webview.html;
            assert.ok(
                html.includes('nonce='),
                'Script tag should use a nonce for CSP'
            );
        });

        test('HTML should not contain inline styles', () => {
            const mockPanel = createMockPanel(sandbox);
            sandbox.stub(vscode.window, 'createWebviewPanel').returns(mockPanel);

            const extensionUri = vscode.Uri.file('/test/extension');
            CommitStudioPanel.createOrShow(extensionUri);

            const html = mockPanel.webview.html;
            // Check that no style= attributes exist in the HTML
            // (CSP 'unsafe-inline' is for VS Code theme vars, not our own inline styles)
            const styleAttrMatches = html.match(/style\s*=/gi);
            assert.strictEqual(
                styleAttrMatches,
                null,
                'HTML should not contain inline style= attributes'
            );
        });

        test('HTML should contain required interactive elements', () => {
            const mockPanel = createMockPanel(sandbox);
            sandbox.stub(vscode.window, 'createWebviewPanel').returns(mockPanel);

            const extensionUri = vscode.Uri.file('/test/extension');
            CommitStudioPanel.createOrShow(extensionUri);

            const html = mockPanel.webview.html;
            const requiredIds = [
                'org-selector',
                'commit-message',
                'user-story-ref',
                'btn-commit',
                'btn-refresh',
                'tab-all',
                'tab-selected',
                'grid-body',
                'select-all',
                'loading-overlay',
                'error-banner',
                'success-banner',
                'filter-name',
                'filter-type',
                'filter-user',
                'page-size',
                'btn-prev',
                'btn-next',
            ];

            for (const id of requiredIds) {
                assert.ok(
                    html.includes(`id="${id}"`),
                    `HTML should contain element with id="${id}"`
                );
            }
        });

        test('HTML should contain ARIA labels for accessibility', () => {
            const mockPanel = createMockPanel(sandbox);
            sandbox.stub(vscode.window, 'createWebviewPanel').returns(mockPanel);

            const extensionUri = vscode.Uri.file('/test/extension');
            CommitStudioPanel.createOrShow(extensionUri);

            const html = mockPanel.webview.html;
            assert.ok(
                html.includes('aria-label='),
                'HTML should contain aria-label attributes'
            );
            assert.ok(
                html.includes('role="grid"'),
                'Data table should have role="grid"'
            );
        });
    });

    // ─── Message Handling ──────────────────────────────────────────

    suite('message handling', () => {
        test('should register onDidReceiveMessage handler', () => {
            const mockPanel = createMockPanel(sandbox);
            sandbox.stub(vscode.window, 'createWebviewPanel').returns(mockPanel);

            const extensionUri = vscode.Uri.file('/test/extension');
            CommitStudioPanel.createOrShow(extensionUri);

            assert.ok(
                mockPanel.webview.onDidReceiveMessage.called,
                'Should register a message handler on the webview'
            );
        });
    });
});

// ─── Test Helpers ──────────────────────────────────────────────────

/**
 * Creates a mock WebviewPanel with all required methods stubbed.
 */
function createMockPanel(sandbox: sinon.SinonSandbox): vscode.WebviewPanel & {
    webview: vscode.Webview & {
        html: string;
        onDidReceiveMessage: sinon.SinonStub;
    };
    reveal: sinon.SinonStub;
    dispose: sinon.SinonStub;
} {
    let capturedHtml = '';
    const disposables: vscode.Disposable[] = [];

    const webview = {
        html: '',
        postMessage: sandbox.stub().resolves(true),
        onDidReceiveMessage: sandbox.stub().returns({ dispose: () => { } }),
        asWebviewUri: sandbox.stub().callsFake((uri: vscode.Uri) => uri),
        cspSource: 'https://mock.csp.source',
        options: {},
    };

    // Capture HTML when set
    Object.defineProperty(webview, 'html', {
        get: () => capturedHtml,
        set: (value: string) => { capturedHtml = value; },
        configurable: true,
    });

    const panel = {
        webview,
        viewType: 'sfCommitStudio',
        title: 'SF Commit Studio',
        iconPath: undefined,
        options: {},
        viewColumn: vscode.ViewColumn.One,
        active: true,
        visible: true,
        onDidChangeViewState: sandbox.stub().returns({ dispose: () => { } }),
        onDidDispose: sandbox.stub().callsFake((callback: () => void) => {
            disposables.push({ dispose: callback });
            return { dispose: () => { } };
        }),
        reveal: sandbox.stub(),
        dispose: sandbox.stub().callsFake(() => {
            disposables.forEach(d => d.dispose());
        }),
    } as unknown as vscode.WebviewPanel & {
        webview: typeof webview;
        reveal: sinon.SinonStub;
        dispose: sinon.SinonStub;
    };

    return panel;
}
