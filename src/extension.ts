// extension.ts
// Entry point for the MiniScript Runner VS Code extension

import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import { MiniScriptProtocol } from './MiniScriptProtocol';
import ExecutionState from './ExecutionState';
import setRunningState from './setRunningState';
import getRunnerPath from './getRunnerPath';
import formatDuration from './formatDuration';
import compileDocument from './compileDocument';

let runningProcess: cp.ChildProcess | undefined;

/**
 * Called when the extension is activated.
 * Registers the MiniScript: Run File command.
 */
export function activate(context: vscode.ExtensionContext) {
	const runnerPath = getRunnerPath(context);
    console.log('MiniScript runner path:', runnerPath);

	let executionStartTime: number | undefined;
	let executionTimer: NodeJS.Timeout | undefined;
	let currentScriptName: string | undefined;
	
	const diagnostics = vscode.languages.createDiagnosticCollection('miniscript');
	context.subscriptions.push(diagnostics);
	
	context.subscriptions.push(
		vscode.languages.onDidChangeDiagnostics(() => {
			renderStatusBar(protocol.executionState);
		})
	);

	context.subscriptions.push(
		vscode.workspace.onDidSaveTextDocument((document) => {
			const config = vscode.workspace.getConfiguration('miniscript');
			if (!config.get<boolean>('compileOnSave')) {
				return;
			}
			compileDocument(document, protocol, runnerPath);
		}),
		vscode.workspace.onDidOpenTextDocument((document) => {
			const config = vscode.workspace.getConfiguration('miniscript');
			if (!config.get<boolean>('compileOnSave')) {
				return;
			}
			compileDocument(document, protocol, runnerPath);
		})
	);
	
    // Output channel for MiniScript execution results
	const outputChannel = vscode.window.createOutputChannel('MiniScript');

	const statusBarItem = vscode.window.createStatusBarItem(
		vscode.StatusBarAlignment.Left,
		100
	);

	statusBarItem.command = 'miniscript.cancelRun';
	context.subscriptions.push(statusBarItem);

	function getErrorCount(): number {
		let count = 0;
		for (const [, diags] of diagnostics) {
			count += diags.filter(
				d => d.severity === vscode.DiagnosticSeverity.Error
			).length;
		}
		return count;
	}
	
	function startExecutionTimer(update: () => void) {
		executionStartTime = Date.now();
		executionTimer = setInterval(update, 1000);
	}

	function stopExecutionTimer() {
		if (executionTimer) {
			clearInterval(executionTimer);
			executionTimer = undefined;
		}
		executionStartTime = undefined;
	}

	function renderStatusBar(state: ExecutionState) {
		const errorCount = getErrorCount();
		const errorPart = errorCount > 0 ? ` $(error) ${errorCount}` : '';

		if (state === ExecutionState.Running && executionStartTime !== undefined) {
			const elapsed = formatDuration(Date.now() - executionStartTime);
			statusBarItem.text = `$(sync~spin) ${currentScriptName ?? 'MiniScript'} · ${elapsed}${errorPart}`;
			statusBarItem.tooltip = 'Click to cancel MiniScript execution';
			statusBarItem.command = 'miniscript.cancelRun';
			statusBarItem.show();
			return;
		}

		// Idle / finished
		statusBarItem.text = `MiniScript${errorPart}`;
		statusBarItem.tooltip = 'Ready to run MiniScript';
		statusBarItem.command = 'miniscript.runFile';
		statusBarItem.show();
	}
	
	const protocol = new MiniScriptProtocol(
		outputChannel,
		diagnostics,
		(state) => {
			switch (state) {
				case ExecutionState.Running:
					setRunningState(true);
					startExecutionTimer(() => renderStatusBar(state));
					renderStatusBar(state);
					break;

				case ExecutionState.Finished:
				case ExecutionState.Idle:
					stopExecutionTimer();
					currentScriptName = undefined;
					setRunningState(false);
					renderStatusBar(state);
					break;
			}
		}
	);

	setRunningState(false);
	renderStatusBar(ExecutionState.Idle);

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

			currentScriptName = path.basename(document.fileName);
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

	const config = vscode.workspace.getConfiguration('miniscript');
	if (config.get<boolean>('compileOnSave')) {
		for (const document of vscode.workspace.textDocuments) {
			if (path.extname(document.fileName) === '.ms') {
				compileDocument(document, protocol, runnerPath);
			}
		}
	}
}

/**
 * Called when the extension is deactivated.
 */
export function deactivate() {}