/**
 * SF Commit Studio — Shared Types
 *
 * Defines the message protocol between the Webview and the Extension Host,
 * as well as core data types used across the extension.
 */

// ─── Core Data Types ───────────────────────────────────────────────

/** The primary data structure used throughout the extension. */
export interface MetadataChange {
    componentName: string;
    date: string;
    id: string;
    modifiedBy: string;
    type: string;
}

// ─── Webview → Extension Host Messages ─────────────────────────────

export interface FetchMetadataMessage {
    command: 'fetchMetadata';
    payload: {
        targetOrg?: string;
        types?: string[];
    };
    requestId: string;
}

export interface GetOrgListMessage {
    command: 'getOrgList';
    payload?: Record<string, never>;
    requestId: string;
}

export interface CommitChangesMessage {
    command: 'commitChanges';
    payload: {
        selectedIds: string[];
        message: string;
        userStoryRef?: string;
        targetOrg?: string;
    };
    requestId: string;
}

export interface ConfirmLargeCommitMessage {
    command: 'confirmLargeCommit';
    payload: {
        itemCount: number;
        selectedIds: string[];
        message: string;
        userStoryRef?: string;
        targetOrg?: string;
    };
    requestId: string;
}

export type WebviewMessage =
    | FetchMetadataMessage
    | GetOrgListMessage
    | CommitChangesMessage
    | ConfirmLargeCommitMessage;

// ─── Extension Host → Webview Messages ─────────────────────────────

export interface MetadataLoadedMessage {
    command: 'metadataLoaded';
    payload: MetadataChange[];
    requestId?: string;
}

export interface OrgListMessage {
    command: 'orgList';
    payload: {
        orgs: OrgInfo[];
    };
    requestId?: string;
}

export interface CommitResultMessage {
    command: 'commitResult';
    payload: {
        success: boolean;
        commit?: string;
        filesCommitted?: number;
        branch?: string;
    };
    requestId?: string;
}

export interface ProgressMessage {
    command: 'progress';
    payload: {
        step: string;
        detail?: string;
    };
}

export interface ErrorMessage {
    command: 'error';
    payload: {
        message: string;
        detail?: string;
    };
    requestId?: string;
}

export interface ConfirmationRequestMessage {
    command: 'confirmationRequest';
    payload: {
        message: string;
        confirmCommand: string;
        confirmPayload: unknown;
    };
    requestId?: string;
}

export type HostMessage =
    | MetadataLoadedMessage
    | OrgListMessage
    | CommitResultMessage
    | ProgressMessage
    | ErrorMessage
    | ConfirmationRequestMessage;

// ─── Supporting Types ──────────────────────────────────────────────

export interface OrgInfo {
    alias: string;
    username: string;
}

/** Result from the RetrieveService. */
export interface RetrieveResult {
    errors: string[];
    retrievedItems: string[];
    success: boolean;
}

/** Result from the GitService. */
export interface CommitResult {
    branch: string;
    commit: string;
    filesCommitted: number;
    success: boolean;
}
