// extension.ts
// Entry point for the MiniScript Runner VS Code extension

import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import { MiniScriptProtocol } from './miniscript-cli/MiniScriptProtocol';
import ExecutionState from './miniscript-cli/ExecutionState';

type MiniScriptMessage =
	| { type: 'stdout'; text: string }
	| { type: 'implicit'; text: string }
	| { type: 'error'; text: string }
	| {
		type: 'diagnostic';
		file: string;
		line: number;
		column: number;
		severity: 'error' | 'warning' | 'info';
		message: string;
    }
	| { type: 'diagnostics.clear' }
	| { type: 'exit'; code: number };

interface MiniScriptRuntimeContext {
    output: vscode.OutputChannel;
    diagnostics: vscode.DiagnosticCollection;
}

function addDiagnostic(
    collection: vscode.DiagnosticCollection,
    msg: Extract<MiniScriptMessage, { type: 'diagnostic' }>
) {
    const uri = vscode.Uri.file(msg.file);

    const range = new vscode.Range(
        Math.max(0, msg.line - 1),
        Math.max(0, msg.column),
        Math.max(0, msg.line - 1),
        Math.max(0, msg.column + 1)
    );

    const severity =
        msg.severity === 'error'
            ? vscode.DiagnosticSeverity.Error
            : msg.severity === 'warning'
            ? vscode.DiagnosticSeverity.Warning
            : vscode.DiagnosticSeverity.Information;

    const diagnostic = new vscode.Diagnostic(
        range,
        msg.message,
        severity
    );

    const existing = collection.get(uri) ?? [];
    collection.set(uri, [...existing, diagnostic]);
}

function handleMiniScriptMessage(
    ctx: MiniScriptRuntimeContext,
    msg: MiniScriptMessage
) {
    switch (msg.type) {
        case 'stdout':
            ctx.output.append(msg.text);
            break;

        case 'implicit':
            ctx.output.appendLine(`» ${msg.text}`);
            break;

        case 'error':
            ctx.output.append(`✖ ${msg.text}`);
            break;

        case 'exit':
            ctx.output.append('');
            ctx.output.append(`Process exited with code ${msg.code}`);
            break;

		case 'diagnostics.clear':
			ctx.output.clear();
			break;

		case 'diagnostic':
			addDiagnostic(ctx.diagnostics, msg);
			break;
			
		default:
			ctx.output.appendLine(
				`[unknown message] ${JSON.stringify(msg)}`
			);
			break;
    }
}

function getRunnerPath(context: vscode.ExtensionContext) {
	const configSection = vscode.workspace.getConfiguration('miniscript');
	var runnerPath = undefined;
	if (configSection) {
		runnerPath = vscode.workspace.getConfiguration('miniscript').get<string>('runnerPath');
	}
	if (!runnerPath) {
		runnerPath = path.join(
            context.extensionPath,
            'dist',
            process.platform === 'win32'
                ? 'miniscript-cli.exe'
                : 'miniscript-cli'
        );
	}
	if (!runnerPath) {
		throw new Error("Unable to find a MiniScript CLI.");
	}
	return runnerPath;
}

/**
 * Called when the extension is activated.
 * Registers the MiniScript: Run File command.
 */
export function activate(context: vscode.ExtensionContext) {
	const runnerPath = getRunnerPath(context);
    console.log('MiniScript runner path:', runnerPath);

	const diagnostics = vscode.languages.createDiagnosticCollection('miniscript');
	context.subscriptions.push(diagnostics);

    // Output channel for MiniScript execution results
	const outputChannel = vscode.window.createOutputChannel('MiniScript');

	const protocol = new MiniScriptProtocol(outputChannel, diagnostics);

	// const runtimeContext: MiniScriptRuntimeContext = {
	// 	output: outputChannel,
	// 	diagnostics
	// };
	
    /**
     * Run the currently active MiniScript file.
     */
    const runFileCommand = vscode.commands.registerCommand(
        'miniscript.runFile',
        async () => {

			if (protocol.executionState === ExecutionState.Running) {
                vscode.window.showWarningMessage('MiniScript is already running.');
                return;
			}
			
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

			protocol.startExecution();
			
            // Spawn the MiniScript runner process
            const child = cp.spawn(
                runnerPath,								// executable name
                ['--scriptPath', document.fileName],    // arguments
                { cwd: path.dirname(document.fileName) }
            );

            // Capture stdout
            let stdoutBuffer = '';

            child.stdout.on('data', (data) =>
                protocol.handleStdoutChunk(data)
            );

            // Capture stderr
            child.stderr.on('data', (data) =>
                protocol.handleStderrChunk(data)
            );

            // Process exit handling
           child.on('close', (code) =>
                protocol.finishExecution(code ?? undefined)
            );

            child.on('error', (err) => {
                protocol.finishExecution();
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