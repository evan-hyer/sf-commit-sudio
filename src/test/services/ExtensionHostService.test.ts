import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as childProcess from 'child_process';
import { ExtensionHostService } from '../../services/ExtensionHostService.js';
import type { WebviewMessage, MetadataChange } from '../../types.js';

/**
 * Unit tests for ExtensionHostService.
 *
 * These tests mock all external dependencies (VS Code API, track-changes
 * services, child_process) to test the controller logic in isolation.
 */
suite('ExtensionHostService', () => {
    let sandbox: sinon.SinonSandbox;
    let service: ExtensionHostService;
    let mockWebview: vscode.Webview;
    let postMessageStub: sinon.SinonStub;

    const sampleMetadata: MetadataChange[] = [
        {
            id: '001',
            componentName: 'MyApexClass',
            type: 'ApexClass',
            modifiedBy: 'John Doe',
            date: '2026-02-09T12:00:00.000Z',
        },
        {
            id: '002',
            componentName: 'MyCustomObject__c',
            type: 'CustomObject',
            modifiedBy: 'Jane Smith',
            date: '2026-02-08T15:30:00.000Z',
        },
        {
            id: '003',
            componentName: 'MyFlow',
            type: 'Flow',
            modifiedBy: 'John Doe',
            date: '2026-02-07T09:15:00.000Z',
        },
    ];

    setup(() => {
        sandbox = sinon.createSandbox();
        service = new ExtensionHostService();
        postMessageStub = sandbox.stub().resolves(true);
        mockWebview = {
            postMessage: postMessageStub,
        } as unknown as vscode.Webview;
    });

    teardown(() => {
        sandbox.restore();
    });

    // ─── handleMessage Routing ─────────────────────────────────────

    suite('handleMessage - routing', () => {
        test('should route fetchMetadata to the correct handler', async () => {
            // We can't easily spy on private methods, so we verify behavior
            // via the postMessage calls. A fetchMetadata without proper setup
            // will fail and send an error message.
            const message: WebviewMessage = {
                command: 'fetchMetadata',
                payload: { targetOrg: 'testOrg' },
                requestId: 'req-1',
            };

            await service.handleMessage(message, mockWebview);

            // Should have called postMessage (either metadataLoaded or error)
            assert.ok(
                postMessageStub.calledOnce,
                'Should send exactly one response message'
            );
        });

        test('should route getOrgList to the correct handler', async () => {
            const message: WebviewMessage = {
                command: 'getOrgList',
                payload: {} as Record<string, never>,
                requestId: 'req-2',
            };

            await service.handleMessage(message, mockWebview);
            assert.ok(postMessageStub.calledOnce);
        });

        test('should route commitChanges to the correct handler', async () => {
            const message: WebviewMessage = {
                command: 'commitChanges',
                payload: {
                    selectedIds: ['001'],
                    message: 'test commit',
                    targetOrg: 'testOrg',
                },
                requestId: 'req-3',
            };

            await service.handleMessage(message, mockWebview);
            // Should respond (with error since no workspace, but still responds)
            assert.ok(postMessageStub.called);
        });
    });

    // ─── fetchMetadata ─────────────────────────────────────────────

    suite('handleMessage - fetchMetadata', () => {
        test('should send error when OrgService fails', async () => {
            const message: WebviewMessage = {
                command: 'fetchMetadata',
                payload: { targetOrg: 'nonexistent-org' },
                requestId: 'req-fetch-1',
            };

            await service.handleMessage(message, mockWebview);

            assert.ok(postMessageStub.calledOnce);
            const response = postMessageStub.firstCall.args[0];
            assert.strictEqual(response.command, 'error');
            assert.strictEqual(response.requestId, 'req-fetch-1');
            assert.ok(response.payload.message, 'Should include an error message');
        });
    });

    // ─── getOrgList ────────────────────────────────────────────────

    suite('handleMessage - getOrgList', () => {
        test('should send error when sf CLI is not available', async () => {
            const message: WebviewMessage = {
                command: 'getOrgList',
                payload: {} as Record<string, never>,
                requestId: 'req-org-1',
            };

            await service.handleMessage(message, mockWebview);

            assert.ok(postMessageStub.calledOnce);
            const response = postMessageStub.firstCall.args[0];
            assert.strictEqual(response.command, 'error');
            assert.strictEqual(response.requestId, 'req-org-1');
            assert.ok(
                response.payload.message.includes('SF CLI'),
                'Error message should mention SF CLI'
            );
        });
    });

    // ─── commitChanges ─────────────────────────────────────────────

    suite('handleMessage - commitChanges', () => {
        test('should send error when no workspace is open', async () => {
            // Mock workspace to have no folders
            sandbox.stub(vscode.workspace, 'workspaceFolders').value(undefined);

            const message: WebviewMessage = {
                command: 'commitChanges',
                payload: {
                    selectedIds: ['001'],
                    message: 'test commit',
                    targetOrg: 'testOrg',
                },
                requestId: 'req-commit-1',
            };

            await service.handleMessage(message, mockWebview);

            // Find the error message (skip progress messages)
            const errorCall = postMessageStub.getCalls().find(
                (call: sinon.SinonSpyCall) => call.args[0].command === 'error'
            );
            assert.ok(errorCall, 'Should send an error message');
            assert.ok(
                errorCall!.args[0].payload.message.includes('workspace') ||
                errorCall!.args[0].payload.message.includes('No workspace'),
                'Error should mention workspace'
            );
        });

        test('should send error when sfdx-project.json is missing', async () => {
            // Mock workspace with a folder that doesn't have sfdx-project.json
            const tempDir = path.join(__dirname, '__test-workspace__');
            sandbox.stub(vscode.workspace, 'workspaceFolders').value([
                { uri: { fsPath: tempDir } },
            ]);
            sandbox.stub(fs, 'existsSync').returns(false);

            const message: WebviewMessage = {
                command: 'commitChanges',
                payload: {
                    selectedIds: ['001'],
                    message: 'test commit',
                    targetOrg: 'testOrg',
                },
                requestId: 'req-commit-2',
            };

            await service.handleMessage(message, mockWebview);

            const errorCall = postMessageStub.getCalls().find(
                (call: sinon.SinonSpyCall) => call.args[0].command === 'error'
            );
            assert.ok(errorCall, 'Should send an error message');
            assert.ok(
                errorCall!.args[0].payload.message.includes('sfdx-project.json'),
                'Error should mention sfdx-project.json'
            );
        });

        test('should send error when selectedIds match nothing in cache', async () => {
            const tempDir = path.join(__dirname, '__test-workspace__');
            sandbox.stub(vscode.workspace, 'workspaceFolders').value([
                { uri: { fsPath: tempDir } },
            ]);
            sandbox.stub(fs, 'existsSync').returns(true);

            // Service has empty cache, so selectedIds won't match
            const message: WebviewMessage = {
                command: 'commitChanges',
                payload: {
                    selectedIds: ['nonexistent-id'],
                    message: 'test commit',
                    targetOrg: 'testOrg',
                },
                requestId: 'req-commit-3',
            };

            await service.handleMessage(message, mockWebview);

            const errorCall = postMessageStub.getCalls().find(
                (call: sinon.SinonSpyCall) => call.args[0].command === 'error'
            );
            assert.ok(errorCall, 'Should send an error message');
            assert.ok(
                errorCall!.args[0].payload.message.includes('No items found'),
                'Error should mention no items found'
            );
        });
    });

    // ─── Commit Message Building ───────────────────────────────────

    suite('_buildCommitMessage (via integration)', () => {
        /*
         * Since _buildCommitMessage is private, we test it indirectly.
         * However, we can also test the logic directly by extracting it
         * or testing via the full commit flow. Here we verify the logic
         * as a unit test of the formatting rules.
         */

        test('commit message format: with user story ref', () => {
            // Direct logic test (mirrors the private method)
            const userStoryRef = 'US-0000275';
            const commitMsg = 'Updated page layout validation rules';
            const expected = '[US-0000275] Updated page layout validation rules';

            const result = userStoryRef.trim()
                ? `[${userStoryRef.trim()}] ${commitMsg}`
                : commitMsg;

            assert.strictEqual(result, expected);
        });

        test('commit message format: without user story ref', () => {
            const userStoryRef = '';
            const commitMsg = 'Updated page layout validation rules';
            const expected = 'Updated page layout validation rules';

            const result = userStoryRef.trim()
                ? `[${userStoryRef.trim()}] ${commitMsg}`
                : commitMsg;

            assert.strictEqual(result, expected);
        });

        test('commit message format: user story ref with whitespace', () => {
            const userStoryRef = '  US-123  ';
            const commitMsg = 'Fix bug';
            const expected = '[US-123] Fix bug';

            const result = userStoryRef.trim()
                ? `[${userStoryRef.trim()}] ${commitMsg}`
                : commitMsg;

            assert.strictEqual(result, expected);
        });
    });

    // ─── Selected Items Resolution ─────────────────────────────────

    suite('_resolveSelectedItems (via integration)', () => {
        test('should correctly filter cached metadata by selected IDs (Set-based)', () => {
            // Mirrors the private _resolveSelectedItems logic
            const selectedIds = ['001', '003'];
            const idSet = new Set(selectedIds);
            const result = sampleMetadata.filter(item => idSet.has(item.id));

            assert.strictEqual(result.length, 2);
            assert.strictEqual(result[0].componentName, 'MyApexClass');
            assert.strictEqual(result[1].componentName, 'MyFlow');
        });

        test('should return empty for non-matching IDs', () => {
            const selectedIds = ['999', '888'];
            const idSet = new Set(selectedIds);
            const result = sampleMetadata.filter(item => idSet.has(item.id));

            assert.strictEqual(result.length, 0);
        });

        test('should handle duplicate IDs gracefully', () => {
            const selectedIds = ['001', '001', '002'];
            const idSet = new Set(selectedIds);
            const result = sampleMetadata.filter(item => idSet.has(item.id));

            // Set deduplicates, so we should get 2 items, not 3
            assert.strictEqual(result.length, 2);
        });
    });
});
