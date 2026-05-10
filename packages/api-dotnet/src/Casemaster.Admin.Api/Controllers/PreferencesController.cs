using Microsoft.AspNetCore.Mvc;
using Casemaster.Admin.Api.DataProvider;

namespace Casemaster.Admin.Api.Controllers;

[ApiController]
[Route("api/v1/preferences/{*scope}")]
public sealed class PreferencesController : ControllerBase
{
    private readonly IDataProvider _provider;
    public PreferencesController(IDataProvider provider) => _provider = provider;

    [HttpGet]
    public async Task<IActionResult> Get([FromRoute] string scope)
    {
        var v = await _provider.GetPreferencesAsync(scope, Request.Headers.Cookie.ToString());
        return Ok(new { scope, value = v });
    }

    public sealed record PutBody(object? Value);

    [HttpPut]
    public async Task<IActionResult> Put([FromRoute] string scope, [FromBody] PutBody body)
    {
        await _provider.PutPreferencesAsync(scope, body.Value, Request.Headers.Cookie.ToString());
        return Ok(new { scope, value = body.Value });
    }
}
