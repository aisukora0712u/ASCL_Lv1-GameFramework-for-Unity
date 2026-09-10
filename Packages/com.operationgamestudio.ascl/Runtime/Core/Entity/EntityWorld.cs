using System;
using System.Collections.Generic;

namespace ASCL.Entities {
    public sealed class EntityWorld : IDisposable {
        private readonly List<Entity?> _entities = new();
        private readonly Dictionary<long, Entity> _byId = new();
        private long _nextId = 1;
        private int _nextGeneration = 1;
        private bool _disposed;
        private bool _iterating;
        private bool _needsCompaction;

        public EntityWorld(EntitySystemRegistry? systems = null) => Systems = systems ?? new EntitySystemRegistry();
        public EntitySystemRegistry Systems { get; }
        public int Count => _byId.Count;

        public T Create<T>(Entity? parent = null) where T : Entity, new() => Create(parent, static () => new T());

        public T Create<T>(Entity? parent, Func<T> factory) where T : Entity {
            return CreateOwned(parent, factory, true);
        }

        internal T CreateComponent<T>(Entity parent) where T : Entity, new() => CreateOwned(parent, static () => new T(), false);

        private T CreateOwned<T>(Entity? parent, Func<T> factory, bool addAsChild) where T : Entity {
            if (_disposed) throw new ObjectDisposedException(nameof(EntityWorld));
            if (factory == null) throw new ArgumentNullException(nameof(factory));
            if (parent != null && !ReferenceEquals(parent.World, this)) throw new InvalidOperationException("Parent belongs to another world.");
            T entity = factory();
            long id = _nextId++;
            if (_nextId <= 0) _nextId = 1;
            int generation = _nextGeneration++;
            if (_nextGeneration <= 0) _nextGeneration = 1;
            _entities.Add(entity);
            _byId.Add(id, entity);
            if (addAsChild) parent?.AddOwnedChild(entity);
            try { entity.Attach(this, new EntityHandle(id, generation), parent); }
            catch {
                if (addAsChild) parent?.RemoveChild(entity);
                _entities.Remove(entity);
                _byId.Remove(id);
                throw;
            }
            return entity;
        }

        public bool TryResolve(EntityHandle handle, out Entity? entity) {
            if (handle.IsValid && _byId.TryGetValue(handle.Id, out entity) && entity.Handle == handle) return true;
            entity = null;
            return false;
        }

        public void Tick(float deltaTime) {
            if (_disposed) throw new ObjectDisposedException(nameof(EntityWorld));
            if (deltaTime < 0 || float.IsNaN(deltaTime) || float.IsInfinity(deltaTime)) throw new ArgumentOutOfRangeException(nameof(deltaTime));
            int count = _entities.Count;
            _iterating = true;
            try {
                for (int i = 0; i < count; i++) _entities[i]?.Tick(deltaTime);
                for (int i = 0; i < count; i++) _entities[i]?.LateTick(deltaTime);
            } finally {
                _iterating = false;
                if (_needsCompaction) { _entities.RemoveAll(static value => value == null); _needsCompaction = false; }
            }
        }

        internal void Detach(Entity entity) {
            _byId.Remove(entity.Handle.Id);
            if (_iterating) {
                int index = _entities.IndexOf(entity);
                if (index >= 0) { _entities[index] = null; _needsCompaction = true; }
            } else {
                _entities.Remove(entity);
            }
        }

        public void Dispose() {
            if (_disposed) return;
            _disposed = true;
            for (int i = _entities.Count - 1; i >= 0; i--) _entities[i]?.Dispose();
            _entities.Clear();
            _byId.Clear();
        }
    }
}
