// Program.cs

using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Miniscript;
using System.CommandLine;

namespace MiniScriptCli;

internal class Program
{
	static async Task<int> Main(string[] args)
	{
		var scriptPathOption = new Option<string>(
			name: "--scriptPath",
			description: "Path to the script source."
		);

		var compileOnlyOption = new Option<bool>(
			name: "--compileOnly",
			description: "Compile the script without running it.",
			getDefaultValue: () => false
		);

		var configFileOption = new Option<string>(
			name: "--config",
			description: "Path to the configuration file",
			getDefaultValue: () => "appsettings.json");

		var debugOption = new Option<bool>(
			name: "--debug",
			description: "Enable the debug server"
		);

		var root = new RootCommand("MiniScript VS.Code CLI");
		root.AddOption(scriptPathOption);
		root.AddOption(compileOnlyOption);
		root.AddOption(configFileOption);
		root.AddOption(debugOption);

		root.SetHandler(async (scriptPath, compileOnly, configFile, debug) =>
		{
			var props = new CommandLineProps
			{
				ScriptPath = scriptPath,
				CompileOnly = compileOnly,
				ConfigFile = configFile,
				Debug = debug,
			};

			using var host = Host.CreateDefaultBuilder()
				.ConfigureAppConfiguration((ctx, config) => config.ConfigureAppConfiguration(ctx, props))
				.ConfigureLogging((ctx, logging) => logging.ConfigureCli(ctx))
				.ConfigureServices((ctx, services) => services.ConfigureCli(ctx))
				.Build();

			var logger = host.Services.GetRequiredService<ILogger<Program>>();
			var cts = new CancellationTokenSource();
			var ct = cts.Token;

			Console.CancelKeyPress += (sender, e) =>
			{
				e.Cancel = true;        // prevent hard process kill
				cts.Cancel();           // signal kernel shutdown
			};

			if (props.Debug)
			{
				await RunDebugAdapterAsync(props, cts.Token);
			}
			else
			{
				await StartAsync(props, cts.Token);
			}
		}, scriptPathOption, compileOnlyOption, configFileOption, debugOption);

		return await root.InvokeAsync(args);
	}

	private static async Task<int> RunDebugAdapterAsync(CommandLineProps props, CancellationToken cancellationToken)
	{
		var adapter = new MiniScriptDebugAdapter(
			Console.OpenStandardInput(),
			Console.OpenStandardOutput()
		);

		await adapter.RunAsync();
		return 0;
	}

	private static async Task<int> StartAsync(CommandLineProps props, CancellationToken cancellationToken)
	{
		await Task.Yield();

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
			var scriptOutputHub = new ScriptOutputHub(interpreter, props.ScriptPath, cancellationToken);

			scriptOutputHub.Output.Emit(new { type = "diagnostics.clear" });
			interpreter.Reset(source);
			interpreter.Compile();

			if (!scriptOutputHub.HasError && !props.CompileOnly)
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
					scriptOutputHub.Output.Emit(new { type = "cancelled" });
				}
			}

			scriptOutputHub.Output.Exit(0);
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