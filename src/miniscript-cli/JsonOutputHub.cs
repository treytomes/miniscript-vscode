using System.Text.Json;

namespace MiniScriptCli;

sealed class JsonOutputHub
{
	#region Constants

	private static readonly JsonSerializerOptions JSON_OPTIONS = new() { WriteIndented = false };

	#endregion

	#region Methods

	public void Stdout(string text) => Emit("stdout", text);
	public void Implicit(string text) => Emit("implicit", text);
	public void Error(string text) => Emit("error", text);
	public void Exit(int code) => Emit("exit", code);

	public void Diagnostic(string file, int line, int column, string severity, string message)
	{
		Emit(new
		{
			type = "diagnostic",
			file,
			line,
			column,
			severity,
			message
		});
	}

	public void Emit(string type, object payload)
	{
		object message = type switch
		{
			"exit" => new { type, code = payload },
			_ => new { type, text = payload }
		};

		Emit(message);
	}

	public void Emit(object payload)
	{
		Console.Out.WriteLine(JsonSerializer.Serialize(payload, JSON_OPTIONS));
		Console.Out.Flush();
	}

	#endregion
}