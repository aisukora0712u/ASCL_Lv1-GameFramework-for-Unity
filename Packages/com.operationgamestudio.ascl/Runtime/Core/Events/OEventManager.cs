#nullable enable
using System;
using System.Collections.Generic;
using System.Linq;
using ASCL.Diagnostics;
using Cysharp.Threading.Tasks;

namespace OEvent.Module {
    /// <summary>Application-global, single logical thread dispatcher. Handlers must not retain scene/world state.</summary>
    public sealed class OEventManager : IDisposable {
        public static OEventManager Instance { get; } = new();
        private readonly Dictionary<(Type, Type, EventKind), EventChannel> _channels = new();
        private readonly Dictionary<Type, EventEntry> _registrations = new();
        private readonly List<IEventRegister> _automatic = new();
        private ILogSink _log = NullLogSink.Instance;
        private bool _initializing;
        private bool _disposing;
        private long _generation;
        private OEventManager() { }
        public bool IsInitialized { get; private set; }
        public int RegisteredHandlerCount => _registrations.Count;

        public void Init() {
            if (IsInitialized) return;
            Init(OEventReflectionHelper.GetAllTypesWithAttribute<OEventAttribute>());
        }

        public void Init(IEnumerable<Type> handlerTypes, ILogSink? log = null) {
            if (handlerTypes == null) throw new ArgumentNullException(nameof(handlerTypes));
            if (_initializing || _disposing) throw new InvalidOperationException("OEvent lifecycle cannot be entered recursively.");
            if (IsInitialized) return;
            _log = log ?? NullLogSink.Instance;
            _initializing = true;
            long generation = ++_generation;
            Type? current = null;
            try {
                foreach (Type type in handlerTypes.Distinct().OrderBy(t => t?.Assembly.FullName, StringComparer.Ordinal)
                    .ThenBy(t => t?.FullName, StringComparer.Ordinal)) {
                    current = type;
                    if (type == null || !type.IsClass || type.IsAbstract || type.ContainsGenericParameters ||
                        !typeof(IEventRegister).IsAssignableFrom(type) || type.GetConstructor(Type.EmptyTypes) == null)
                        throw new ArgumentException("A handler must be a closed concrete IEventRegister class with a public parameterless constructor.");
                    var attribute = (OEventAttribute?)Attribute.GetCustomAttribute(type, typeof(OEventAttribute), true);
                    if (attribute == null) throw new ArgumentException("The handler has no OEvent attribute.");
                    var instance = (IEventRegister)Activator.CreateInstance(type)!;
                    _automatic.Add(instance);
                    instance.Register(attribute.Priority);
                    if (_generation != generation || !_initializing) throw new InvalidOperationException("Initialization was interrupted.");
                }
                IsInitialized = true;
            } catch (Exception ex) {
                Dispose();
                throw new InvalidOperationException($"OEvent initialization failed at '{current?.FullName ?? "type discovery"}'. All registrations were cleared.", ex);
            } finally { _initializing = false; }
        }

        public void Update() { }

        public void Dispose() {
            if (_disposing) return;
            _disposing = true;
            try {
                IsInitialized = false;
                _initializing = false;
                ++_generation;
                foreach (EventEntry entry in _registrations.Values) entry.Active = false;
                _registrations.Clear();
                _channels.Clear();
                for (int i = _automatic.Count - 1; i >= 0; i--) {
                    try { _automatic[i].Unregister(); }
                    catch (Exception ex) { LogFailure("OEvent handler cleanup failed.", ex); }
                }
                _automatic.Clear();
                _log = NullLogSink.Instance;
            } finally { _disposing = false; }
        }

        internal void Register(IEventRegister handler, Type argument, Type result, EventKind kind, uint priority) {
            if (_disposing || (!IsInitialized && !_initializing)) throw new InvalidOperationException("Initialize OEvent before registering handlers.");
            // OEvent has one registered object per concrete handler type.
            if (_registrations.ContainsKey(handler.GetType())) return;
            var key = (argument, result, kind);
            if (!_channels.TryGetValue(key, out EventChannel? channel)) {
                channel = new EventChannel();
                _channels.Add(key, channel);
            }
            var entry = new EventEntry(handler, priority, key);
            channel.Add(entry);
            _registrations.Add(handler.GetType(), entry);
        }

        internal void Unregister(IEventRegister handler) {
            if (!_registrations.TryGetValue(handler.GetType(), out EventEntry? entry) || !ReferenceEquals(entry.Handler, handler)) return;
            _channels[entry.Key].Remove(entry);
            if (_channels[entry.Key].Entries.Length == 0) _channels.Remove(entry.Key);
            _registrations.Remove(handler.GetType());
        }

        public void BroadcastEvent<TEventType>(TEventType eventData) where TEventType : struct {
            EventEntry[] entries = Snapshot(typeof(TEventType), typeof(void), EventKind.Sync);
            long generation = _generation;
            foreach (EventEntry entry in entries) {
                CheckGeneration(generation);
                if (!entry.Active) continue;
                ((OEventNoReturnMethodObject<TEventType>)entry.Handler).Run(eventData);
                CheckGeneration(generation);
            }
        }

        public async UniTask BroadcastEventAsync<TEventType>(TEventType eventData) where TEventType : struct {
            EventEntry[] entries = Snapshot(typeof(TEventType), typeof(void), EventKind.Async);
            long generation = _generation;
            foreach (EventEntry entry in entries) {
                CheckGeneration(generation);
                if (!entry.Active) continue;
                try { await ((OEventNoReturnAsyncMethodObject<TEventType>)entry.Handler).Run(eventData); }
                catch { CheckGeneration(generation); throw; }
                CheckGeneration(generation);
            }
        }

        public TResult BroadcastEventWithReturn<TEventType, TResult>(TEventType eventData)
            where TEventType : struct where TResult : class, new() {
            EventEntry[] entries = Snapshot(typeof(TEventType), typeof(TResult), EventKind.SyncResult);
            long generation = _generation;
            foreach (EventEntry entry in entries) {
                CheckGeneration(generation);
                if (!entry.Active) continue;
                try {
                    TResult result = ((OEventWithReturnMethodObject<TEventType, TResult>)entry.Handler).Run(eventData);
                    CheckGeneration(generation);
                    return result;
                } catch (OperationCanceledException) { throw; }
                catch (Exception ex) { CheckGeneration(generation); LogFailure($"OEvent handler '{entry.Handler.GetType().FullName}' failed; trying the next result handler.", ex); CheckGeneration(generation); }
            }
            return default!;
        }

        public async UniTask<TResult> BroadcastEventAsyncWithReturn<TEventType, TResult>(TEventType eventData)
            where TEventType : struct where TResult : class, new() {
            EventEntry[] entries = Snapshot(typeof(TEventType), typeof(TResult), EventKind.AsyncResult);
            long generation = _generation;
            foreach (EventEntry entry in entries) {
                CheckGeneration(generation);
                if (!entry.Active) continue;
                try {
                    TResult result = await ((OEventAsyncWithReturnMethodObject<TEventType, TResult>)entry.Handler).Run(eventData);
                    CheckGeneration(generation);
                    return result;
                } catch (OperationCanceledException) { throw; }
                catch (Exception ex) { CheckGeneration(generation); LogFailure($"OEvent async handler '{entry.Handler.GetType().FullName}' failed; trying the next result handler.", ex); CheckGeneration(generation); }
            }
            return default!;
        }

        private EventEntry[] Snapshot(Type argument, Type result, EventKind kind) {
            if (!IsInitialized) throw new InvalidOperationException("Initialize OEvent before broadcasting.");
            return _channels.TryGetValue((argument, result, kind), out EventChannel? channel) ? channel.Entries : Array.Empty<EventEntry>();
        }
        private void CheckGeneration(long generation) {
            if (!IsInitialized || _generation != generation) throw new OperationCanceledException("OEvent was disposed or reinitialized during this broadcast.");
        }
        private void LogFailure(string message, Exception exception) {
            try { _log.Write(LogLevel.Error, message, exception); }
            catch { /* A diagnostic sink must not change event fallback/cleanup semantics. */ }
        }
    }
}
