import * as vscode from 'vscode';
import ExecutionState from './ExecutionState';

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

export class MiniScriptProtocol {
    private stdoutBuffer = '';
    private state: ExecutionState = ExecutionState.Idle;

    constructor(
        private readonly output: vscode.OutputChannel,
        private readonly diagnostics: vscode.DiagnosticCollection
    ) {}

    startExecution() {
        this.state = ExecutionState.Running;
        this.diagnostics.clear();
    }

    finishExecution(code?: number) {
        this.state = ExecutionState.Finished;
        if (code !== undefined) {
            this.output.appendLine('');
            this.output.appendLine(`Process exited with code ${code}`);
        }
    }

    get executionState() {
        return this.state;
    }

    handleStdoutChunk(chunk: Buffer | string) {
        this.stdoutBuffer += chunk.toString();

        let newlineIndex;
        while ((newlineIndex = this.stdoutBuffer.indexOf('\n')) >= 0) {
            const line = this.stdoutBuffer.slice(0, newlineIndex).trim();
            this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);

            if (!line) {continue;}

            try {
                const msg = JSON.parse(line) as MiniScriptMessage;
                this.handleMessage(msg);
            } catch {
                this.output.appendLine(`[protocol error] ${line}`);
            }
        }
    }

    handleStderrChunk(chunk: Buffer | string) {
        this.output.appendLine(`[runner stderr] ${chunk.toString()}`);
    }

    private handleMessage(msg: MiniScriptMessage) {
        switch (msg.type) {
            case 'stdout':
                this.output.append(msg.text);
                break;

            case 'implicit':
                this.output.appendLine(`» ${msg.text}`);
                break;

            case 'error':
                this.output.append(`✖ ${msg.text}`);
                break;

            case 'diagnostics.clear':
                this.diagnostics.clear();
                break;

            case 'diagnostic':
                this.addDiagnostic(msg);
                break;

            case 'exit':
                this.finishExecution(msg.code);
                break;

            default:
                this.output.appendLine(
                    `[unknown message] ${JSON.stringify(msg)}`
                );
        }
    }

    private addDiagnostic(
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

        const existing = this.diagnostics.get(uri) ?? [];
        this.diagnostics.set(uri, [...existing, diagnostic]);
    }
}