import * as vscode from 'vscode';
import { ChmEditorProvider } from './chmEditorProvider';

export function activate(context: vscode.ExtensionContext): void {
    context.subscriptions.push(ChmEditorProvider.register(context));
}

export function deactivate(): void {}
