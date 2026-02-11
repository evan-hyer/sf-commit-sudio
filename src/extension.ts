import * as vscode from 'vscode';
import { CommitStudioPanel } from './panels/CommitStudioPanel.js';

export function activate(context: vscode.ExtensionContext) {
	console.log('SF Commit Studio is now active!');

	let disposable = vscode.commands.registerCommand('sfCommitStudio.open', () => {
		CommitStudioPanel.createOrShow(context.extensionUri);
	});

	context.subscriptions.push(disposable);
}

export function deactivate() {}
