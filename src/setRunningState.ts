import * as vscode from 'vscode';

async function setRunningState(isRunning: boolean) {
	await vscode.commands.executeCommand(
		'setContext',
		'miniscript.isRunning',
		isRunning
	);
}

export default setRunningState;