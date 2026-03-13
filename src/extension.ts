// extension.ts
// Entry point for the MiniScript Runner VS Code extension

import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';

type MiniScriptMessage =
    | { type: 'stdout'; text: string }
    | { type: 'implicit'; text: string }
    | { type: 'error'; text: string }
    | { type: 'exit'; code: number };

function handleMiniScriptMessage(outputChannel: vscode.OutputChannel, msg: MiniScriptMessage) {
    switch (msg.type) {
        case 'stdout':
            outputChannel.appendLine(msg.text);
            break;

        case 'implicit':
            // TODO: Implicit output should be in a different color.  Possibly configurable?
            outputChannel.appendLine(msg.text);
            break;

        case 'error':
            // TODO: Error should be in a different color.
            outputChannel.appendLine(`[error] ${msg.text}`);
            break;

        case 'exit':
            outputChannel.appendLine('');
            outputChannel.appendLine(`Process exited with code ${msg.code}`);
            break;

        default:
            outputChannel.appendLine(
                `[unknown message] ${JSON.stringify(msg)}`
            );
    }
}

/**
 * Called when the extension is activated.
 * Registers the MiniScript: Run File command.
 */
export function activate(context: vscode.ExtensionContext) {
    // const runnerPath =
    //     vscode.workspace.getConfiguration('miniscript').get<string>('runnerPath') ?? 
    //     path.join(
    //         context.extensionPath,
    //         'dist',
    //         process.platform === 'win32'
    //             ? 'miniscript-cli.exe'
    //             : 'miniscript-cli'
    //     );
    const runnerPath =
        path.join(
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
                runnerPath,             // executable name
                [document.fileName],    // arguments
                { cwd: path.dirname(document.fileName) }
            );

            // Capture stdout
            let stdoutBuffer = '';

            child.stdout.on('data', (data) => {
                stdoutBuffer += data.toString();

                let newlineIndex;
                while ((newlineIndex = stdoutBuffer.indexOf('\n')) >= 0) {
                    const line = stdoutBuffer.slice(0, newlineIndex).trim();
                    stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);

                    if (!line) {
                        continue;
                    }

                    try {
                        const message = JSON.parse(line) as MiniScriptMessage;
                        handleMiniScriptMessage(outputChannel, message);
                    } catch (err) {
                        outputChannel.appendLine(
                            `[protocol error] ${line}`
                        );
                    }
                }
            });

            // Capture stderr
            child.stderr.on('data', (data) => {
                outputChannel.appendLine(
                    `[runner stderr] ${data.toString()}`
                );
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