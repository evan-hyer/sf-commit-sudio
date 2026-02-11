# SF Commit Studio

**SF Commit Studio** is a VS Code extension that provides a visual, "Click-Not-Code" experience for Salesforce Admins and Developers to commit metadata changes to Git.

It mirrors the familiar **Copado User Story Commit** screen, easing the transition to a Git-native workflow.

## Features

- **Visual Change Browsing**: View all metadata changes in your connected Salesforce Org.
- **Filtering & Sorting**: Easily find components by Name, Type, or Last Modified By.
- **Checkbox Selection**: Select specific items to retrieve and commit.
- **Integrated Commit Flow**: Retrieve, Stage, and Commit in one click.
- **User Story Integration**: Automatically prepend User Story references (e.g., `[US-123]`) to commit messages.

## Usage

1.  **Open the Panel**:
    - Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`).
    - Run **SF Commit Studio: Open**.

2.  **Select Org**:
    - Choose your source Salesforce Org from the dropdown in the header.
    - *Note: You must be authenticated via `sf org login` first.*

3.  **Select Changes**:
    - Browse the grid of changes.
    - Use filters to narrow down the list.
    - Check the boxes for the items you want to commit.

4.  **Commit**:
    - Enter a **Commit Message**.
    - (Optional) Enter a **User Story Reference**.
    - Click **Commit Changes**.

## Requirements

- **VS Code** ^1.85.0
- **Salesforce CLI (`sf`)** installed and available in your PATH.
- **Git** installed and available in your PATH.
- A valid Salesforce project (`sfdx-project.json`) in the workspace root.

## Extension Settings

None currently.

## Known Issues

- Large retrieves may take some time; please be patient.
- Ensure your `.gitignore` is set up correctly to avoid committing unwanted files.

## Release Notes

### 0.0.1
- Initial Release.
