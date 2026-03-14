using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Miniscript;
using System.CommandLine;
using System.Text.RegularExpressions;

namespace MiniScriptCli;

class Program
{
	static async Task<int> Main(string[] args)
	{
		var scriptPathOption = new Option<string>(
			name: "--scriptPath",
			description: "Path to the script source."
		);

		var configFileOption = new Option<string>(
			name: "--config",
			description: "Path to the configuration file",
			getDefaultValue: () => "appsettings.json");

		var debugOption = new Option<bool>(
			name: "--debug",
			description: "Enable debug mode");

		var root = new RootCommand("MiniScript VS.Code CLI");
		root.AddOption(scriptPathOption);
		root.AddOption(configFileOption);
		root.AddOption(debugOption);

		root.SetHandler(async (scriptPath, configFile, debug) =>
		{
			var props = new CommandLineProps
			{
				ScriptPath = scriptPath,
				ConfigFile = configFile,
				Debug = debug,
			};

			using var host = CreateHostBuilder(props).Build();
			var logger = host.Services.GetRequiredService<ILogger<Program>>();
			var cts = new CancellationTokenSource();
			var ct = cts.Token;

			Console.CancelKeyPress += (sender, e) =>
			{
				e.Cancel = true;        // prevent hard process kill
				cts.Cancel();           // signal kernel shutdown
			};

			await StartAsync(props, cts.Token);
		}, scriptPathOption, configFileOption, debugOption);

		return await root.InvokeAsync(args);
	}

	private static async Task<int> StartAsync(CommandLineProps props, CancellationToken cancellationToken)
	{
		await Task.Yield();
		var output = new JsonOutputHub();

		try
		{
			if (string.IsNullOrWhiteSpace(props.ScriptPath))
			{
				Console.Error.WriteLine("No script file provided.");
				return 1;
			}

			if (!File.Exists(props.ScriptPath))
			{
				Console.Error.WriteLine($"File not found: {props.ScriptPath}");
				return 1;
			}

			var source = File.ReadAllText(props.ScriptPath);

			var interpreter = new Interpreter();
			var hasError = false;

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
				hasError = true;
				if (newline) text = string.Concat(text, Environment.NewLine);
				output.Error(text);

				var stack = interpreter?.vm?.GetStack();
				if (stack != null && stack.Count > 0)
				{
					output.Stdout("\n");
					output.Stdout("Call stack:\n");
					for (var n = 0; n < stack.Count; n++)
					{
						var loc = stack[n];
						var context = loc?.context ?? props.ScriptPath;
						var lineNum = loc?.lineNum ?? 0;
						output.Stdout($"{n}. {context} line {lineNum}\n");
						output.Diagnostic(
							context,
							lineNum,
							0,
							cancellationToken.IsCancellationRequested ? "hint" : "error",
							"Stack frame (most recent call)"
						);
					}
				}
				else
				{
					// Compile error.  No stack trace.  Try to parse the text.
					var match = Regex.Match(text, @"\A(?<msg>.*)\s+\[line\s+(?<lineNo>\d+)\]\Z", RegexOptions.Multiline);
					if (match.Success)
					{
						if (int.TryParse(match.Groups["lineNo"].Value, out var lineNo))
						{
							output.Diagnostic(props.ScriptPath, lineNo, 0, "error", match.Groups["msg"].Value);
						}
						else
						{
							output.Diagnostic(props.ScriptPath, 0, 0, "error", match.Groups["msg"].Value);
						}
					}
				}
			};

			// Future extension point
			// interpreter.hostData = new MiniScriptHostContext(...);

			output.Emit(new { type = "diagnostics.clear" });
			interpreter.Reset(source);
			interpreter.Compile();

			if (!hasError)
			{
				try
				{
					while (interpreter.Running())
					{
						interpreter.RunUntilDone(0.03f);
						cancellationToken.ThrowIfCancellationRequested();
					}
				}
				catch (OperationCanceledException)
				{
					interpreter.errorOutput?.Invoke("Operation cancelled.", true);
					interpreter.Stop();
					output.Emit(new { type = "cancelled" });
				}
			}

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

	private static IHostBuilder CreateHostBuilder(CommandLineProps props)
	{
		return Host.CreateDefaultBuilder()
			.ConfigureAppConfiguration((ctx, config) => ConfigureAppConfiguration(config, props))
			.ConfigureLogging((ctx, logging) => logging.ConfigureCli(ctx))
			.ConfigureServices((ctx, services) => services.ConfigureCli(ctx));
	}

	private static void ConfigureAppConfiguration(IConfigurationBuilder config, CommandLineProps props)
	{
		config.Sources.Clear();
		config.SetBasePath(AppContext.BaseDirectory);

		config.AddJsonFile(
			props.ConfigFile,
			optional: false,
			reloadOnChange: false);

		var overrides = new Dictionary<string, string?>
		{
			["Debug"] = props.Debug.ToString()
		};

		config.AddInMemoryCollection(overrides);
	}
}