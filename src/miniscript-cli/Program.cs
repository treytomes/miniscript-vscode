using Miniscript;
using MiniScriptCli;

class Program
{
	static int Main(string[] args)
	{
		var output = new JsonOutputHub();

		try
		{
			if (args.Length == 0)
			{
				Console.Error.WriteLine("No script file provided.");
				return 1;
			}

			var scriptPath = args[0];
			if (!File.Exists(scriptPath))
			{
				Console.Error.WriteLine($"File not found: {scriptPath}");
				return 1;
			}

			var source = File.ReadAllText(scriptPath);

			var interpreter = new Interpreter();

			// Centralized output wiring
			interpreter.standardOutput = (text, newline) =>
			{
				if (newline) text = string.Concat(text, Environment.NewLine);
				output.Stdout(text);
			};

			interpreter.implicitOutput = (text, newline) =>
			{
				if (newline) text = string.Concat(text, Environment.NewLine);
				output.Implicit(text);
			};

			interpreter.errorOutput = (text, newline) =>
			{
				if (newline) text = string.Concat(text, Environment.NewLine);
				output.Error(text);

				List<SourceLoc> stack = interpreter.vm.GetStack();
				foreach (var loc in stack)
				{
					output.Diagnostic(loc.context ?? scriptPath, loc.lineNum, 0, "error", text);
				}
			};

			// Future extension point
			// interpreter.hostData = new MiniScriptHostContext(...);

			output.Emit(new { type = "diagnostics.clear" });
			interpreter.Reset(source);
			interpreter.Compile();
			interpreter.RunUntilDone();

			output.Exit(0);
			return 0;
		}
		catch (Exception ex)
		{
			// Host-level failure (not a script error)
			Console.Error.WriteLine(ex.ToString());
			return 2;
		}
	}
}