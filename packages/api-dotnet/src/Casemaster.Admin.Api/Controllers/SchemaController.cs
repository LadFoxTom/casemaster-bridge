using Microsoft.AspNetCore.Mvc;
using Casemaster.Admin.Api.DataProvider;

namespace Casemaster.Admin.Api.Controllers;

[ApiController]
[Route("api/v1/schema")]
public sealed class SchemaController : ControllerBase
{
    private readonly IDataProvider _provider;
    public SchemaController(IDataProvider provider) => _provider = provider;

    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var d = await _provider.DescribeAsync();
        return Ok(new
        {
            version = 1,
            appName = d.AppName,
            bos     = d.Bos,
            pages   = d.Pages,
            navigation = d.Navigation,
            capabilities = d.Capabilities,
        });
    }
}
