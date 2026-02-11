import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
// Deep imports for registry package
import { OrgService } from '@evan-hyer/track-changes/dist/services/org-service.js';
import { QueryService } from '@evan-hyer/track-changes/dist/services/query-service.js';
import { RetrieveService } from '@evan-hyer/track-changes/dist/services/retrieve-service.js';
import { GitService } from '@evan-hyer/track-changes/dist/services/git-service.js';

import { execFile } from 'child_process';
import { promisify } from 'util';

import type {
    WebviewMessage,
    MetadataChange,
    OrgInfo,
} from '../types.js';

const execFileAsync = promisify(execFile);

/**
 * Orchestrates communication between the Webview panel and the
 * `@evan-hyer/track-changes` backend services.
 *
 * Acts as the controller layer — receives typed messages from the Webview,
 * delegates to services, and sends typed responses back.
 */
export class ExtensionHostService {
    private _orgService: OrgService;
    private _cachedMetadata: MetadataChange[] = [];

    constructor() {
        this._orgService = new OrgService();
    }

    // ─── Message Router ────────────────────────────────────────────

    /**
     * Main message dispatcher. Routes incoming Webview messages to
     * the appropriate handler based on `message.command`.
     */
    public async handleMessage(message: WebviewMessage, webview: vscode.Webview): Promise<void> {
        switch (message.command) {
            case 'fetchMetadata':
                await this._handleFetchMetadata(message.payload, message.requestId, webview);
                break;
            case 'getOrgList':
                await this._handleGetOrgList(message.requestId, webview);
                break;
            case 'commitChanges':
                await this._handleCommitChanges(message.payload, message.requestId, webview);
                break;
            case 'confirmLargeCommit':
                await this._handleConfirmLargeCommit(message.payload, message.requestId, webview);
                break;
        }
    }

    // ─── Fetch Metadata ────────────────────────────────────────────

    private async _handleFetchMetadata(
        payload: { targetOrg?: string; types?: string[] },
        requestId: string,
        webview: vscode.Webview
    ): Promise<void> {
        try {
            const org = await this._orgService.getOrg(payload.targetOrg);
            const connection = org.getConnection();

            const queryService = new QueryService(connection);
            const changes: MetadataChange[] = await queryService.queryChanges({
                limit: 2000,
                types: payload.types,
            });

            this._cachedMetadata = changes;

            webview.postMessage({
                command: 'metadataLoaded',
                payload: changes,
                requestId,
            });
        } catch (error: unknown) {
            this._sendError(webview, requestId, error, 'Failed to fetch metadata');
        }
    }

    // ─── Org List ──────────────────────────────────────────────────

    private async _handleGetOrgList(
        requestId: string,
        webview: vscode.Webview
    ): Promise<void> {
        try {
            // Use execFile (no shell) to avoid command-injection risk
            const { stdout } = await execFileAsync('sf', ['org', 'list', '--json']);
            const result = JSON.parse(stdout);

            const orgs: OrgInfo[] = [
                ...(result.result?.nonScratchOrgs ?? []),
                ...(result.result?.scratchOrgs ?? []),
            ].map((o: { alias?: string; username: string }) => ({
                alias: o.alias ?? '',
                username: o.username,
            }));

            webview.postMessage({
                command: 'orgList',
                payload: { orgs },
                requestId,
            });
        } catch (error: unknown) {
            this._sendError(
                webview,
                requestId,
                error,
                'Failed to list orgs. Ensure SF CLI is installed and in your PATH.'
            );
        }
    }

    // ─── Commit Flow ───────────────────────────────────────────────

    private async _handleCommitChanges(
        payload: {
            selectedIds: string[];
            message: string;
            userStoryRef?: string;
            targetOrg?: string;
        },
        requestId: string,
        webview: vscode.Webview
    ): Promise<void> {
        try {
            const workspaceRoot = this._getWorkspaceRoot();
            this._requireSfdxProject(workspaceRoot);

            const selectedItems = this._resolveSelectedItems(payload.selectedIds);
            const retrieveService = new RetrieveService();
            const gitService = new GitService(workspaceRoot);

            // Step 1 — Retrieve
            this._sendProgress(webview, 'Retrieving metadata...', `${selectedItems.length} items`);
            const retrieveResult = await this._retrieveMetadata(
                retrieveService,
                selectedItems,
                payload.targetOrg
            );

            // Step 2 — Stage only the retrieved files (not the whole working tree)
            this._sendProgress(webview, 'Staging files...', `${retrieveResult.retrievedItems.length} files`);
            await gitService.add(retrieveResult.retrievedItems);

            // Step 3 — Commit
            this._sendProgress(webview, 'Committing...');
            const commitMessage = this._buildCommitMessage(payload.message, payload.userStoryRef);
            const commitResult = await gitService.commit(commitMessage);

            webview.postMessage({
                command: 'commitResult',
                payload: {
                    success: commitResult.success,
                    commit: commitResult.commit,
                    filesCommitted: commitResult.filesCommitted,
                    branch: commitResult.branch,
                },
                requestId,
            });
        } catch (error: unknown) {
            this._sendError(webview, requestId, error, 'Commit failed');
        }
    }

    /**
     * Handles the confirmation-then-commit flow for large selections.
     * The Webview sends this instead of `commitChanges` when itemCount > 50.
     * The Extension Host shows a native VS Code confirmation dialog.
     */
    private async _handleConfirmLargeCommit(
        payload: {
            itemCount: number;
            selectedIds: string[];
            message: string;
            userStoryRef?: string;
            targetOrg?: string;
        },
        requestId: string,
        webview: vscode.Webview
    ): Promise<void> {
        const answer = await vscode.window.showWarningMessage(
            `You are about to retrieve and commit ${payload.itemCount} items. Continue?`,
            { modal: true },
            'Yes'
        );

        if (answer === 'Yes') {
            await this._handleCommitChanges(
                {
                    selectedIds: payload.selectedIds,
                    message: payload.message,
                    userStoryRef: payload.userStoryRef,
                    targetOrg: payload.targetOrg,
                },
                requestId,
                webview
            );
        }
        // If the user cancelled, do nothing — the Webview re-enables everything
        // because it listens for a commitResult or error.
        // We should notify the Webview so it can re-enable the button.
        else {
            webview.postMessage({
                command: 'commitResult',
                payload: { success: false },
                requestId,
            });
        }
    }

    // ─── Private Helpers ───────────────────────────────────────────

    /**
     * Returns the workspace root path, or throws if none is open.
     */
    private _getWorkspaceRoot(): string {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) {
            throw new Error('No workspace folder is open. Please open a Salesforce project.');
        }
        return root;
    }

    /**
     * Validates that the workspace contains a `sfdx-project.json`.
     * The `sf project retrieve start` command requires this file.
     */
    private _requireSfdxProject(workspaceRoot: string): void {
        const projectFile = path.join(workspaceRoot, 'sfdx-project.json');
        if (!fs.existsSync(projectFile)) {
            throw new Error(
                'This workspace is not a Salesforce project. ' +
                'Open a folder containing an sfdx-project.json file.'
            );
        }
    }

    /**
     * Maps selected IDs back to MetadataChange objects from the cache.
     * Uses a Set for O(1) lookups instead of Array.includes O(n).
     */
    private _resolveSelectedItems(selectedIds: string[]): MetadataChange[] {
        const idSet = new Set(selectedIds);
        const items = this._cachedMetadata.filter(item => idSet.has(item.id));

        if (items.length === 0) {
            throw new Error(
                'No items found matching your selection. ' +
                'The metadata may have been refreshed — please re-select and try again.'
            );
        }

        return items;
    }

    /**
     * Retrieves metadata from Salesforce using the RetrieveService.
     * Throws if no items were successfully retrieved.
     */
    private async _retrieveMetadata(
        retrieveService: RetrieveService,
        items: MetadataChange[],
        targetOrg?: string
    ) {
        const metadataArgs = items.map(item =>
            retrieveService.formatMetadata(item.type, item.componentName)
        );
        const uniqueMetadata = [...new Set(metadataArgs)];

        const result = await retrieveService.retrieve(uniqueMetadata, targetOrg);

        if (!result.success && result.retrievedItems.length === 0) {
            throw new Error(`Retrieve failed: ${result.errors.join(', ')}`);
        }

        return result;
    }

    /**
     * Constructs the final Git commit message, optionally prepending
     * a User Story reference: `[US-0000275] message`.
     */
    private _buildCommitMessage(commitMsg: string, userStoryRef?: string): string {
        if (userStoryRef?.trim()) {
            return `[${userStoryRef.trim()}] ${commitMsg}`;
        }
        return commitMsg;
    }

    /**
     * Sends a progress update to the Webview.
     */
    private _sendProgress(webview: vscode.Webview, step: string, detail?: string): void {
        webview.postMessage({
            command: 'progress',
            payload: { step, detail },
        });
    }

    /**
     * Sends a structured error message to the Webview.
     */
    private _sendError(
        webview: vscode.Webview,
        requestId: string,
        error: unknown,
        fallbackMessage: string
    ): void {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        console.error(`[SF Commit Studio] ${fallbackMessage}:`, errorObj);

        webview.postMessage({
            command: 'error',
            payload: {
                message: errorObj.message || fallbackMessage,
                detail: errorObj.stack,
            },
            requestId,
        });
    }
}
