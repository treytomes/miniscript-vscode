namespace MiniScriptCli;

internal interface IMiniScriptDiagnosticSink
{
	void Clear();
	void Report(MiniScriptDiagnostic diagnostic);
}
