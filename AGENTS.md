# SF Commit Studio — Implementation Plan (AGENTS.md)

> **Purpose**: This is the single source of truth for building the "SF Commit Studio" VS Code Extension. It is a comprehensive plan, **not implementation code**. Follow the phases sequentially.
>
> **Last Updated**: 2026-02-09

---

## Table of Contents

1.  [Project Overview](#1-project-overview)
2.  [Architecture Overview](#2-architecture-overview)
3.  [Backend Library Reference (`track-changes`)](#3-backend-library-reference-track-changes)
4.  [UI/UX Design Specification](#4-uiux-design-specification)
5.  [Data Flow](#5-data-flow)
6.  [Implementation Roadmap](#6-implementation-roadmap)
    *   [Phase 0: Project Scaffolding](#phase-0-project-scaffolding)
    *   [Phase 1: Extension Host & Webview Shell](#phase-1-extension-host--webview-shell)
    *   [Phase 2: Metadata Grid (Read-Only)](#phase-2-metadata-grid-read-only)
    *   [Phase 3: Selection & Filtering](#phase-3-selection--filtering)
    *   [Phase 4: Commit Flow](#phase-4-commit-flow)
    *   [Phase 5: Polish & Error Handling](#phase-5-polish--error-handling)

---

## 1. Project Overview

### What is SF Commit Studio?

A VS Code Extension that provides a GUI "Webview Panel" for Salesforce Admins to:

1.  **Browse** metadata changes detected in a Salesforce org.
2.  **Select** specific metadata components via checkboxes.
3.  **Retrieve** the selected metadata from the org into the local project.
4.  **Commit** the retrieved files to Git with a message and an optional User Story reference.

The goal is a **"Click-Not-Code"** experience that mirrors the familiar **Copado User Story Commit** screen, easing the transition to a Git-native workflow.

### Target User Persona

| Attribute | Detail |
|---|---|
| **Role** | Salesforce Admin / Declarative Developer |
| **Git Experience** | Beginner — relies on GUI tools, not the terminal |
| **Current Tool** | Copado User Story Commit screen |
| **Key Need** | A visual, low-friction way to commit Salesforce config changes to Git |

### Core Constraints

*   **No complex frontend frameworks** (React, Vue, Angular). Use **Plain HTML, CSS, and Vanilla JavaScript** in the Webview.
*   **Security**: All Webview content must be loaded with a strict Content Security Policy (CSP). Use `nonce`-based script loading.
*   The backend logic is provided by the `@evan-hyer/track-changes` npm package (or its local source at `C:\Repos\track-changes`).

---

## 2. Architecture Overview

The extension follows a standard VS Code **Webview** architecture with three distinct layers.

```
┌──────────────────────────────────────────────────────────────────┐
│                       VS Code Window                             │
│                                                                  │
│  ┌─────────────────────┐     postMessage()      ┌─────────────┐ │
│  │                     │  ───────────────────►   │             │ │
│  │   Webview Panel     │                         │  Extension  │ │
│  │   (HTML/CSS/JS)     │  ◄───────────────────   │   Host      │ │
│  │                     │     postMessage()       │  (Node.js)  │ │
│  └─────────────────────┘                         └──────┬──────┘ │
│         ▲  User Interaction                             │        │
│         │  (Clicks, Typing)                             │        │
│                                                         ▼        │
│                                              ┌──────────────────┐│
│                                              │  track-changes   ││
│                                              │  Library (Local) ││
│                                              │                  ││
│                                              │ ┌──────────────┐ ││
│                                              │ │ OrgService   │ ││
│                                              │ │ QueryService │ ││
│                                              │ │ SelectionSvc │ ││
│                                              │ │ RetrieveSvc  │ ││
│                                              │ │ GitService   │ ││
│                                              │ └──────────────┘ ││
│                                              └────────┬─────────┘│
│                                                       │          │
└───────────────────────────────────────────────────────┼──────────┘
                                                        │
                                   ┌────────────────────▼────────────┐
                                   │  External Systems               │
                                   │  • Salesforce Org (Tooling API) │
                                   │  • Local Git Repository         │
                                   │  • SF CLI (`sf project retrieve`)│
                                   └─────────────────────────────────┘
```

### Layer Descriptions

| Layer | Technology | Responsibility |
|---|---|---|
| **Webview Panel** | HTML, CSS, Vanilla JS | Renders UI, captures user input, sends messages to the Extension Host. |
| **Extension Host** | TypeScript (Node.js) | Receives messages from the Webview, orchestrates calls to the `track-changes` library, sends results back to the Webview. Acts as the **controller**. |
| **`track-changes` Library** | TypeScript (Node.js) | The **model/service layer**. Contains all Salesforce API and Git logic. Imported directly as a local dependency (`file:../track-changes`). |

### Communication Protocol: `postMessage` API

All communication between the **Webview** and the **Extension Host** uses the VS Code `postMessage` / `onDidReceiveMessage` API. Messages follow a strict contract.

#### Message Schema

```typescript
// Webview → Extension Host
interface WebviewMessage {
  command: string;    // The action identifier (e.g., 'fetchMetadata', 'commitChanges')
  payload?: unknown;  // Optional data associated with the command
  requestId: string;  // A unique ID to correlate async responses
}

// Extension Host → Webview
interface HostMessage {
  command: string;    // The response/event identifier (e.g., 'metadataLoaded', 'commitResult')
  payload?: unknown;  // The response data
  requestId?: string; // Correlates to the original request
  error?: string;     // Error message, if the operation failed
}
```

#### Defined Message Commands

| Direction | `command` | `payload` | Description |
|---|---|---|---|
| `Webview → Host` | `fetchMetadata` | `{ targetOrg?: string, types?: string[] }` | Request metadata changes from the org. |
| `Host → Webview` | `metadataLoaded` | `MetadataChange[]` | Response with the array of metadata changes. |
| `Webview → Host` | `commitChanges` | `{ selectedIds: string[], message: string, userStoryRef?: string }` | Request to retrieve and commit selected items. |
| `Host → Webview` | `commitResult` | `{ success: boolean, commit?: string, filesCommitted?: number }` | Response with the result of the commit. |
| `Host → Webview` | `progress` | `{ step: string, detail?: string }` | Report progress of a long-running operation (retrieve, commit). |
| `Host → Webview` | `error` | `{ message: string, detail?: string }` | Report an error from any operation. |
| `Webview → Host` | `getOrgList` | `{}` | Request a list of authenticated Salesforce orgs. |
| `Host → Webview` | `orgList` | `{ orgs: { alias: string, username: string }[] }` | Response with available org aliases. |

---

## 3. Backend Library Reference (`track-changes`)

The `track-changes` library (`@evan-hyer/track-changes`) provides the service classes that the Extension Host will import and use. **No CLI commands will be invoked.** The services will be instantiated and called directly in-process.

### Package Identity

| Field | Value |
|---|---|
| Package Name | `@evan-hyer/track-changes` |
| Local Path | `C:\Repos\track-changes` |
| Main Entry | `dist/index.js` |
| Module Type | ESM (`"type": "module"`) |
| TypeScript Target | `es2022` |

### Service Inventory

The following services from `src/services/` will be consumed by the Extension Host:

---

#### `OrgService` (`org-service.ts`)

Handles Salesforce org connections.

| Method | Signature | Description |
|---|---|---|
| `getOrg` | `(aliasOrUsername?: string) => Promise<Org>` | Returns an `@salesforce/core` `Org` instance. If no alias is provided, uses the default org. The `Org` instance provides `.getConnection()` to get a `Connection` object. |

**Usage**: Called once per operation to establish the Salesforce connection.

---

#### `QueryService` (`query-service.ts`)

Queries the `SourceMember` Tooling API object and resolves user names.

| Method | Signature | Description |
|---|---|---|
| `queryChanges` | `(options: QueryOptions) => Promise<MetadataChange[]>` | Main entry point. Accepts filter options, builds SOQL via `SoqlQueryBuilder`, executes query, resolves `ChangedBy` IDs to user names, and returns mapped `MetadataChange[]`. |
| `queryAll<T>` | `(query: string) => Promise<T[]>` | Handles Salesforce pagination (`queryMore`) for any SOQL query. |

**`QueryOptions` Interface:**

```typescript
interface QueryOptions {
  limit?: number;       // Max results
  name?: string;        // Filter by MemberName (supports % wildcard)
  since?: string;       // Date filter start (YYYY-MM-DD)
  types?: string[];     // Filter by MemberType (e.g., ['ApexClass', 'CustomObject'])
  until?: string;       // Date filter end (YYYY-MM-DD)
  username?: string;    // Filter by user's display name
}
```

**Constructor**: `new QueryService(connection: Connection)` — requires a `Connection` from `OrgService`.

---

#### `SelectionService` (`selection-service.ts`)

Manages the state of user-selected metadata items.

| Method | Signature | Description |
|---|---|---|
| `createSelection` | `(items: MetadataChange[], sourceOrg?: string) => MetadataSelection` | Creates a `MetadataSelection` object with a timestamp. |
| `saveSelections` | `(filePath: string, selection: MetadataSelection) => Promise<void>` | Persists selection to a JSON file (creates directories if needed). |
| `loadSelections` | `(filePath: string) => Promise<MetadataSelection>` | Loads a selection from a JSON file. |
| `validateSelections` | `(selection: MetadataSelection, available: MetadataChange[]) => string[]` | Returns IDs of items in the selection that don't exist in the available list. |

**`MetadataSelection` Interface:**

```typescript
interface MetadataSelection {
  items: MetadataChange[];
  selectedAt: string;       // ISO timestamp
  sourceOrg?: string;       // Org alias
}
```

**Note for Extension**: The Webview manages selection state in-memory (no file persistence needed for the GUI flow). However, `SelectionService.createSelection` can be used to build the selection object before passing it to `RetrieveService`.

---

#### `RetrieveService` (`retrieve-service.ts`)

Retrieves metadata from Salesforce using the `sf project retrieve start` CLI command.

| Method | Signature | Description |
|---|---|---|
| `formatMetadata` | `(type: string, name: string) => string` | Returns `"Type:Name"` (e.g., `"ApexClass:MyController"`). |
| `retrieve` | `(metadata: string[], targetOrg?: string, outputDir?: string) => Promise<RetrieveResult>` | Executes `sf project retrieve start` with the given metadata list. |

**`RetrieveResult` Interface:**

```typescript
interface RetrieveResult {
  errors: string[];
  retrievedItems: string[];
  success: boolean;
}
```

**Important**: This service shells out to the `sf` CLI. The workspace must have a valid `sfdx-project.json` for this to work.

---

#### `GitService` (`git-service.ts`)

Handles Git operations via the `simple-git` library.

| Method | Signature | Description |
|---|---|---|
| `add` | `(files: string[]) => Promise<void>` | Stages files. Pass `['.']` to stage all. |
| `commit` | `(message: string) => Promise<CommitResult>` | Commits staged changes. |
| `getCurrentBranch` | `() => Promise<string>` | Returns the current branch name. |
| `status` | `() => Promise<StatusResult>` | Returns the current Git status (staged, modified, etc.). |

**`CommitResult` Interface:**

```typescript
interface CommitResult {
  branch: string;
  commit: string;          // Short hash
  filesCommitted: number;
  success: boolean;
}
```

**Constructor**: `new GitService(workingDir?: string)` — defaults to `cwd`.

---

#### `SoqlQueryBuilder` (`soql-query-builder.ts`)

Builder-pattern class for composing `SourceMember` SOQL queries with sanitized filters.

| Method | Description |
|---|---|
| `filterByUser(userId)` | Adds `ChangedBy = 'userId'` |
| `filterByTypes(types[])` | Adds `MemberType IN ('type1','type2')` |
| `filterByName(name)` | Adds `MemberName LIKE 'name'` |
| `filterByDateRange(start, end?)` | Adds `SystemModstamp >= 'start'` (and `<= 'end'` optional) |
| `limit(n)` | Adds `LIMIT n` |
| `build()` | Returns the full SOQL string |

**Selected Fields**: `Id, MemberName, MemberType, RevisionCounter, ChangedBy, SystemModstamp`

---

#### Core Data Types (`types.ts`)

```typescript
/** The primary data structure used throughout the extension */
interface MetadataChange {
  componentName: string;    // MemberName (e.g., "MyApexClass")
  date: string;             // SystemModstamp (ISO datetime)
  id: string;               // SourceMember Id
  modifiedBy: string;       // Resolved user display name (e.g., "John Doe")
  type: string;             // MemberType (e.g., "ApexClass")
}

/** Raw Salesforce SourceMember record */
interface SourceMember extends Record<string, unknown> {
  ChangedBy?: null | string | { Name: string };
  Id: string;
  MemberName: string;
  MemberType: string;
  RevisionCounter: number;
  SystemModstamp: string;
}
```

#### Utility Functions (`utils.ts`)

| Function | Signature | Description |
|---|---|---|
| `sanitizeSoqlString` | `(input: string) => string` | Escapes `\` and `'` for safe SOQL injection. |
| `escapeHtml` | `(unsafe: string \| null \| undefined) => string` | Escapes `&<>"'` for safe HTML rendering. |

---

## 4. UI/UX Design Specification

### 4.1. Reference Image Analysis

The reference image (`image.png`) shows the **Copado User Story Commit** screen. The SF Commit Studio Webview must replicate this layout and feel using VS Code theming.

**Identified Regions:**

```
┌──────────────────────────────────────────────────────────────────┐
│ [A] HEADER BAR                                                   │
│   ┌─────────────────────┐  ┌──────────────┐  ┌────────────────┐ │
│   │ Commit Message       │  │ Org Selector │  │ User Story Ref │ │
│   │ (textarea)           │  │ (dropdown)   │  │ (text input)   │ │
│   └─────────────────────┘  └──────────────┘  └────────────────┘ │
│                                            ┌───────────────────┐ │
│                                            │  Commit Changes   │ │
│                                            │  (Primary Button) │ │
│                                            └───────────────────┘ │
├──────────────────────────────────────────────────────────────────┤
│ [B] TAB BAR                                                      │
│   ┌──────────────┐ ┌───────────────────┐                         │
│   │ All Metadata │ │ Selected Metadata │                         │
│   └──────────────┘ └───────────────────┘                         │
├──────────────────────────────────────────────────────────────────┤
│ [C] DATA GRID                                                    │
│   ┌──┬──────────────────────────────┬──────────────┬────────────┤
│   │☐ │ Name ▼                       │ Type ▼       │ Last Mod...│
│   ├──┼──────────────────────────────┼──────────────┼────────────┤
│   │☐ │ Marla_Templates_d            │ CustomObject │ User Integ │
│   │☐ │ Marla_Templates_d_Days_Re... │ CustomField  │ User Integ │
│   │  │  ...                         │              │            │
│   └──┴──────────────────────────────┴──────────────┴────────────┘
├──────────────────────────────────────────────────────────────────┤
│ [D] STATUS BAR / PAGINATION                                      │
│   Showing 1-25 of 142 items    [◄] [1] [2] [3] ... [6] [►]     │
└──────────────────────────────────────────────────────────────────┘
```

### 4.2. Component Breakdown

#### [A] Header Area

| Element | HTML | Behavior |
|---|---|---|
| **Commit Message** | `<textarea id="commit-message">` | Multi-line text input. Required field. Placeholder: `"Enter your commit message..."`. |
| **Org Selector** | `<select id="org-selector">` | Dropdown populated from authenticated SF orgs (via `sf org list`). Default: the project's default org. |
| **User Story Reference** | `<input id="user-story-ref" type="text">` | Optional free-text field. Placeholder: `"US-0000000"`. Value is prepended to the commit message (e.g., `[US-0000275] Fix page layout`). |
| **Commit Changes Button** | `<button id="btn-commit" class="primary">` | Blue primary action button. Disabled until: (a) at least one item is selected AND (b) commit message is not empty. Triggers the full retrieve → stage → commit pipeline. |

#### [B] Tab Bar

| Tab | ID | Behavior |
|---|---|---|
| **All Metadata** | `tab-all` | Default active tab. Shows the full list of `MetadataChange[]` from the query. |
| **Selected Metadata** | `tab-selected` | Shows only items where the checkbox is checked. Item count updates dynamically (e.g., "Selected Metadata (3)"). |

#### [C] Data Grid

The grid is a **plain HTML `<table>`** — no third-party data grid libraries.

| Column | Source Field | Features |
|---|---|---|
| **☐ (Checkbox)** | N/A | `<input type="checkbox">`. Header checkbox toggles select-all / deselect-all **for the current filtered view**. |
| **Name** | `componentName` | Sortable (click header to toggle ascending/descending). Filterable (text input in header). |
| **Type** | `type` | Sortable. Filterable (dropdown populated from distinct types in the dataset). |
| **Last Modified By** | `modifiedBy` | Sortable. Filterable (text input). |
| **Last Modified Date** | `date` | Sortable (by date, not lexicographic). Displays formatted date (`YYYY-MM-DD HH:mm`). |
| **Created By** | `modifiedBy` (same field) | *Note: The `SourceMember` object only has `ChangedBy`/`SystemModstamp`. "Created By" from the reference image maps to the same `modifiedBy` field. Display as-is.* |

**Grid Behavior:**
*   Rows have a subtle hover highlight using `var(--vscode-list-hoverBackground)`.
*   Clicking a row (anywhere except the checkbox) toggles the checkbox.
*   Alternating row stripes use `var(--vscode-list-alternatingBackground)` for readability.

#### [D] Status Bar / Pagination

| Element | Behavior |
|---|---|
| **Item Count** | `"Showing X-Y of Z items"` — reflects current page and filter state. |
| **Page Size Selector** | Dropdown: 25 (default), 50, 100. |
| **Page Navigation** | `◄ Prev` / `Next ►` buttons + clickable page numbers. |

### 4.3. Styling Strategy

**Core Principle**: Use VS Code's built-in CSS custom properties (`var(--vscode-...)`) for **all** color and font decisions. This ensures native theme compatibility (Light, Dark, High Contrast).

#### Key VS Code CSS Variables

```css
/* Backgrounds */
--vscode-editor-background             /* Main panel background */
--vscode-sideBar-background            /* Header/sidebar area */
--vscode-list-activeSelectionBackground /* Selected row */
--vscode-list-hoverBackground          /* Row hover */
--vscode-list-alternatingBackground    /* Zebra striping (if available) */

/* Foregrounds */
--vscode-editor-foreground             /* Primary text */
--vscode-descriptionForeground         /* Secondary/muted text */

/* Borders */
--vscode-panel-border                  /* Separators */
--vscode-input-border                  /* Input field borders */

/* Interactive */
--vscode-button-background             /* Primary button fill */
--vscode-button-foreground             /* Primary button text */
--vscode-button-hoverBackground        /* Primary button hover */
--vscode-button-secondaryBackground    /* Secondary button fill */
--vscode-input-background              /* Input/textarea background */
--vscode-input-foreground              /* Input text */
--vscode-focusBorder                   /* Focus ring */

/* Font */
--vscode-font-family
--vscode-font-size
--vscode-editor-font-family            /* Monospace for data cells */
```

#### CSS File Structure

```
media/
├── main.css          # All styles for the Webview
```

**Guidelines:**
*   No inline styles in HTML.
*   Use BEM-like naming: `.grid`, `.grid__header`, `.grid__row`, `.grid__cell`.
*   Set `box-sizing: border-box` globally.
*   All spacing in `rem` or `em` for scaling.
*   The primary action button uses `var(--vscode-button-background)` which is typically blue in default themes, matching the reference image.

### 4.4. Accessibility

*   All interactive elements must have `aria-label` attributes.
*   The data grid uses `role="grid"`, `role="row"`, `role="gridcell"`.
*   Tab order: Org Selector → Commit Message → User Story Ref → Commit Button → Grid.
*   Keyboard: `Space` toggles checkbox on focused row, `Enter` activates buttons.

---

## 5. Data Flow

### 5.1. Metadata Fetch Flow

```
User clicks "Refresh" or panel opens
          │
          ▼
┌─────────────────┐  fetchMetadata   ┌─────────────────────────┐
│  Webview JS      │ ───────────────► │  Extension Host          │
│  (postMessage)   │                  │                          │
└─────────────────┘                  │  1. orgService.getOrg()  │
                                      │  2. org.getConnection()  │
                                      │  3. new QueryService(conn)│
                                      │  4. queryService          │
                                      │       .queryChanges({     │
                                      │         types,            │
                                      │         limit: 2000       │
                                      │       })                  │
                                      │  5. Return MetadataChange[]│
                                      └───────────┬───────────────┘
                                                  │ metadataLoaded
                                                  ▼
                                      ┌─────────────────┐
                                      │  Webview JS      │
                                      │  • Store in      │
                                      │    allMetadata[] │
                                      │  • Render grid   │
                                      └─────────────────┘
```

### 5.2. Selection State Management

Selection state is managed **entirely in the Webview** (client-side JavaScript) using a `Set<string>` of selected `MetadataChange.id` values.

```javascript
// In webview main.js
const selectedIds = new Set();

function toggleSelection(id) {
  if (selectedIds.has(id)) {
    selectedIds.delete(id);
  } else {
    selectedIds.add(id);
  }
  updateSelectedCount();
  updateCommitButtonState();
  if (currentTab === 'selected') renderGrid();
}

function getSelectedItems() {
  return allMetadata.filter(item => selectedIds.has(item.id));
}
```

### 5.3. Commit Flow (End-to-End)

```
User fills commit message, selects items, clicks "Commit Changes"
          │
          ▼
┌──────────────────┐  commitChanges   ┌────────────────────────────┐
│  Webview JS       │ ────────────────►│  Extension Host             │
│  payload:         │                  │                             │
│  {                │                  │  1. Parse selectedIds       │
│    selectedIds,   │                  │     → map to MetadataChange │
│    message,       │                  │                             │
│    userStoryRef   │                  │  2. RETRIEVE:               │
│  }                │                  │     retrieveService         │
└──────────────────┘                  │       .formatMetadata()     │
          ▲                            │     retrieveService         │
          │                            │       .retrieve(metadata,   │
          │                            │         targetOrg)          │
          │    progress                │                             │
          │◄───────────────────────────│  3. STAGE:                  │
          │    "Staging files..."      │     gitService.add(['.'])   │
          │                            │                             │
          │    progress                │  4. BUILD COMMIT MSG:       │
          │◄───────────────────────────│     Prepend User Story Ref  │
          │    "Committing..."         │     "[US-0000275] message"  │
          │                            │                             │
          │    commitResult            │  5. COMMIT:                 │
          │◄───────────────────────────│     gitService.commit(msg)  │
          │    { success, hash, ... }  │                             │
          │                            └────────────────────────────┘
          ▼
  Show success/error toast in Webview
```

### 5.4. Commit Message Format

The final Git commit message is constructed as follows:

```
[<userStoryRef>] <commitMessage>
```

*   If `userStoryRef` is provided: `[US-0000275] Updated page layout validation rules`
*   If `userStoryRef` is empty: `Updated page layout validation rules`

---

## 6. Implementation Roadmap

---

### Phase 0: Project Scaffolding

**Goal**: A buildable, runnable, empty VS Code extension with the correct project structure.

**Definition of Done**: Running the extension in the Extension Development Host opens VS Code without errors. The `SF Commit Studio: Open` command appears in the command palette.

| # | Task | Details |
|---|---|---|
| 0.1 | **Initialize the extension project** | Run `npx -y yo code` (VS Code Extension generator). Select TypeScript, ESM, and use the name `sf-commit-studio`. Configure `package.json` with `"engines": { "vscode": "^1.85.0" }`. |
| 0.2 | **Add `track-changes` as a local dependency** | In `package.json`, add `"@evan-hyer/track-changes": "file:../track-changes"`. Run `npm install`. Verify import works. |
| 0.3 | **Create the directory structure** | Create: `src/extension.ts`, `src/panels/`, `src/services/`, `media/` (for CSS/JS), `resources/` (for icons). |
| 0.4 | **Register the `sfCommitStudio.open` command** | In `package.json` `contributes.commands`, register `sfCommitStudio.open` with title `"SF Commit Studio: Open"`. Wire it in `extension.ts` `activate()` to call `vscode.window.showInformationMessage('Hello')` as a placeholder. |
| 0.5 | **Configure `tsconfig.json`** | Set `target: "ES2022"`, `module: "Node16"`, `outDir: "dist"`, `rootDir: "src"`. Match the `track-changes` module resolution. |
| 0.6 | **Add `.vscodeignore`** | Exclude `src/`, `node_modules/`, `.vscode-test/`, `**/*.map` from the packaged `.vsix`. |
| 0.7 | **Verify build & launch** | Run `npm run compile`. Press `F5` to launch Extension Development Host. Verify the command runs without errors. |

---

### Phase 1: Extension Host & Webview Shell

**Goal**: The `SF Commit Studio: Open` command opens a Webview panel with the correct HTML skeleton, CSS, and CSP. The panel persists when tabbed away from.

**Definition of Done**: A Webview panel opens with the header area (empty fields), tab bar, an empty grid placeholder, and correct VS Code theme colors. No data is fetched yet.

| # | Task | Details |
|---|---|---|
| 1.1 | **Create `CommitStudioPanel` class** | In `src/panels/CommitStudioPanel.ts`. This class manages the lifecycle of the Webview panel. It should implement the `Disposable` pattern. Use a static `createOrShow()` method (singleton pattern — only one panel at a time). |
| 1.2 | **Implement `_getWebviewOptions()`** | Return `{ enableScripts: true, localResourceRoots: [mediaUri] }` where `mediaUri` points to the `media/` folder. |
| 1.3 | **Implement `_getHtmlForWebview()`** | Generate the full HTML string with: a `<meta>` CSP tag using `nonce`, a `<link>` to `main.css`, a `<script>` tag for `main.js` with `nonce`. Use `webview.asWebviewUri()` to convert local file paths to webview-safe URIs. |
| 1.4 | **Create `media/main.css`** | Implement the full stylesheet. Define the layout grid (header, tabs, data grid, status bar). Use CSS Grid or Flexbox. Apply all `var(--vscode-...)` variables. Style the `.header`, `.tab-bar`, `.data-grid`, `.status-bar` regions. |
| 1.5 | **Create `media/main.js`** | Scaffold the Webview's JavaScript. Set up `const vscode = acquireVsCodeApi()`. Add the `window.addEventListener('message', ...)` handler (empty switch-case for now). |
| 1.6 | **Create the HTML structure for the Header Area** | Implement region [A]: Commit Message `<textarea>`, Org Selector `<select>` (empty for now), User Story Ref `<input>`, and Commit Changes `<button>`. Apply appropriate `id` attributes for all interactive elements. |
| 1.7 | **Create the HTML structure for the Tab Bar** | Implement region [B]: Two tabs (`All Metadata`, `Selected Metadata`). Add click handlers to toggle an `.active` class and switch grid content (placeholder for now). |
| 1.8 | **Create the HTML structure for the Data Grid** | Implement region [C]: A `<table>` with `<thead>` (Checkbox, Name, Type, Last Modified By, Last Modified Date, Created By) and an empty `<tbody>`. |
| 1.9 | **Create the HTML structure for the Status Bar** | Implement region [D]: Item count text and pagination buttons (disabled/placeholder). |
| 1.10 | **Wire `sfCommitStudio.open` to `CommitStudioPanel.createOrShow()`** | Update `extension.ts` to instantiate the panel. Pass `extensionUri` to the panel constructor. |
| 1.11 | **Handle panel disposal** | Implement `dispose()` on `CommitStudioPanel` to clean up resources. Handle `onDidDispose` to null out the singleton reference. |

---

### Phase 2: Metadata Grid (Read-Only)

**Goal**: When the panel opens, it fetches metadata from the connected Salesforce org and displays it in the data grid with sorting and pagination.

**Definition of Done**: The grid renders real metadata from the org. Columns are sortable. Pagination works. Loading spinner displays during fetch.

| # | Task | Details |
|---|---|---|
| 2.1 | **Create `ExtensionHostService` class** | In `src/services/ExtensionHostService.ts`. This is the controller that handles `postMessage` from the Webview and orchestrates calls to the `track-changes` services. It holds references to `OrgService`, `QueryService`, etc. |
| 2.2 | **Implement `handleMessage()` dispatcher** | A `switch` on `message.command` that routes to handler methods (e.g., `case 'fetchMetadata': this.handleFetchMetadata(message)`). |
| 2.3 | **Implement `handleFetchMetadata()`** | Call `orgService.getOrg()` → `queryService.queryChanges()`. Send `metadataLoaded` message back to the Webview with the `MetadataChange[]` array. Wrap in try/catch and send `error` message on failure. |
| 2.4 | **Implement Webview `fetchMetadata` sender** | In `main.js`, on DOMContentLoaded, send a `fetchMetadata` message to the host. Show a loading spinner/overlay on the grid. |
| 2.5 | **Implement Webview `metadataLoaded` handler** | In `main.js`, receive the `MetadataChange[]` array. Store in a global `allMetadata` variable. Call `renderGrid()`. |
| 2.6 | **Implement `renderGrid()` function** | Clear `<tbody>`. Iterate over the current page slice of `allMetadata` (accounting for sort, filter, pagination). For each item, create a `<tr>` with cells for checkbox, name, type, modified by, date, created by. Escape all values using a client-side `escapeHtml()` utility. |
| 2.7 | **Implement column sorting** | Add click handlers to `<th>` elements. Maintain `sortColumn` and `sortDirection` state. Sort `allMetadata` in place and re-render. Add a sort indicator icon (▲/▼) to the active column header. |
| 2.8 | **Implement pagination logic** | Maintain `currentPage` and `pageSize` state. Compute `totalPages = Math.ceil(filteredData.length / pageSize)`. `renderGrid()` only renders the current page slice. Update status bar text. |
| 2.9 | **Implement pagination controls** | Wire "Prev", "Next", and page number buttons. Wire the page-size dropdown to change `pageSize` and reset to page 1. |
| 2.10 | **Implement loading state** | Show a centered spinner overlay on the grid area when `fetchMetadata` is sent. Hide it when `metadataLoaded` or `error` is received. Use a simple CSS animation (e.g., rotating SVG circle). |
| 2.11 | **Implement error display** | On `error` message, display an inline error banner above the grid with the error message and a "Retry" button that re-sends `fetchMetadata`. |
| 2.12 | **Populate the Org Selector dropdown** | On panel open, send `getOrgList` message. In the host, run `sf org list --json` (via `child_process.exec`). Parse the JSON output and send back as `orgList`. In the Webview, populate the `<select>` dropdown. When the user changes the dropdown, re-fetch metadata for the new org. |

---

### Phase 3: Selection & Filtering

**Goal**: Users can select individual metadata items via checkboxes, use the "Selected Metadata" tab to review selections, and filter the grid by column.

**Definition of Done**: Checkbox selection works, "Selected Metadata" tab shows only checked items, column filters narrow the grid, and the "Commit Changes" button enables/disables based on state.

| # | Task | Details |
|---|---|---|
| 3.1 | **Implement checkbox click handler** | On checkbox `change` event, add/remove the item's `id` from `selectedIds` Set. Do not re-fetch data. |
| 3.2 | **Implement row-click selection toggle** | Clicking anywhere on a `<tr>` (except filter inputs) toggles its checkbox. |
| 3.3 | **Implement "Select All" header checkbox** | A checkbox in the header that toggles all **currently visible** (filtered + current page) items on/off. It should show an indeterminate state if some (but not all) visible items are selected. |
| 3.4 | **Implement "Selected Metadata" tab** | When the `tab-selected` tab is active, `renderGrid()` uses `allMetadata.filter(item => selectedIds.has(item.id))` as its data source instead of `allMetadata`. |
| 3.5 | **Implement dynamic tab badge** | The "Selected Metadata" tab text updates to show the count: `Selected Metadata (5)`. |
| 3.6 | **Implement column filter for "Name"** | Add a `<input type="text" placeholder="Filter...">` below the "Name" header. On `input` event, filter `allMetadata` where `componentName` includes the filter string (case-insensitive). Reset to page 1. |
| 3.7 | **Implement column filter for "Type"** | Add a `<select>` dropdown below the "Type" header. Populate its options from `[...new Set(allMetadata.map(m => m.type))]`. "All Types" as the default option. On `change`, filter the grid. |
| 3.8 | **Implement column filter for "Last Modified By"** | Add a `<input type="text">` filter. On `input`, filter by `modifiedBy` (case-insensitive). |
| 3.9 | **Implement combined filter logic** | All active filters are applied with `AND` logic. Sorting and pagination operate on the **filtered** dataset. |
| 3.10 | **Implement commit button state management** | The "Commit Changes" button is `disabled` unless: `selectedIds.size > 0` AND `commitMessage.value.trim() !== ''`. Listen for `input` events on both to re-evaluate. |
| 3.11 | **Persist Webview state on tab switch** | Use `vscode.setState()` and `vscode.getState()` to preserve `selectedIds`, `allMetadata`, `currentPage`, `filters`, and `sortState` when the Webview is hidden and re-shown. |

---

### Phase 4: Commit Flow

**Goal**: The "Commit Changes" button triggers the full pipeline: Retrieve → Stage → Commit. Progress is reported to the user.

**Definition of Done**: Clicking "Commit Changes" retrieves the selected metadata, stages all changes, commits with the constructed message, and shows a success or error result.

| # | Task | Details |
|---|---|---|
| 4.1 | **Implement `commitChanges` message sender in Webview** | On "Commit Changes" button click, construct the payload: `{ selectedIds: [...selectedIds], message: commitMessage.value, userStoryRef: userStoryRef.value }`. Send via `postMessage`. Disable the button and show a progress indicator. |
| 4.2 | **Implement `handleCommitChanges()` in Extension Host** | Receive the message. Map `selectedIds` back to `MetadataChange[]` from the cached data. |
| 4.3 | **Step 1: Retrieve** | Call `retrieveService.formatMetadata()` for each selected item. Call `retrieveService.retrieve(metadata, targetOrg)`. Send a `progress` message: `{ step: "Retrieving metadata...", detail: "5 items" }`. Handle `RetrieveResult.success === false` by sending `error`. |
| 4.4 | **Step 2: Stage** | Call `gitService.add(['.'])`. Send a `progress` message: `{ step: "Staging files..." }`. |
| 4.5 | **Step 3: Build Commit Message** | If `userStoryRef` is provided, format as `[US-0000275] <message>`. Otherwise, use the message as-is. |
| 4.6 | **Step 4: Commit** | Call `gitService.commit(formattedMessage)`. Send `commitResult` message: `{ success: true, commit: result.commit, filesCommitted: result.filesCommitted, branch: result.branch }`. |
| 4.7 | **Implement progress UI in Webview** | On `progress` messages, update a progress bar or step indicator in the header area. Show the current step text. |
| 4.8 | **Implement success UI in Webview** | On `commitResult` with `success: true`, show a success toast/banner: `"✓ Committed 5 files to main (abc1234)"`. Clear the commit message field. Clear selections. Re-fetch metadata. |
| 4.9 | **Implement error UI in Webview** | On `commitResult` with `success: false` or `error`, show an error banner with the message. Re-enable the commit button. |
| 4.10 | **Re-enable controls after commit** | On any terminal result (success or error), re-enable the "Commit Changes" button, hide the progress indicator, and restore normal interaction. |

---

### Phase 5: Polish & Error Handling

**Goal**: Production-quality UX with robust error handling, edge case coverage, and a professional feel.

**Definition of Done**: The extension handles all known error scenarios gracefully, looks professional, and is ready for packaging as a `.vsix`.

| # | Task | Details |
|---|---|---|
| 5.1 | **Handle "No default org" scenario** | If `OrgService.getOrg()` throws because no default org is set, show a clear message in the Webview: `"No Salesforce org connected. Run 'sf org login web' in the terminal."` with a button that opens the VS Code terminal. |
| 5.2 | **Handle "No sfdx-project.json" scenario** | Before attempting retrieve, check if the workspace root contains `sfdx-project.json`. If not, show: `"This workspace is not a Salesforce project. Open a project with sfdx-project.json."`. |
| 5.3 | **Handle empty metadata results** | If `queryChanges` returns `[]`, show a centered empty-state illustration/message: `"No metadata changes found in this org."`. |
| 5.4 | **Add a "Refresh" button** | Add a refresh icon button in the header that re-fetches metadata without reopening the panel. |
| 5.5 | **Add keyboard shortcuts** | `Ctrl+Enter` / `Cmd+Enter` in the commit message textarea triggers the commit. `Ctrl+A` / `Cmd+A` in the grid selects all filtered items. |
| 5.6 | **Add Visual Studio Code Activity Bar icon** | Register a custom icon in `package.json` `contributes.viewsContainers.activitybar` so users can access SF Commit Studio from the sidebar. Use a Salesforce cloud icon or a Git commit icon. |
| 5.7 | **Add confirmation dialog for large commits** | If `selectedIds.size > 50`, show a confirmation: `"You are about to retrieve and commit 73 items. Continue?"`. |
| 5.8 | **Implement date formatting** | Parse ISO dates and display as `YYYY-MM-DD HH:mm` in the grid. Add a tooltip on hover showing the full ISO timestamp. |
| 5.9 | **Add CSP hardening** | Ensure the Content Security Policy in the HTML `<meta>` tag restricts: `script-src 'nonce-...'`, `style-src` to self + unsafe-inline (for VS Code themes), `img-src` to self + data URIs only. No external resources. |
| 5.10 | **Test on all VS Code themes** | Verify the Webview renders correctly in: Default Dark Modern, Default Light Modern, High Contrast, High Contrast Light. Fix any contrast or readability issues. |
| 5.11 | **Package the extension** | Run `npx vsce package` to create the `.vsix` file. Verify it installs cleanly in a fresh VS Code instance. |
| 5.12 | **Write `README.md` for the extension** | Include: feature overview, screenshots, installation instructions, usage guide, known limitations, and the required setup (authenticated Salesforce org). |
| 5.13 | **Add extension icon** | Create (or generate) a 128x128px extension icon for the VS Code marketplace listing. Save to `resources/icon.png` and reference in `package.json` `icon` field. |

---

## Appendix A: File Tree (Planned)

```
sf-commit-studio/
├── .vscode/
│   ├── launch.json                # F5 debug configuration
│   └── tasks.json                 # Build task
├── media/
│   ├── main.css                   # Webview stylesheet
│   └── main.js                    # Webview client-side JavaScript
├── resources/
│   └── icon.png                   # Extension icon (128x128)
├── src/
│   ├── extension.ts               # activate() / deactivate()
│   ├── panels/
│   │   └── CommitStudioPanel.ts   # Webview panel lifecycle manager
│   └── services/
│       └── ExtensionHostService.ts # Message handler & orchestrator
├── .vscodeignore
├── AGENTS.md                      # This file
├── LICENSE
├── package.json
├── README.md
└── tsconfig.json
```

## Appendix B: Dependency Summary

| Dependency | Purpose | Source |
|---|---|---|
| `@evan-hyer/track-changes` | Salesforce metadata query, retrieve, and Git services | Local (`file:../track-changes`) |
| `vscode` | VS Code Extension API | Provided by the runtime (`@types/vscode` for dev) |

> **Note**: The Webview uses **zero npm dependencies**. All client-side code is vanilla HTML/CSS/JS.

## Appendix C: Security Considerations

1.  **Content Security Policy**: The Webview `<meta>` CSP tag must use nonce-based script execution. No `eval()` or inline scripts.
2.  **Input Sanitization**: All data rendered into the grid HTML must be escaped via a client-side `escapeHtml()` function (mirroring the one in `track-changes/utils.ts`).
3.  **No Secrets in Webview**: The Webview never receives org credentials or tokens. All Salesforce API calls happen in the Extension Host (Node.js) which has access to the `@salesforce/core` auth store.
4.  **File System Access**: The Webview has no direct file system access. All file operations go through the Extension Host via `postMessage`.