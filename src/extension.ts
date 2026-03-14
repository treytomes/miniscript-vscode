// extension.ts
// Entry point for the MiniScript Runner VS Code extension

import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import { MiniScriptProtocol } from './MiniScriptProtocol';
import ExecutionState from './ExecutionState';
import setRunningState from './setRunningState';

let runningProcess: cp.ChildProcess | undefined;

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

	const statusBarItem = vscode.window.createStatusBarItem(
		vscode.StatusBarAlignment.Left,
		100
	);

	statusBarItem.command = 'miniscript.cancelRun';
	context.subscriptions.push(statusBarItem);

	function showIdleStatus() {
		statusBarItem.text = 'MiniScript: Idle';
		statusBarItem.tooltip = 'Ready to run MiniScript';
		statusBarItem.command = 'miniscript.runFile';
		statusBarItem.show();
	}

	function showRunningStatus() {
		statusBarItem.text = '$(sync~spin) MiniScript: Running';
		statusBarItem.tooltip = 'Click to cancel MiniScript execution';
		statusBarItem.command = 'miniscript.cancelRun';
		statusBarItem.show();
	}
	
	const protocol = new MiniScriptProtocol(
		outputChannel,
		diagnostics,
		(state) => {
			switch (state) {
				case ExecutionState.Running:
					setRunningState(true);
					showRunningStatus();
					break;

				case ExecutionState.Finished:
				case ExecutionState.Idle:
					setRunningState(false);
					showIdleStatus();
					break;
			}
		}
	);

	showIdleStatus();
	setRunningState(false);

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
            runningProcess = cp.spawn(
                runnerPath,								// executable name
                ['--scriptPath', document.fileName],    // arguments
                { cwd: path.dirname(document.fileName) }
			);
			const child = runningProcess;
			child.stdout?.on('data', (data) =>
				protocol.handleStdoutChunk(data)
			);

			// Capture stderr
			child.stderr?.on('data', (data) =>
				protocol.handleStderrChunk(data)
			);

			// Process exit handling
			child.on('close', (code) => {
				runningProcess = undefined;
				protocol.finishExecution(code ?? undefined);
			});

			child.on('error', (err) => {
    			runningProcess = undefined;
				protocol.finishExecution();
				vscode.window.showErrorMessage(
					`Failed to start MiniScript runner: ${err.message}`
				);
			});
        }
    );

	const cancelRunCommand = vscode.commands.registerCommand(
		'miniscript.cancelRun',
		() => {
			if (!runningProcess) {
				vscode.window.showInformationMessage(
					'No MiniScript execution is running.'
				);
				return;
			}

			if (protocol.executionState !== ExecutionState.Running) {
				return;
			}

			// Politely ask the process to stop
			runningProcess.kill('SIGINT');

			// Fallback hard kill after a grace period
			setTimeout(() => {
				if (runningProcess) {
					runningProcess.kill('SIGKILL');
					runningProcess = undefined;
				}
			}, 1000);
		}
	);
	
    context.subscriptions.push(runFileCommand, cancelRunCommand, outputChannel);
}

/**
 * Called when the extension is deactivated.
 */
export function deactivate() {}