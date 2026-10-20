# ASCL 0.3.0 · OEvent migration

0.3.0 replaces `ASCL.Events.EventScope` with the application-global OEvent system.
This is a breaking event API change. Other module callbacks, save formats, and
numeric/skill rules are unchanged. The complete 0.2.0 baseline is retained at
`codex/legacy-pre-oevent-20261021` (commit `3dcaaa374518fe3543472c1e900d6260623fbbe8`).

## Declare and broadcast

```csharp
using OEvent;
using OEvent.Module;

public readonly struct HealthChanged {
    public readonly int Value;
    public HealthChanged(int value) => Value = value;
}

[OEvent(100)]
public sealed class HealthChangedHandler : OEventNoReturnMethodObject<HealthChanged> {
    public override void Run(HealthChanged message) {
        // Resolve the explicitly supplied target/context; do not store a scene here.
    }
}

// Unity: ASCL.Unity initializes once before scene loading.
// Standalone .NET: choose automatic discovery OR an explicit type list:
OEventManager.Instance.Init(new[] { typeof(HealthChangedHandler) });
OEventManager.Instance.BroadcastEvent(new HealthChanged(80));
OEventManager.Instance.Dispose(); // application shutdown, not world shutdown
```

The event data must be a struct. The original four bases and four broadcast
methods remain in `OEvent` / `OEvent.Module`:

| Handler | Dispatch |
| --- | --- |
| `OEventNoReturnMethodObject<T>` | `BroadcastEvent<T>` |
| `OEventNoReturnAsyncMethodObject<T>` | `BroadcastEventAsync<T>` |
| `OEventWithReturnMethodObject<T,R>` | `BroadcastEventWithReturn<T,R>` |
| `OEventAsyncWithReturnMethodObject<T,R>` | `BroadcastEventAsyncWithReturn<T,R>` |

`Run` and `Register(uint)` / `Unregister()` retain their original signatures.
`R` retains the original `class, new()` constraint. Result methods can return
null, even though the original non-null-annotated CLR API is retained for overrides.

## EventScope callers

| Removed API or behavior | 0.3.0 migration |
| --- | --- |
| `new EventScope()` | Use the one application-level `OEventManager.Instance`. |
| Delegate `Subscribe` / `SubscribeAsync` | Define a stateless MethodObject subclass, discovered via `[OEvent]` (also inherited from the base). |
| `Publish` / `PublishAsync` | Call the matching OEvent broadcast method. |
| `RegisterQuery` / `Query` | Define a result handler. This is priority-based first successful result, **not** an enforced unique query handler. |
| `EventSubscription` / per-owner delegate lifetime | There is no equivalent delegate subscription token. Global rules receive targets in event data. Explicit handler instances can call Register/Unregister; only the registered object may remove itself. |
| `EventExceptionPolicy` | No-return broadcasts fail fast. Result broadcasts log ordinary failures and try the next handler. Cancellation always propagates. |
| Per-world event isolation | The registry is global. Carry world/entity identity in event data and validate it; no implicit world filtering is provided. |

`Entity.Track(IDisposable)` remains available for ordinary owned resources.
Do not attach application-global automatic registrations to a single entity or
scene. No external consuming project is upgraded by this repository change.

## Registration and dispatch rules

- `Init()` discovers loaded, non-dynamic assemblies whose loaded reference graph
  reaches the OEvent attribute assembly, including indirect references. Unrelated
  compiler tooling is not inspected as runtime handler code. Load all handler and
  base-class assemblies before Init, or pass explicit types. Only closed, concrete
  attributed classes are candidates. Attribute inheritance is supported.
- `Init(IEnumerable<Type>, ILogSink? = null)` provides explicit discovery for
  hosts/tests. Candidates must implement `IEventRegister` and have a public
  parameterless constructor. The default log sink is `NullLogSink`; .NET hosts
  should supply a real sink when fallback/cleanup diagnostics are required.
- Repeating Init is a no-op while initialized. Dispose then Init to rebuild.
  Invalid candidates, constructors, or registration failures clear partial
  registration and throw with the failing type. Assembly load failures are
  reported rather than silently accepting partial discovery.
- Each concrete handler type has one registered object. Repeated registration
  does not replace it. A different object of the same type cannot unregister it.
- Lower uint priority runs first (default 10000). Ties preserve registration
  order; automatic type registration sorts by assembly name and full type name.
- Each broadcast captures its candidates. Newly registered handlers are visible
  to subsequent broadcasts, including a nested broadcast, but not to the outer
  broadcast already in progress. Unregistration is immediately visible.
- Async handlers execute sequentially. Result dispatch stops at the first
  normally completed handler, including null; no candidate/all ordinary failures
  return null. Request type, result type, and sync/async mode identify a channel.
- The dispatcher is for one logical execution thread. Concurrent threads must
  marshal their calls; this release does not add thread-safety or a scheduler.

## Unity/application lifetime

`OEventRuntimeBootstrap` resets static state at SubsystemRegistration, initializes
before the first scene, and clears on application exit. A world/scene does not
own the registry. This also supports repeated Play Mode with Domain Reload off.

Dispose is idempotent and invalidates the current generation. An async broadcast
already inside a handler waits for that Run to finish, then cancels before any
later handler or result can be delivered. Dispose does **not** forcibly cancel
handler-owned work. Pass cancellation/context in event data where the handler
needs it; application owners must still manage their own work's lifetime.

The URP Boost demo now publishes `DemoPowerChanged`; its automatic handler
refreshes only the target carried in that message, retaining no scene reference.

## Provenance and support

Adapted from the owner's StaticEventSystem OEvent implementation at source commit
`066c1e442ee2e5a93f399ecf74f1b54d9c29447c`. Source file hashes and adaptation notes
are archived in `Docs/WorkLogs/OEvent-0.3.0` in the source repository. Internal
no-return/return managers were consolidated into the pure C# manager and shared
copy-on-write channels; no KSingleton/UnityEngine dependency remains in ASCL.Core.
Broadcast does not copy the subscription list; subscription changes allocate a
new candidate array. This is not an overall zero-GC or performance certification.

Validation targets are .NET netstandard2.1/net8.0 compilation, .NET 8 tests, and
Unity 6000.3.23f1 Editor tests. Reflection discovery alone does not establish
IL2CPP stripping/AOT compatibility. IL2CPP, mobile Players, and other consumer
projects require their own validation before claiming support.
