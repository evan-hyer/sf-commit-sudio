import * as vscode from 'vscode';
import { CommitStudioPanel } from './panels/CommitStudioPanel.js';

/**
 * Activates the SF Commit Studio extension.
 * This function is called by VS Code when the extension is first loaded.
 * 
 * @param context - The context in which the extension is running
 */
export function activate(context: vscode.ExtensionContext) {
	console.log('SF Commit Studio is now active!');

	/**
	 * Registers the primary command to open the SF Commit Studio webview.
	 */
	const disposable = vscode.commands.registerCommand('sfCommitStudio.open', () => {
		CommitStudioPanel.createOrShow(context.extensionUri);
	});

	context.subscriptions.push(disposable);
}

/**
 * Deactivates the SF Commit Studio extension.
 * This function is called by VS Code when the extension is being shut down.
 */
export function deactivate() { }