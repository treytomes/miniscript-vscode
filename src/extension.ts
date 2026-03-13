// extension.ts
// Entry point for the MiniScript Runner VS Code extension

import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';

/**
 * Called when the extension is activated.
 * Registers the MiniScript: Run File command.
 */
export function activate(context: vscode.ExtensionContext) {

    const runnerPath = path.join(
        context.extensionPath,
        'dist',
        process.platform === 'win32'
            ? 'miniscript-cli.exe'
            : 'miniscript-cli'
    );

    console.log('MiniScript runner path:', runnerPath);

    // Output channel for MiniScript execution results
    const outputChannel = vscode.window.createOutputChannel('MiniScript');

    /**
     * Run the currently active MiniScript file.
     */
    const runFileCommand = vscode.commands.registerCommand(
        'miniscript.runFile',
        async () => {

            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage('No active editor.');
                return;
            }

            const document = editor.document;

            // Optional: enforce .ms extension
            if (path.extname(document.fileName) !== '.ms') {
                vscode.window.showErrorMessage('Active file is not a MiniScript (.ms) file.');
                return;
            }

            // Ensure file is saved before execution
            if (document.isDirty) {
                await document.save();
            }

            outputChannel.clear();
            outputChannel.show(true);
            outputChannel.appendLine(`Running MiniScript: ${document.fileName}`);
            outputChannel.appendLine('----------------------------------------');

            // Spawn the MiniScript runner process
            const child = cp.spawn(
                runnerPath,               // executable name
                [document.fileName],               // arguments
                { cwd: path.dirname(document.fileName) }
            );

            // Capture stdout
            child.stdout.on('data', (data) => {
                outputChannel.append(data.toString());
            });

            // Capture stderr
            child.stderr.on('data', (data) => {
                outputChannel.append(data.toString());
            });

            // Process exit handling
            child.on('close', (code) => {
                outputChannel.appendLine('');
                outputChannel.appendLine(`Process exited with code ${code}`);
            });

            child.on('error', (err) => {
                vscode.window.showErrorMessage(
                    `Failed to start MiniScript runner: ${err.message}`
                );
            });
        }
    );

    context.subscriptions.push(runFileCommand, outputChannel);
}

/**
 * Called when the extension is deactivated.
 */
export function deactivate() {}