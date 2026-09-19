using System;

namespace ASCL.Entities {
    /// <summary>Process-local identity. Persist application IDs, never this handle.</summary>
    public readonly struct EntityHandle : IEquatable<EntityHandle> {
        public EntityHandle(long worldId, long id, int generation) { WorldId=worldId; Id=id; Generation=generation; }
        public long WorldId { get; }
        public long Id { get; }
        public int Generation { get; }
        public bool IsValid => WorldId > 0 && Id > 0 && Generation > 0;
        public bool Equals(EntityHandle other) => WorldId==other.WorldId && Id==other.Id && Generation==other.Generation;
        public override bool Equals(object? obj) => obj is EntityHandle other && Equals(other);
        public override int GetHashCode() => HashCode.Combine(WorldId,Id,Generation);
        public static bool operator ==(EntityHandle left,EntityHandle right)=>left.Equals(right);
        public static bool operator !=(EntityHandle left,EntityHandle right)=>!left.Equals(right);
        public override string ToString()=>$"{WorldId}:{Id}:{Generation}";
    }
}
