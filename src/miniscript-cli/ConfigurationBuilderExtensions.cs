using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;

namespace MiniScriptCli;

internal static class ConfigurationBuilderExtensions
{
	public static void ConfigureAppConfiguration(this IConfigurationBuilder config, HostBuilderContext ctx, CommandLineProps props)
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