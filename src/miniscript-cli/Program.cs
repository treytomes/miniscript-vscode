using Miniscript;

namespace MiniScriptCli;

class Program
{
    static int Main(string[] args)
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

        string source = File.ReadAllText(scriptPath);

        // Create interpreter
        var interpreter = new Interpreter();

		var standardOutputWriter = Console.Out; // new StringWriter();
		var implicitOutputWriter = Console.Out; // new StringWriter();
		var errorOutputWriter = Console.Error; // new StringWriter();

        // Attach output capture
		interpreter.standardOutput = (text, newline) =>
		{
			if (newline)
			{
				standardOutputWriter.WriteLine(text);
			}
			else
			{
				standardOutputWriter.Write(text);
			}
		};

		interpreter.implicitOutput = (text, newline) =>
		{
			if (newline)
			{
				implicitOutputWriter.WriteLine(text);
			}
			else
			{
				implicitOutputWriter.Write(text);
			}
		};

		interpreter.errorOutput = (text, newline) =>
		{
			if (newline)
			{
				errorOutputWriter.WriteLine(text);
			}
			else
			{
				errorOutputWriter.Write(text);
			}
		};

        // (Optional) Attach host data / context
        // interpreter.hostData = new WorldScriptContext(...);

		interpreter.Reset(source);
        interpreter.Compile();
		// if (interpreter.NeedMoreInput())
		// {
		// 	interpreter.errorOutput?.Invoke("Script error.", true);
		// }
		interpreter.RunUntilDone();

        // // Emit structured output (v0: plain text)
        // Console.Write(interpreter.standardOutput.ToString());

        // if (interpreter.errorOutput.ToString().Length > 0)
        // {
        //     Console.Error.Write(interpreter.errorOutput.ToString());
        //     return 2;
        // }

        return 0;
    }
}