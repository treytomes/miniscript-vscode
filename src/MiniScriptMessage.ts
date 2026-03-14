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
	| { type: 'cancelled' }
    | { type: 'exit'; code: number };

export default MiniScriptMessage;
