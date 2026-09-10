using System;
using System.Collections.Generic;
using System.Threading;
using Cysharp.Threading.Tasks;

namespace ASCL.Events {
    public enum EventExceptionPolicy : byte { StopImmediately, ContinueAndAggregate }

    public delegate void EventHandler<T>(in T message) where T : struct;
    public delegate UniTask AsyncEventHandler<T>(T message, CancellationToken cancellationToken) where T : struct;
    public delegate TResponse QueryHandler<in TRequest, out TResponse>(TRequest request);

    public readonly struct EventSubscription : IDisposable, IEquatable<EventSubscription> {
        private readonly EventScope? _scope;
        private readonly Type? _messageType;
        private readonly int _id;
        internal EventSubscription(EventScope scope, Type messageType, int id) { _scope = scope; _messageType = messageType; _id = id; }
        public bool IsValid => _scope != null && _id != 0;
        public void Dispose() => _scope?.Unsubscribe(_messageType!, _id);
        public bool Equals(EventSubscription other) => ReferenceEquals(_scope, other._scope) && _messageType == other._messageType && _id == other._id;
        public override bool Equals(object? obj) => obj is EventSubscription other && Equals(other);
        public override int GetHashCode() => HashCode.Combine(_scope, _messageType, _id);
    }

    public sealed class EventScope : IDisposable {
        private interface IChannel { bool Remove(int id); void Clear(); }
        private readonly Dictionary<Type, IChannel> _sync = new();
        private readonly Dictionary<Type, IChannel> _async = new();
        private readonly Dictionary<(Type, Type), object> _queries = new();
        private int _nextId = 1;
        private bool _disposed;

        public EventScope(EventExceptionPolicy exceptionPolicy = EventExceptionPolicy.ContinueAndAggregate) => ExceptionPolicy = exceptionPolicy;
        public EventExceptionPolicy ExceptionPolicy { get; set; }

        public EventSubscription Subscribe<T>(EventHandler<T> handler, int priority = 0) where T : struct {
            ThrowIfDisposed();
            if (handler == null) throw new ArgumentNullException(nameof(handler));
            Type type = typeof(T);
            if (!_sync.TryGetValue(type, out IChannel? raw)) {
                raw = new SyncChannel<T>();
                _sync.Add(type, raw);
            }
            int id = NextId();
            ((SyncChannel<T>)raw).Add(id, priority, handler);
            return new EventSubscription(this, type, id);
        }

        public EventSubscription SubscribeAsync<T>(AsyncEventHandler<T> handler, int priority = 0) where T : struct {
            ThrowIfDisposed();
            if (handler == null) throw new ArgumentNullException(nameof(handler));
            Type type = typeof(T);
            if (!_async.TryGetValue(type, out IChannel? raw)) {
                raw = new AsyncChannel<T>();
                _async.Add(type, raw);
            }
            int id = NextId();
            ((AsyncChannel<T>)raw).Add(id, priority, handler);
            return new EventSubscription(this, type, -id);
        }

        public void Publish<T>(in T message) where T : struct {
            ThrowIfDisposed();
            if (_sync.TryGetValue(typeof(T), out IChannel? raw)) ((SyncChannel<T>)raw).Publish(in message, ExceptionPolicy);
        }

        public async UniTask PublishAsync<T>(T message, CancellationToken cancellationToken = default) where T : struct {
            ThrowIfDisposed();
            if (_async.TryGetValue(typeof(T), out IChannel? raw)) {
                await ((AsyncChannel<T>)raw).Publish(message, ExceptionPolicy, cancellationToken);
            }
        }

        public void RegisterQuery<TRequest, TResponse>(QueryHandler<TRequest, TResponse> handler) {
            ThrowIfDisposed();
            if (handler == null) throw new ArgumentNullException(nameof(handler));
            var key = (typeof(TRequest), typeof(TResponse));
            if (_queries.ContainsKey(key)) throw new InvalidOperationException($"Query {key} already has a handler.");
            _queries.Add(key, handler);
        }

        public TResponse Query<TRequest, TResponse>(TRequest request) {
            ThrowIfDisposed();
            var key = (typeof(TRequest), typeof(TResponse));
            if (!_queries.TryGetValue(key, out object? handler)) throw new InvalidOperationException($"Query {key} has no handler.");
            return ((QueryHandler<TRequest, TResponse>)handler)(request);
        }

        internal void Unsubscribe(Type type, int id) {
            if (_disposed || id == 0) return;
            Dictionary<Type, IChannel> map = id > 0 ? _sync : _async;
            int realId = id > 0 ? id : -id;
            if (map.TryGetValue(type, out IChannel? channel)) channel.Remove(realId);
        }

        public void Dispose() {
            if (_disposed) return;
            _disposed = true;
            foreach (IChannel channel in _sync.Values) channel.Clear();
            foreach (IChannel channel in _async.Values) channel.Clear();
            _sync.Clear();
            _async.Clear();
            _queries.Clear();
        }

        private int NextId() { int id = _nextId++; if (_nextId <= 0) _nextId = 1; return id; }
        private void ThrowIfDisposed() { if (_disposed) throw new ObjectDisposedException(nameof(EventScope)); }

        private sealed class SyncChannel<T> : IChannel where T : struct {
            private readonly List<Entry> _entries = new();
            private int _publishing;
            private bool _dirty;
            private bool _needsSort;
            internal void Add(int id, int priority, EventHandler<T> handler) {
                if (_publishing > 0) { _entries.Add(new Entry(id, priority, handler)); _needsSort = true; return; }
                int index = _entries.Count;
                while (index > 0 && _entries[index - 1].Priority > priority) index--;
                _entries.Insert(index, new Entry(id, priority, handler));
            }
            public bool Remove(int id) {
                for (int i = 0; i < _entries.Count; i++) if (_entries[i].Id == id && _entries[i].Active) {
                    Entry entry = _entries[i]; entry.Active = false; _entries[i] = entry;
                    if (_publishing == 0) _entries.RemoveAt(i); else _dirty = true;
                    return true;
                }
                return false;
            }
            internal void Publish(in T message, EventExceptionPolicy policy) {
                List<Exception>? errors = null;
                _publishing++;
                int boundary = _entries.Count;
                try {
                    for (int i = 0; i < boundary; i++) {
                        Entry entry = _entries[i]; if (!entry.Active) continue;
                        try { entry.Handler(in message); }
                        catch (Exception ex) { if (policy == EventExceptionPolicy.StopImmediately) throw; (errors ??= new List<Exception>()).Add(ex); }
                    }
                } finally { _publishing--; FinishPublish(); }
                if (errors != null) throw new AggregateException(errors);
            }
            private void FinishPublish() { if (_publishing != 0) return; if (_dirty) { _entries.RemoveAll(static e => !e.Active); _dirty = false; } if (_needsSort) { _entries.Sort(static (a,b) => { int priority=a.Priority.CompareTo(b.Priority); return priority!=0?priority:a.Id.CompareTo(b.Id); }); _needsSort=false; } }
            public void Clear() { _entries.Clear(); _dirty = false; _needsSort=false; }
            private struct Entry { public Entry(int id, int priority, EventHandler<T> handler) { Id=id; Priority=priority; Handler=handler; Active=true; } public int Id; public int Priority; public EventHandler<T> Handler; public bool Active; }
        }

        private sealed class AsyncChannel<T> : IChannel where T : struct {
            private readonly List<Entry> _entries = new();
            private int _publishing;
            private bool _dirty;
            private bool _needsSort;
            internal void Add(int id, int priority, AsyncEventHandler<T> handler) {
                if (_publishing > 0) { _entries.Add(new Entry(id,priority,handler)); _needsSort=true; return; }
                int index = _entries.Count; while (index > 0 && _entries[index - 1].Priority > priority) index--;
                _entries.Insert(index, new Entry(id, priority, handler));
            }
            public bool Remove(int id) {
                for (int i = 0; i < _entries.Count; i++) if (_entries[i].Id == id && _entries[i].Active) {
                    Entry entry = _entries[i]; entry.Active=false; _entries[i]=entry;
                    if (_publishing == 0) _entries.RemoveAt(i); else _dirty=true;
                    return true;
                }
                return false;
            }
            internal async UniTask Publish(T message, EventExceptionPolicy policy, CancellationToken cancellationToken) {
                List<Exception>? errors = null; _publishing++; int boundary = _entries.Count;
                try {
                    for (int i = 0; i < boundary; i++) {
                        cancellationToken.ThrowIfCancellationRequested();
                        Entry entry = _entries[i]; if (!entry.Active) continue;
                        try { await entry.Handler(message, cancellationToken); }
                        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
                        catch (Exception ex) { if (policy == EventExceptionPolicy.StopImmediately) throw; (errors ??= new List<Exception>()).Add(ex); }
                    }
                } finally { _publishing--; FinishPublish(); }
                if (errors != null) throw new AggregateException(errors);
            }
            private void FinishPublish() { if (_publishing != 0) return; if (_dirty) { _entries.RemoveAll(static e=>!e.Active); _dirty=false; } if(_needsSort){_entries.Sort(static(a,b)=>{int priority=a.Priority.CompareTo(b.Priority);return priority!=0?priority:a.Id.CompareTo(b.Id);});_needsSort=false;} }
            public void Clear() { _entries.Clear(); _dirty=false; _needsSort=false; }
            private struct Entry { public Entry(int id,int priority,AsyncEventHandler<T> handler){Id=id;Priority=priority;Handler=handler;Active=true;} public int Id; public int Priority; public AsyncEventHandler<T> Handler; public bool Active; }
        }
    }
}
