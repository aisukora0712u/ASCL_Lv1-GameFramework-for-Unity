using System;
using System.Collections.Generic;

namespace ASCL.Entities {
    public interface IEntitySystem {
        Type TargetType { get; }
        void Initialize(Entity target);
        void Enable(Entity target);
        void Tick(Entity target, float deltaTime);
        void LateTick(Entity target, float deltaTime);
        void Disable(Entity target);
        void Dispose(Entity target);
    }

    public abstract class EntitySystem<T> : IEntitySystem where T : Entity {
        public Type TargetType => typeof(T);
        public virtual void Initialize(T target) { }
        public virtual void Enable(T target) { }
        public virtual void Tick(T target, float deltaTime) { }
        public virtual void LateTick(T target, float deltaTime) { }
        public virtual void Disable(T target) { }
        public virtual void Dispose(T target) { }
        void IEntitySystem.Initialize(Entity target) => Initialize((T)target);
        void IEntitySystem.Enable(Entity target) => Enable((T)target);
        void IEntitySystem.Tick(Entity target, float deltaTime) => Tick((T)target, deltaTime);
        void IEntitySystem.LateTick(Entity target, float deltaTime) => LateTick((T)target, deltaTime);
        void IEntitySystem.Disable(Entity target) => Disable((T)target);
        void IEntitySystem.Dispose(Entity target) => Dispose((T)target);
    }

    [AttributeUsage(AttributeTargets.Class, Inherited = false)]
    public sealed class EntitySystemAttribute : Attribute { }

    public sealed class EntitySystemRegistry {
        private readonly Dictionary<Type, List<IEntitySystem>> _systems = new();

        public void Register(IEntitySystem system) {
            if (system == null) throw new ArgumentNullException(nameof(system));
            if (!_systems.TryGetValue(system.TargetType, out List<IEntitySystem>? list)) {
                list = new List<IEntitySystem>();
                _systems.Add(system.TargetType, list);
            }
            if (list.Contains(system)) throw new InvalidOperationException("System instance is already registered.");
            list.Add(system);
        }

        internal void Initialize(Entity entity) => ForEach(entity, static (s, e) => s.Initialize(e));
        internal void Enable(Entity entity) => ForEach(entity, static (s, e) => s.Enable(e));
        internal void Tick(Entity entity, float dt) => ForEach(entity, dt, static (s, e, d) => s.Tick(e, d));
        internal void LateTick(Entity entity, float dt) => ForEach(entity, dt, static (s, e, d) => s.LateTick(e, d));
        internal void Disable(Entity entity) => ForEachReverse(entity, static (s, e) => s.Disable(e));
        internal void Dispose(Entity entity) => ForEachReverse(entity, static (s, e) => s.Dispose(e));

        private void ForEach(Entity entity, Action<IEntitySystem, Entity> action) {
            if (!_systems.TryGetValue(entity.GetType(), out List<IEntitySystem>? list)) return;
            for (int i = 0; i < list.Count; i++) action(list[i], entity);
        }

        private void ForEach(Entity entity, float dt, Action<IEntitySystem, Entity, float> action) {
            if (!_systems.TryGetValue(entity.GetType(), out List<IEntitySystem>? list)) return;
            for (int i = 0; i < list.Count; i++) action(list[i], entity, dt);
        }

        private void ForEachReverse(Entity entity, Action<IEntitySystem, Entity> action) {
            if (!_systems.TryGetValue(entity.GetType(), out List<IEntitySystem>? list)) return;
            for (int i = list.Count - 1; i >= 0; i--) action(list[i], entity);
        }
    }
}

