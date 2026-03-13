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

			var interpreter = new Interpreter
			{
				// Centralized output wiring
				standardOutput = (text, newline) =>
					{
						if (newline) text = string.Concat(text, Environment.NewLine);
						output.Stdout(text);
					},

				implicitOutput = (text, newline) =>
					{
						if (newline) text = string.Concat(text, Environment.NewLine);
						output.Implicit(text);
					},

				errorOutput = (text, newline) =>
					{
						if (newline) text = string.Concat(text, Environment.NewLine);
						output.Error(text);
					}
			};

			// Future extension point
			// interpreter.hostData = new MiniScriptHostContext(...);

			// TODO: "diagnostic" type output?
			// TODO: Custom intrinsics: "vscode.lob(text)", "vscode.workspaceRoot"
			// TODO: Execution options: timeout, step limit
			// TODO: Debugger protocol???

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