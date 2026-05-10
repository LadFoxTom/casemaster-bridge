// SSE stream of BO change events. Mirrors writeSseStream in TS.
// In .NET we set headers, write the SSE prelude, and pump events from
// the IDataProvider's broadcaster (when implemented) until the client
// disconnects.

using System.Text;
using Microsoft.AspNetCore.Mvc;
using Casemaster.Admin.Api.DataProvider;

namespace Casemaster.Admin.Api.Controllers;

[ApiController]
[Route("api/v1/stream/{*bo}")]
public sealed class StreamController : ControllerBase
{
    [HttpGet]
    public async Task Stream([FromRoute] string bo, CancellationToken ct)
    {
        Response.StatusCode = 200;
        Response.Headers.Append("Content-Type",   "text/event-stream");
        Response.Headers.Append("Cache-Control",  "no-cache, no-transform");
        Response.Headers.Append("Connection",     "keep-alive");
        Response.Headers.Append("X-Accel-Buffering", "no");

        await Response.WriteAsync($": connected to {bo}\n\n", ct);
        await Response.Body.FlushAsync(ct);

        // Heartbeat every 25s.
        try
        {
            while (!ct.IsCancellationRequested)
            {
                await Task.Delay(25_000, ct);
                await Response.WriteAsync(": ping\n\n", ct);
                await Response.Body.FlushAsync(ct);
            }
        }
        catch (TaskCanceledException) { /* client disconnected */ }
    }
}
