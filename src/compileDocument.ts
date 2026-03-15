// compileDocument.ts

import * as cp from 'child_process';
import * as vscode from 'vscode';
import { MiniScriptProtocol } from './MiniScriptProtocol';
import path from 'path';
import ExecutionState from './ExecutionState';

function compileDocument(
    document: vscode.TextDocument,
    protocol: MiniScriptProtocol,
    runnerPath: string
) {
    if (path.extname(document.fileName) !== '.ms') {
        return;
    }

    // Do not interrupt a running script
    if (protocol.executionState === ExecutionState.Running) {
        return;
    }

	protocol.beginCompilePass();

    const child = cp.spawn(
        runnerPath,
        [
            '--scriptPath',
            document.fileName,
            '--compileOnly'
        ],
        { cwd: path.dirname(document.fileName) }
    );

    child.stdout?.on('data', (data) =>
        protocol.handleStdoutChunk(data)
    );

    child.stderr?.on('data', (data) =>
        protocol.handleStderrChunk(data)
    );

    child.on('error', (err) => {
        console.error('MiniScript compile failed:', err);
    });
}

export default compileDocument;
