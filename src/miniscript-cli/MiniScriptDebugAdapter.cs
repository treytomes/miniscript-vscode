using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Miniscript;

namespace MiniScriptCli;

public sealed class MiniScriptDebugAdapter
{
	private readonly Stream _input;
	private readonly Stream _output;
	private readonly StreamReader _reader;
	private readonly StreamWriter _writer;
	private string? _scriptPath;

	private int _seq = 1;
	private bool _launched;

	private Interpreter? _interpreter;
	private CancellationTokenSource? _executionCts;

	public MiniScriptDebugAdapter(Stream input, Stream output)
	{
		_input = input;
		_output = output;
		_reader = new StreamReader(_input, Encoding.UTF8);
		_writer = new StreamWriter(_output, Encoding.UTF8)
		{
			AutoFlush = true
		};
	}

	public async Task RunAsync()
	{
		while (true)
		{
			var message = await ReadMessageAsync();
			if (message == null)
				break;

			await DispatchAsync(message);
		}
	}

	// ----------------------------
	// Message handling
	// ----------------------------

	private async Task DispatchAsync(JsonObject request)
	{
		var command = request["command"]?.GetValue<string>();
		var seq = request["seq"]?.GetValue<int>() ?? 0;

		switch (command)
		{
			case "initialize":
				await SendResponseAsync(seq, command, new JsonObject
				{
					["supportsConfigurationDoneRequest"] = true
				});

				await SendEventAsync("initialized");
				break;

			case "launch":
				{
					var args = request["arguments"]?.AsObject();
					_scriptPath = args?["program"]?.GetValue<string>();

					if (string.IsNullOrWhiteSpace(_scriptPath))
					{
						await SendErrorResponseAsync(seq, command, "No program specified.");
						return;
					}

					await SendResponseAsync(seq, command);
					break;
				}

			case "configurationDone":
				{
					await SendResponseAsync(seq, command);
					StartInterpreter(_scriptPath);
					break;
				}

			case "disconnect":
				await SendResponseAsync(seq, command);
				Environment.Exit(0);
				break;

			default:
				// Unknown command — respond but do nothing
				await SendResponseAsync(seq, command);
				break;
		}
	}

	private async Task SendErrorResponseAsync(
		int requestSeq,
		string? command,
		string message
	)
	{
		var response = new JsonObject
		{
			["type"] = "response",
			["seq"] = _seq++,
			["request_seq"] = requestSeq,
			["success"] = false,
			["command"] = command,
			["message"] = message
		};

		await SendMessageAsync(response);
	}

	private void StartInterpreter(string? scriptPath)
	{
		if (string.IsNullOrWhiteSpace(scriptPath))
			return;

		if (!File.Exists(scriptPath))
		{
			_ = SendEventAsync(
				"output",
				new JsonObject
				{
					["category"] = "stderr",
					["output"] = $"File not found: {scriptPath}\n"
				}
			);
			return;
		}

		var source = File.ReadAllText(scriptPath);

		_interpreter = new Interpreter();
		_interpreter.Reset(source);
		_interpreter.Compile();

		_executionCts = new CancellationTokenSource();

		// Notify VS Code that execution is paused on entry
		_ = SendEventAsync(
			"stopped",
			new JsonObject
			{
				["reason"] = "entry",
				["threadId"] = 1
			}
		);
	}

	// ----------------------------
	// DAP wire protocol
	// ----------------------------

	private async Task<JsonObject?> ReadMessageAsync()
	{
		string? line;
		int contentLength = 0;

		// Read headers
		while (!string.IsNullOrEmpty(line = await _reader.ReadLineAsync()))
		{
			if (line.StartsWith("Content-Length:", StringComparison.OrdinalIgnoreCase))
			{
				contentLength = int.Parse(line.Substring("Content-Length:".Length).Trim());
			}
		}

		if (contentLength == 0)
			return null;

		// Read JSON payload
		var buffer = new char[contentLength];
		int read = 0;
		while (read < contentLength)
		{
			read += await _reader.ReadAsync(buffer, read, contentLength - read);
		}

		var json = new string(buffer);
		return JsonNode.Parse(json)?.AsObject();
	}

	private async Task SendResponseAsync(int requestSeq, string? command, JsonObject? body = null)
	{
		var response = new JsonObject
		{
			["type"] = "response",
			["seq"] = _seq++,
			["request_seq"] = requestSeq,
			["success"] = true,
			["command"] = command
		};

		if (body != null)
			response["body"] = body;

		await SendMessageAsync(response);
	}

	private async Task SendEventAsync(string eventName, JsonObject? body = null)
	{
		var evt = new JsonObject
		{
			["type"] = "event",
			["seq"] = _seq++,
			["event"] = eventName
		};

		if (body != null)
			evt["body"] = body;

		await SendMessageAsync(evt);
	}

	private async Task SendMessageAsync(JsonObject message)
	{
		var json = message.ToJsonString();
		var bytes = Encoding.UTF8.GetBytes(json);

		await _writer.WriteAsync($"Content-Length: {bytes.Length}\r\n\r\n");
		await _writer.WriteAsync(json);
	}
}