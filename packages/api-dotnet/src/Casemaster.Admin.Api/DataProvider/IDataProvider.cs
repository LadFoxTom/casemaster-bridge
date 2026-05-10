// The DataProvider contract — mirrors packages/api-vercel/src/provider.ts
// line-for-line. Implementations bridge to Casemaster.dll internals.
//
// Naming and shapes match the TypeScript surface so the conformance test
// suite produces identical wire bytes.

using System.Collections.Generic;
using System.Threading.Tasks;

namespace Casemaster.Admin.Api.DataProvider;

public interface IDataProvider
{
    Task<DescribeResult> DescribeAsync();
    Task<ListResult>     ListBoAsync(ListArgs args);
    Task<GetResult>      GetBoAsync(string bo, object id);
    Task<SaveResult>     SaveBoAsync(string bo, IDictionary<string, object?> data);
    Task<bool>           DeleteBoAsync(string bo, object id);
    Task<PageActionResult> CallPageActionAsync(string pagePath, string fn, IDictionary<string, object?> parameters);
    Task<SessionResult>  SessionMeAsync(string? cookie);
    Task<SessionResult>  SessionLoginAsync(string email, string password);
    Task                 SessionLogoutAsync(string? cookie);
    Task<object?>        GetPreferencesAsync(string scope, string? cookie);
    Task                 PutPreferencesAsync(string scope, object? value, string? cookie);
}

public record DescribeResult(
    string AppName,
    IReadOnlyList<BoMeta> Bos,
    IReadOnlyList<PageMeta> Pages,
    IReadOnlyList<NavItem> Navigation,
    Capabilities Capabilities);

public record BoMeta(string Name, string? Label, string Table, string PrimaryKey, IReadOnlyList<BoAttr> Attributes, IDictionary<string, IReadOnlyList<string>> Groups);
public record BoAttr(string Name, string? Label, string Type, bool Required, bool ReadOnly, string? Fk, IReadOnlyList<string>? EnumValues);
public record PageMeta(string Path, string? Title, IReadOnlyList<string> Functions, string Shape, string? Icon);
public record NavItem(string Label, string? Path, string? Icon, IReadOnlyList<NavItem>? Children);
public record Capabilities(bool Write, bool PageActions, bool RawSql, bool Sse, bool Auth);

public record ListArgs(string Bo, string Group, int Page, int PageSize, string? Sort, string? Q, IDictionary<string, IReadOnlyList<string>>? Filters);
public record ListResult(IReadOnlyList<IDictionary<string, object?>> Rows, int Total);
public record GetResult(IDictionary<string, object?> Row, IDictionary<string, string> FkLabels);
public record SaveResult(IDictionary<string, object?> Row, int? Version);
public record PageActionResult(bool Ok, IDictionary<string, object?> Outputs, string? Message, string? Error);
public record SessionResult(bool Authenticated, object? User, IReadOnlyList<string> Perms, string Csrf);
