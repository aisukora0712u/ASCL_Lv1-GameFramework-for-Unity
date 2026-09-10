using System;
using System.Collections.Generic;

namespace ASCL.Pools {
    public interface IPoolResettable { void ResetForPool(); }

    public sealed class ReferencePool<T> where T : class, IPoolResettable, new() {
        private readonly Stack<T> _items;
        private readonly HashSet<T> _retained;
        public ReferencePool(int initialCapacity = 0) {
            if (initialCapacity < 0) throw new ArgumentOutOfRangeException(nameof(initialCapacity));
            _items = new Stack<T>(initialCapacity);
            _retained = new HashSet<T>(ReferenceEqualityComparer<T>.Instance);
            for (int i = 0; i < initialCapacity; i++) Return(new T());
        }
        public int Count => _items.Count;
        public T Rent() { T value = _items.Count > 0 ? _items.Pop() : new T(); _retained.Remove(value); return value; }
        public void Return(T value) {
            if (value == null) throw new ArgumentNullException(nameof(value));
            if (!_retained.Add(value)) throw new InvalidOperationException("Object was returned twice.");
            value.ResetForPool();
            _items.Push(value);
        }
        public void Clear() { _items.Clear(); _retained.Clear(); }
    }

    public sealed class ObjectPool<T> where T : class {
        private readonly Stack<T> _items;
        private readonly HashSet<T> _retained = new(ReferenceEqualityComparer<T>.Instance);
        private readonly Func<T> _factory;
        private readonly Action<T>? _onRent;
        private readonly Action<T>? _onReturn;
        private readonly Action<T>? _onDiscard;
        public ObjectPool(Func<T> factory, int maxRetained = 64, Action<T>? onRent = null, Action<T>? onReturn = null, Action<T>? onDiscard = null) {
            _factory = factory ?? throw new ArgumentNullException(nameof(factory));
            if (maxRetained < 0) throw new ArgumentOutOfRangeException(nameof(maxRetained));
            MaxRetained = maxRetained; _items = new Stack<T>(maxRetained); _onRent=onRent; _onReturn=onReturn; _onDiscard=onDiscard;
        }
        public int MaxRetained { get; }
        public int Count => _items.Count;
        public void Prewarm(int count) { if (count < 0) throw new ArgumentOutOfRangeException(nameof(count)); for (int i=0;i<count;i++) Return(_factory()); }
        public T Rent() { T item = _items.Count > 0 ? _items.Pop() : _factory(); _retained.Remove(item); _onRent?.Invoke(item); return item; }
        public void Return(T item) {
            if (item == null) throw new ArgumentNullException(nameof(item));
            if (_retained.Contains(item)) throw new InvalidOperationException("Object was returned twice.");
            _onReturn?.Invoke(item);
            if (_items.Count >= MaxRetained) { _onDiscard?.Invoke(item); return; }
            _retained.Add(item); _items.Push(item);
        }
        public void Clear() { while (_items.Count > 0) _onDiscard?.Invoke(_items.Pop()); _retained.Clear(); }
    }

    internal sealed class ReferenceEqualityComparer<T> : IEqualityComparer<T> where T : class {
        public static readonly ReferenceEqualityComparer<T> Instance = new();
        public bool Equals(T? x, T? y) => ReferenceEquals(x, y);
        public int GetHashCode(T obj) => System.Runtime.CompilerServices.RuntimeHelpers.GetHashCode(obj);
    }
}
