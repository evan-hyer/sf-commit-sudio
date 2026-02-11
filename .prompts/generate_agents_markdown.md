# Role
You are a Principal Software Architect and UI/UX Specialist for Visual Studio Code Extensions. You have deep expertise in Salesforce DevOps workflows (specifically transitioning from Copado to Git-native) and the VS Code Extension API.

# Task
Generate a comprehensive **Implementation Plan** (to be saved as `AGENTS.md`) for a new VS Code Extension named "SF Commit Sudio".
This extension will serve as a GUI wrapper around an existing CLI tool, providing a familiar interface for Salesforce Admins.

# Context & Inputs
1.  **Backend Logic**: The core specific logic resides in the local repository: `C:\Repos\track-changes`.
    *   *Action*: You MUST analyze this directory to understand the exposed CLI commands, internal services, and data structures available for reuse.
2.  **Target Audience**: Salesforce Admins accustomed to the "Copado User Story Commit" screen. The goal is to ease their transition to Git.
3.  **UI References**: Use the attached image `image.png` as the primary source of truth for the UI layout.

# Visual Analysis of UI (from image.png)
The UI should be implemented as a **VS Code Webview** using **Plain HTML, CSS, and Vanilla JavaScript**.
*   **Constraint**: Do NOT use complex frontend frameworks like React, Vue, or Angular. Keep the build process simple and the runtime lightweight.
*   **Header Area**:
    *   "Commit Message" text area (prominent).
    *   "User Story Reference" field (e.g., US-0000275).
    *   "Commit Changes" primary action button (Blue).
*   **Data Grid (Main Content)**:
    *   Tabbed interface: "All Metadata" vs "Selected Metadata".
    *   Columns: Checkbox (Select), Name, Type, Last Modified By, Last Modified Date, Created By.
    *   Filtering/Search capabilities within the column headers.
*   **Footer/Status**:
    *   Pagination or scrollable grid area for large metadata sets.

# Instructions for Output (AGENTS.md)
The generated `AGENTS.md` must include:
1.  **Architecture Overview**: How the Extension Host communicates with the Webview and the `track-changes` local library.
2.  **UI/UX Design Spec**:
    *   Detailed breakdown of the Webview components based on the `image.png` analysis.
    *   Styling strategy (utilize VS Code Native styles `var(--vscode-...)` to ensure theme compatibility while retaining the layout structure of the reference image).
3.  **Data Flow**:
    *   How metadata is retrieved from the Org (via `track-changes`).
    *   How selection state is managed.
    *   How the "Commit" action triggers the underlying git operations.
4.  **Detailed Implementation Roadmap**:
    *   Break down the project into **Phases**, and within each Phase, list specific **Granular Tasks**.
    *   **Task Granularity**: Each task should be a single, testable unit of work (e.g., "Create `index.html` with basic layout", "Implement `postMessage` handler in extension", "Wire up 'Commit' button click listener").
    *   Include a "Definition of Done" for each major phase.

# Constraints
*   Do not implement code yet, only the plan.
*   Ensure the design prioritizes "Click-Not-Code" for the Admin user persona.
*   The solution must run securely within the VS Code environment.

