using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace MiniScriptCli;

internal static class LoggingBuilderExtensions
{
	public static void ConfigureCli(this ILoggingBuilder logging, HostBuilderContext ctx)
	{
		logging.ClearProviders();

		logging.AddConsole();

		var debug = ctx.Configuration.GetValue<bool>("Debug");
		var minLevel = debug ? LogLevel.Trace : LogLevel.Information;
		logging.SetMinimumLevel(minLevel);
	}
}