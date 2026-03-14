import path from 'path';
import * as vscode from 'vscode';

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

export default getRunnerPath;