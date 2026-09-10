using System;
using System.Collections.Generic;

namespace ASCL.Entities {
    public enum EntityState : byte { Created, Initialized, Enabled, Disabled, Disposing, Disposed }

    public class Entity : IDisposable {
        private readonly List<Entity> _children = new();
        private readonly Dictionary<Type, Entity> _components = new();
        private readonly List<Entity> _componentOrder = new();
        private readonly List<IDisposable> _lifetime = new();
        private EntityWorld? _world;
        private Entity? _parent;

        public EntityHandle Handle { get; private set; }
        public EntityState State { get; private set; } = EntityState.Created;
        public EntityWorld World => _world ?? throw new ObjectDisposedException(GetType().Name);
        public Entity? Parent => _parent;
        public IReadOnlyList<Entity> Children => _children;
        public bool IsDisposed => State == EntityState.Disposed;

        internal void Attach(EntityWorld world, EntityHandle handle, Entity? parent) {
            if (_world != null || State != EntityState.Created) throw new InvalidOperationException("Entity is already attached.");
            _world = world;
            Handle = handle;
            _parent = parent;
            world.Systems.Initialize(this);
            State = EntityState.Initialized;
            if (parent == null || parent.State == EntityState.Enabled) {
                world.Systems.Enable(this);
                State = EntityState.Enabled;
            } else {
                State = EntityState.Disabled;
            }
        }

        public T AddChild<T>() where T : Entity, new() => World.Create<T>(this);

        public T AddChild<T>(Func<T> factory) where T : Entity {
            if (factory == null) throw new ArgumentNullException(nameof(factory));
            return World.Create(this, factory);
        }

        public T AddComponent<T>() where T : Entity, new() {
            EnsureUsable();
            Type type = typeof(T);
            if (_components.ContainsKey(type)) throw new InvalidOperationException($"Component {type.Name} already exists.");
            T component = World.CreateComponent<T>(this);
            _components.Add(type, component);
            _componentOrder.Add(component);
            return component;
        }

        public bool TryGetComponent<T>(out T? component) where T : Entity {
            if (_components.TryGetValue(typeof(T), out Entity? value)) {
                component = (T)value;
                return true;
            }
            component = null;
            return false;
        }

        public T GetComponent<T>() where T : Entity =>
            TryGetComponent<T>(out T? value) ? value! : throw new KeyNotFoundException(typeof(T).FullName);

        public bool RemoveComponent<T>() where T : Entity {
            if (!_components.Remove(typeof(T), out Entity? component)) return false;
            _componentOrder.Remove(component);
            component.Dispose();
            return true;
        }

        public bool RemoveChild(Entity child) {
            if (child == null) throw new ArgumentNullException(nameof(child));
            if (child._parent != this || !_children.Contains(child)) return false;
            child.Dispose();
            return true;
        }

        public T Track<T>(T disposable) where T:IDisposable {
            EnsureUsable();
            if (ReferenceEquals(disposable,null)) throw new ArgumentNullException(nameof(disposable));
            _lifetime.Add(disposable);
            return disposable;
        }

        internal void AddOwnedChild(Entity child) => _children.Add(child);

        internal void Tick(float deltaTime) {
            if (State != EntityState.Enabled) return;
            _world!.Systems.Tick(this, deltaTime);
        }

        internal void LateTick(float deltaTime) {
            if (State != EntityState.Enabled) return;
            _world!.Systems.LateTick(this, deltaTime);
        }

        public void SetEnabled(bool enabled) {
            EnsureUsable();
            if (enabled && State == EntityState.Disabled) {
                _world!.Systems.Enable(this);
                State = EntityState.Enabled;
                for (int i = 0; i < _componentOrder.Count; i++) if (_componentOrder[i].State == EntityState.Disabled) _componentOrder[i].SetEnabled(true);
                for (int i = 0; i < _children.Count; i++) if (_children[i].State == EntityState.Disabled) _children[i].SetEnabled(true);
            } else if (!enabled && State == EntityState.Enabled) {
                _world!.Systems.Disable(this);
                State = EntityState.Disabled;
                for (int i = _children.Count - 1; i >= 0; i--) if (_children[i].State == EntityState.Enabled) _children[i].SetEnabled(false);
                for (int i = _componentOrder.Count - 1; i >= 0; i--) if (_componentOrder[i].State == EntityState.Enabled) _componentOrder[i].SetEnabled(false);
            }
        }

        public void Dispose() {
            if (State is EntityState.Disposing or EntityState.Disposed) return;
            EntityWorld? world = _world;
            if (world == null) { State = EntityState.Disposed; return; }
            if (State == EntityState.Enabled) SetEnabled(false);
            State = EntityState.Disposing;
            for (int i = _lifetime.Count - 1; i >= 0; i--) _lifetime[i].Dispose();
            _lifetime.Clear();
            for (int i = _children.Count - 1; i >= 0; i--) _children[i].Dispose();
            for (int i = _componentOrder.Count - 1; i >= 0; i--) _componentOrder[i].Dispose();
            _components.Clear();
            _componentOrder.Clear();
            _children.Clear();
            world.Systems.Dispose(this);
            _parent?._children.Remove(this);
            if (_parent != null && _parent._components.TryGetValue(GetType(), out Entity? value) && ReferenceEquals(value, this)) {
                _parent._components.Remove(GetType());
                _parent._componentOrder.Remove(this);
            }
            world.Detach(this);
            _parent = null;
            _world = null;
            State = EntityState.Disposed;
        }

        private void EnsureUsable() {
            if (State is EntityState.Disposing or EntityState.Disposed) throw new ObjectDisposedException(GetType().Name);
        }
    }
}
