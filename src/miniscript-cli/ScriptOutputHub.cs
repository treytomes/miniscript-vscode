using Miniscript;
using System.Text.RegularExpressions;

namespace MiniScriptCli;

internal class ScriptOutputHub
{
	#region Constants

	private static readonly Regex COMPILE_ERROR_REGEX = new Regex(@"(?<msg>.*)\s+\[line\s+(?<lineNo>\d+)\]", RegexOptions.Multiline | RegexOptions.Compiled);

	#endregion

	#region Fields

	private readonly JsonOutputHub _output = new();
	private readonly Interpreter _interpreter;
	private readonly string _scriptPath;
	private readonly CancellationToken _cancellationToken;

	#endregion

	#region Constructors

	public ScriptOutputHub(Interpreter interpreter, string scriptPath, CancellationToken cancellationToken)
	{
		_interpreter = interpreter;
		_interpreter.standardOutput = ProcessStandardOutput;
		_interpreter.implicitOutput = ProcessImplicitOutput;
		_interpreter.errorOutput = ProcessErrorOutput;

		_scriptPath = scriptPath;

		_cancellationToken = cancellationToken;
	}

	#endregion

	#region Properties

	public JsonOutputHub Output => _output;
	public bool HasError { get; private set; } = false;

	#endregion

	#region Methods

	private void ProcessStandardOutput(string text, bool newline)
	{
		if (newline) text = string.Concat(text, Environment.NewLine);
		_output.Stdout(text);
	}

	private void ProcessImplicitOutput(string text, bool newline)
	{
		if (newline) text = string.Concat(text, Environment.NewLine);
		_output.Implicit(text);
	}

	private void ProcessErrorOutput(string text, bool newline)
	{
		MiniScriptErrorKind? errorKind = null;

		HasError = true;
		if (errorKind == null)
		{
			errorKind = _interpreter.Running()
				? MiniScriptErrorKind.Runtime
				: MiniScriptErrorKind.Compile;
		}

		var prefix = errorKind switch
		{
			MiniScriptErrorKind.Compile => "[Compile error] ",
			MiniScriptErrorKind.Runtime => "[Runtime error] ",
			MiniScriptErrorKind.Cancelled => "[Cancelled] ",
			_ => ""
		};

		if (newline) text = string.Concat(text, Environment.NewLine);
		_output.Error(text);

		var stack = _interpreter?.vm?.GetStack();
		if (stack != null && stack.Count > 0)
		{
			_output.Stdout("\n");
			_output.Stdout("Call stack:\n");
			for (var n = 0; n < stack.Count; n++)
			{
				var loc = stack[n];
				var context = loc?.context ?? _scriptPath;
				var lineNum = loc?.lineNum ?? 0;

				var severity = "info";
				if (_cancellationToken.IsCancellationRequested)
				{
					severity = "hint";
				}
				else if (n == 0)
				{
					severity = "error";
				}

				var msg = n == 0
					? "Error occurred here"
					: "Caller frame";

				_output.Stdout($"{n}. {context} line {lineNum}\n");
				_output.Diagnostic(
					context,
					lineNum,
					0,
					severity,
					prefix + msg
				);
			}
		}
		else
		{
			// Compile error.  No stack trace.  Try to parse the text.
			var match = COMPILE_ERROR_REGEX.Match(text);
			if (match.Success)
			{
				var msg = match.Groups["msg"].Value.Replace(Environment.NewLine, "\\n");
				if (int.TryParse(match.Groups["lineNo"].Value, out var lineNo))
				{
					_output.Diagnostic(_scriptPath, lineNo, 0, "error", prefix + msg);
				}
				else
				{
					_output.Diagnostic(_scriptPath, 0, 0, "error", prefix + msg);
				}
			}
			else
			{
				_output.Diagnostic(_scriptPath, 0, 0, "error", prefix + text);
			}
		}
	}

	#endregion
}

internal enum MiniScriptErrorKind
{
	Compile,
	Runtime,
	Cancelled
}