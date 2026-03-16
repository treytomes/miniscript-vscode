namespace MiniScriptCli;

internal sealed class CompileResult
{
	public required IReadOnlyList<MiniScriptDiagnostic> Diagnostics { get; init; }
	public bool HasErrors { get; init; }
}
