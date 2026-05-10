using Microsoft.AspNetCore.Mvc;
using Casemaster.Admin.Api.DataProvider;

namespace Casemaster.Admin.Api.Controllers;

[ApiController]
[Route("api/v1/page/{*tail}")]
public sealed class PageActionController : ControllerBase
{
    private readonly IDataProvider _provider;
    public PageActionController(IDataProvider provider) => _provider = provider;

    [HttpPost]
    public async Task<IActionResult> Run([FromRoute] string tail, [FromBody] Dictionary<string, object?>? body)
    {
        var lastSlash = tail.LastIndexOf('/');
        if (lastSlash < 0) return BadRequest(new { ok = false, error = "missing fn" });
        var path = tail[..lastSlash];
        var fn   = tail[(lastSlash + 1)..];
        var r = await _provider.CallPageActionAsync(path, fn, body ?? new());
        if (!r.Ok) return BadRequest(new { ok = false, error = r.Error });
        return Ok(new { ok = true, outputs = r.Outputs, message = r.Message });
    }
}
