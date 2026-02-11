/**
 * SF Commit Studio — Shared Types
 *
 * Defines the message protocol between the Webview and the Extension Host,
 * as well as core data types used across the extension.
 */

// ─── Core Data Types ───────────────────────────────────────────────

/**
 * Represents a single metadata change in a Salesforce Org.
 */
export interface MetadataChange {
    /** The name of the metadata component (e.g., 'Account' or 'MyClass'). */
    componentName: string;
    /** The ISO 8601 date string of the last modification. */
    date: string;
    /** Unique identifier for the item (usually type:name). */
    id: string;
    /** The Salesforce username of the person who last modified the item. */
    modifiedBy: string;
    /** The Salesforce metadata type (e.g., 'ApexClass', 'CustomObject'). */
    type: string;
}

// ─── Webview → Extension Host Messages ─────────────────────────────

/**
 * Request to fetch metadata changes from a specific Salesforce Org.
 */
export interface FetchMetadataMessage {
    command: 'fetchMetadata';
    payload: {
        /** The alias or username of the target Org. If omitted, uses the default. */
        targetOrg?: string;
        /** Optional list of metadata types to filter by during fetch. */
        types?: string[];
    };
    /** Unique ID to track this specific request/response cycle. */
    requestId: string;
}

/**
 * Request to get the list of available Salesforce Orgs from the environment.
 */
export interface GetOrgListMessage {
    command: 'getOrgList';
    payload?: Record<string, never>;
    /** Unique ID to track this specific request/response cycle. */
    requestId: string;
}

/**
 * Request to commit a set of selected metadata changes.
 */
export interface CommitChangesMessage {
    command: 'commitChanges';
    payload: {
        /** IDs of the metadata items to include in the commit. */
        selectedIds: string[];
        /** The commit message entered by the user. */
        message: string;
        /** Optional reference to a User Story or Ticket (e.g., 'US-123'). */
        userStoryRef?: string;
        /** The alias or username of the source Org. */
        targetOrg?: string;
    };
    /** Unique ID to track this specific request/response cycle. */
    requestId: string;
}

/**
 * Request to show a confirmation dialog for a large number of items.
 */
export interface ConfirmLargeCommitMessage {
    command: 'confirmLargeCommit';
    payload: {
        /** Number of items being committed. */
        itemCount: number;
        /** IDs of the metadata items. */
        selectedIds: string[];
        /** The commit message. */
        message: string;
        /** Optional User Story reference. */
        userStoryRef?: string;
        /** The alias or username of the source Org. */
        targetOrg?: string;
    };
    /** Unique ID to track this specific request/response cycle. */
    requestId: string;
}

/**
 * Union type for all messages sent from the Webview to the Extension Host.
 */
export type WebviewMessage =
    | FetchMetadataMessage
    | GetOrgListMessage
    | CommitChangesMessage
    | ConfirmLargeCommitMessage;

// ─── Extension Host → Webview Messages ─────────────────────────────

/**
 * Notification that metadata has been successfully loaded.
 */
export interface MetadataLoadedMessage {
    command: 'metadataLoaded';
    /** The list of metadata changes retrieved. */
    payload: MetadataChange[];
    /** The original request ID. */
    requestId?: string;
}

/**
 * Response containing the list of available Salesforce Orgs.
 */
export interface OrgListMessage {
    command: 'orgList';
    payload: {
        /** List of discovered Orgs. */
        orgs: OrgInfo[];
    };
    /** The original request ID. */
    requestId?: string;
}

/**
 * Notification of the result of a commit operation.
 */
export interface CommitResultMessage {
    command: 'commitResult';
    payload: {
        /** Whether the commit was successful. */
        success: boolean;
        /** The resulting Git commit hash. */
        commit?: string;
        /** The number of files actually committed. */
        filesCommitted?: number;
        /** The Git branch where the commit was made. */
        branch?: string;
    };
    /** The original request ID. */
    requestId?: string;
}

/**
 * Message used to report progress of a long-running operation.
 */
export interface ProgressMessage {
    command: 'progress';
    payload: {
        /** Short name of the current step. */
        step: string;
        /** Optional detailed description of the current progress. */
        detail?: string;
    };
}

/**
 * Generic error message sent to the Webview.
 */
export interface ErrorMessage {
    command: 'error';
    payload: {
        /** High-level error message for the user. */
        message: string;
        /** Optional technical details (e.g., stack trace or API error). */
        detail?: string;
    };
    /** The original request ID. */
    requestId?: string;
}

/**
 * Request from the host to the Webview to confirm an action (deprecated/rarely used).
 */
export interface ConfirmationRequestMessage {
    command: 'confirmationRequest';
    payload: {
        /** Message to display in the confirmation dialog. */
        message: string;
        /** Command to send back if confirmed. */
        confirmCommand: string;
        /** Payload to include in the confirmation response. */
        confirmPayload: unknown;
    };
    /** Unique ID for the confirmation cycle. */
    requestId?: string;
}

/**
 * Union type for all messages sent from the Extension Host to the Webview.
 */
export type HostMessage =
    | MetadataLoadedMessage
    | OrgListMessage
    | CommitResultMessage
    | ProgressMessage
    | ErrorMessage
    | ConfirmationRequestMessage;

// ─── Supporting Types ──────────────────────────────────────────────

/**
 * Basic information about a Salesforce Org.
 */
export interface OrgInfo {
    /** The alias assigned to the Org (e.g., 'dev-hub'). */
    alias: string;
    /** The Salesforce username for the Org. */
    username: string;
}

/**
 * Result of a metadata retrieve operation from Salesforce.
 */
export interface RetrieveResult {
    /** List of error messages if the retrieve failed or had partial failures. */
    errors: string[];
    /** Paths to the files that were successfully retrieved. */
    retrievedItems: string[];
    /** Overall success flag. */
    success: boolean;
}

/**
 * Result of a Git commit operation.
 */
export interface CommitResult {
    /** The branch where the changes were committed. */
    branch: string;
    /** The Git commit hash. */
    commit: string;
    /** Number of files included in the commit. */
    filesCommitted: number;
    /** Overall success flag. */
    success: boolean;
}