namespace MiniScriptCli;

internal sealed class MiniScriptDiagnostic
{
	public required string Uri { get; init; }
	public int Line { get; init; }
	public int Column { get; init; }
	public MiniScriptSeverity Severity { get; init; }
	public required string Message { get; init; }
}
