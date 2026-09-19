using System;
using System.Collections.Generic;

namespace ASCL.Entities {
    public sealed class EntityWorld : IDisposable {
        private static long s_worldId;
        public long Id { get; } = System.Threading.Interlocked.Increment(ref s_worldId);
        public bool IsDisposed => _disposed;
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
            if (parent != null && (parent.State is EntityState.Disposing or EntityState.Disposed || !ReferenceEquals(parent.World, this))) throw new InvalidOperationException("Parent belongs to another world.");
            T entity = factory() ?? throw new InvalidOperationException("Factory returned null.");
            if(entity.State!=EntityState.Created||entity.Handle.IsValid)throw new InvalidOperationException("Factory must return a new unattached entity.");
            long id = _nextId++;
            if (_nextId <= 0) _nextId = 1;
            int generation = _nextGeneration++;
            if (_nextGeneration <= 0) _nextGeneration = 1;
            _entities.Add(entity);
            _byId.Add(id, entity);
            if (addAsChild) parent?.AddOwnedChild(entity);
            try { entity.Attach(this, new EntityHandle(Id, id, generation), parent); }
            catch(Exception initializationError) {
                try{entity.Dispose();}catch(Exception cleanupError){throw new AggregateException(initializationError,cleanupError);}
                throw;
            }
            return entity;
        }

        public bool TryResolve(EntityHandle handle, out Entity? entity) {
            if (!_disposed && handle.WorldId == Id && handle.IsValid && _byId.TryGetValue(handle.Id, out entity) && entity.Handle == handle) return true;
            entity = null;
            return false;
        }

        public void Tick(float deltaTime) {
            if (_disposed) throw new ObjectDisposedException(nameof(EntityWorld));
            if (deltaTime < 0 || float.IsNaN(deltaTime) || float.IsInfinity(deltaTime)) throw new ArgumentOutOfRangeException(nameof(deltaTime));
            if(_iterating)throw new InvalidOperationException("World Tick cannot reenter.");
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
            var entities=_entities.ToArray();var errors=new List<Exception>();
            for(int i=entities.Length-1;i>=0;i--)try{entities[i]?.Dispose();}catch(Exception error){errors.Add(error);}
            _entities.Clear();_byId.Clear();
            if(errors.Count>0)throw new AggregateException(errors);
        }
    }
}
