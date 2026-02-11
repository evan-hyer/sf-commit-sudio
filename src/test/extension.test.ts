import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { activate, deactivate } from '../extension.js';

/**
 * Unit tests for extension activation/deactivation.
 */
suite('Extension Activation', () => {
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();
    });

    teardown(() => {
        sandbox.restore();
    });

    test('should register the sfCommitStudio.open command', () => {
        const registerStub = sandbox.stub(vscode.commands, 'registerCommand').returns({
            dispose: () => { },
        });

        const mockContext = {
            subscriptions: [] as vscode.Disposable[],
            extensionUri: vscode.Uri.file('/test'),
        } as unknown as vscode.ExtensionContext;

        activate(mockContext);

        assert.ok(
            registerStub.calledOnce,
            'Should register exactly one command'
        );
        assert.strictEqual(
            registerStub.firstCall.args[0],
            'sfCommitStudio.open',
            'Should register the sfCommitStudio.open command'
        );
    });

    test('should push disposable to context.subscriptions', () => {
        sandbox.stub(vscode.commands, 'registerCommand').returns({
            dispose: () => { },
        });

        const mockContext = {
            subscriptions: [] as vscode.Disposable[],
            extensionUri: vscode.Uri.file('/test'),
        } as unknown as vscode.ExtensionContext;

        activate(mockContext);

        assert.strictEqual(
            mockContext.subscriptions.length,
            1,
            'Should add one disposable to subscriptions'
        );
    });

    test('deactivate should be a no-op function', () => {
        // Just verify it doesn't throw
        assert.doesNotThrow(() => deactivate());
    });
});
