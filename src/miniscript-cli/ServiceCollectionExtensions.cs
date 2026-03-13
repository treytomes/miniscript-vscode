using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace MiniScriptCli;

internal static class ServiceCollectionExtensions
{
	public static void ConfigureCli(this IServiceCollection services, HostBuilderContext ctx)
	{
		services.Configure<AppSettings>(ctx.Configuration);
		services.AddSingleton(sp => sp.GetRequiredService<IOptions<AppSettings>>().Value);
	}
}