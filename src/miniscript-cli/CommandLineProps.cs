namespace MiniScriptCli;

internal record CommandLineProps
{
	public required string? ScriptPath { get; init; }
	public required bool CompileOnly { get; init; }
	public required string ConfigFile { get; init; }
	public bool Debug { get; init; } = false;
}