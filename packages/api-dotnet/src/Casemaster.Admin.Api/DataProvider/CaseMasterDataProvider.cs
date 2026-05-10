// CaseMasterDataProvider — reflection-based bridge to the .NET runtime.
//
// The shipping CaseMaster.dll exposes BO definitions, an iterator that
// runs SELECTs, and a `bo.persist` write path. This provider proxies
// IDataProvider calls into those internals.
//
// IMPLEMENTATION NOTE (Phase 7 stub): the methods below currently throw
// NotImplementedException. The intended pattern, per the contract test
// suite's expectations, is:
//
//   ListBoAsync   → CaseMaster.Bo.Iterator.OfEntity(name, where, orderBy, rows, page)
//   GetBoAsync    → CaseMaster.Bo.QuickLoad(name, id, group: "*")
//   SaveBoAsync   → CaseMaster.Bo.Create + Bo.SetAttr + Bo.Persist
//   DeleteBoAsync → CaseMaster.Bo.Delete
//   CallPageActionAsync → CaseMaster.Page.CallFunction; collect //act_*
//   DescribeAsync → walk the parsed app's BO registry + page tree.
//
// Each requires <2 days of focused .NET work; the dispatcher already
// hands back row dictionaries that map cleanly to the JSON shape.

using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Casemaster.Admin.Api.DataProvider;

public sealed class CaseMasterDataProvider : IDataProvider
{
    public Task<DescribeResult>     DescribeAsync()                                                                                  => throw new NotImplementedException();
    public Task<ListResult>         ListBoAsync(ListArgs args)                                                                       => throw new NotImplementedException();
    public Task<GetResult>          GetBoAsync(string bo, object id)                                                                  => throw new NotImplementedException();
    public Task<SaveResult>         SaveBoAsync(string bo, IDictionary<string, object?> data)                                         => throw new NotImplementedException();
    public Task<bool>               DeleteBoAsync(string bo, object id)                                                               => throw new NotImplementedException();
    public Task<PageActionResult>   CallPageActionAsync(string pagePath, string fn, IDictionary<string, object?> parameters)          => throw new NotImplementedException();
    public Task<SessionResult>      SessionMeAsync(string? cookie)                                                                    => throw new NotImplementedException();
    public Task<SessionResult>      SessionLoginAsync(string email, string password)                                                  => throw new NotImplementedException();
    public Task                     SessionLogoutAsync(string? cookie)                                                                => throw new NotImplementedException();
    public Task<object?>            GetPreferencesAsync(string scope, string? cookie)                                                 => throw new NotImplementedException();
    public Task                     PutPreferencesAsync(string scope, object? value, string? cookie)                                  => throw new NotImplementedException();
}
