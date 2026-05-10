using Microsoft.AspNetCore.Mvc;
using Casemaster.Admin.Api.DataProvider;

namespace Casemaster.Admin.Api.Controllers;

[ApiController]
[Route("api/v1/bo/{*boPath}")]
public sealed class BoController : ControllerBase
{
    private readonly IDataProvider _provider;
    public BoController(IDataProvider provider) => _provider = provider;

    [HttpGet("list")]
    public async Task<IActionResult> List([FromRoute] string boPath, [FromQuery] string group = "list",
        [FromQuery] int page = 1, [FromQuery] int pageSize = 50, [FromQuery] string? sort = null, [FromQuery] string? q = null)
    {
        var bo = boPath[..boPath.LastIndexOf("/list")];
        var filters = new Dictionary<string, IReadOnlyList<string>>();
        foreach (var (k, v) in Request.Query)
        {
            if (k.StartsWith("filter[") && k.EndsWith("]"))
                filters[k[7..^1]] = v.ToArray();
        }
        var r = await _provider.ListBoAsync(new ListArgs(bo, group, Math.Max(1, page), Math.Clamp(pageSize, 1, 500), sort, q, filters));
        return Ok(new { rows = r.Rows, total = r.Total, page, pageSize, group });
    }

    [HttpGet("get")]
    public async Task<IActionResult> Get([FromRoute] string boPath, [FromQuery] string id)
    {
        var bo = boPath[..boPath.LastIndexOf("/get")];
        var r = await _provider.GetBoAsync(bo, id);
        return Ok(new { row = r.Row, fkLabels = r.FkLabels });
    }

    [HttpPost("save")]
    public async Task<IActionResult> Save([FromRoute] string boPath, [FromBody] Dictionary<string, object?> data)
    {
        var bo = boPath[..boPath.LastIndexOf("/save")];
        var r = await _provider.SaveBoAsync(bo, data);
        return Ok(new { row = r.Row, version = r.Version });
    }

    [HttpPost("delete")]
    public async Task<IActionResult> Delete([FromRoute] string boPath, [FromBody] DeleteBody body)
    {
        var bo = boPath[..boPath.LastIndexOf("/delete")];
        await _provider.DeleteBoAsync(bo, body.Id);
        return Ok(new { ok = true });
    }

    public sealed record DeleteBody(object Id);
}
