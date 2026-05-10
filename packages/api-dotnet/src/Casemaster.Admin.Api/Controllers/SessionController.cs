using Microsoft.AspNetCore.Mvc;
using Casemaster.Admin.Api.DataProvider;

namespace Casemaster.Admin.Api.Controllers;

[ApiController]
[Route("api/v1/session")]
public sealed class SessionController : ControllerBase
{
    private readonly IDataProvider _provider;
    public SessionController(IDataProvider provider) => _provider = provider;

    [HttpGet("me")]
    public async Task<IActionResult> Me()
    {
        var r = await _provider.SessionMeAsync(Request.Headers.Cookie.ToString());
        return Ok(new { authenticated = r.Authenticated, user = r.User, perms = r.Perms, csrf = r.Csrf });
    }

    public sealed record LoginBody(string Email, string Password);

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginBody body)
    {
        var r = await _provider.SessionLoginAsync(body.Email, body.Password);
        if (!r.Authenticated) return Unauthorized(new { ok = false, error = "invalid credentials" });
        return Ok(new { ok = true, user = r.User, csrf = r.Csrf });
    }

    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        await _provider.SessionLogoutAsync(Request.Headers.Cookie.ToString());
        return Ok(new { ok = true });
    }
}
