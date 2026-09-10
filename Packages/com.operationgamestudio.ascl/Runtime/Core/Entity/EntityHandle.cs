using System;

namespace ASCL.Entities {
    public readonly struct EntityHandle : IEquatable<EntityHandle> {
        public EntityHandle(long id, int generation) {
            Id = id;
            Generation = generation;
        }

        public long Id { get; }
        public int Generation { get; }
        public bool IsValid => Id > 0 && Generation > 0;

        public bool Equals(EntityHandle other) => Id == other.Id && Generation == other.Generation;
        public override bool Equals(object? obj) => obj is EntityHandle other && Equals(other);
        public override int GetHashCode() => HashCode.Combine(Id, Generation);
        public static bool operator ==(EntityHandle left, EntityHandle right) => left.Equals(right);
        public static bool operator !=(EntityHandle left, EntityHandle right) => !left.Equals(right);
        public override string ToString() => $"{Id}:{Generation}";
    }
}

