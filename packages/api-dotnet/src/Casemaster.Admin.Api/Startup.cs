// Plugin entry point loaded by CaseMaster.Web.exe's plugin loader.
// Registers our controllers under /api/v1/* without disturbing the
// existing /page/* routes.

using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Casemaster.Admin.Api.DataProvider;

namespace Casemaster.Admin.Api;

public static class Startup
{
    public static IServiceCollection AddCmsAdmin(this IServiceCollection services)
    {
        services.AddSingleton<IDataProvider, CaseMasterDataProvider>();
        services.AddControllers()
                .AddApplicationPart(typeof(Startup).Assembly);
        return services;
    }

    public static IEndpointRouteBuilder MapCmsAdmin(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapControllers();
        return endpoints;
    }

    /// <summary>
    /// Convenience wrapper for hosts that want to wire everything in one call.
    /// Usage from CaseMaster.Web.exe's host setup:
    ///   app.UseCmsAdmin("/api/v1");
    /// </summary>
    public static IApplicationBuilder UseCmsAdmin(this IApplicationBuilder app, string basePath = "/api/v1")
    {
        app.UseRouting();
        app.UseEndpoints(e => e.MapCmsAdmin());
        return app;
    }
}
