using System;
using MemoryPack;
using System.Threading;
using Cysharp.Threading.Tasks;

namespace ASCL.Persistence {
    [MemoryPackable]
    public partial class SaveContainer {
        public int SchemaVersion { get; set; }
        public string GameVersion { get; set; } = string.Empty;
        public long SavedAtUtcTicks { get; set; }
        public string Slot { get; set; } = string.Empty;
        public byte[] Payload { get; set; } = Array.Empty<byte>();
        public byte[] PayloadSha256 { get; set; } = Array.Empty<byte>();
    }

    public interface ISaveMigration<T> {
        int FromVersion { get; }
        T Migrate(T source);
    }

    public interface IDevelopmentMirrorWriter<in T> {
        UniTask WriteAsync(string path,SaveContainer header,T value,CancellationToken cancellationToken);
    }

    public enum SaveLoadStatus : byte { Success, RecoveredFromBackup, NotFound, Corrupt, FutureVersion }

    public readonly struct SaveLoadResult<T> {
        internal SaveLoadResult(SaveLoadStatus status,T? value,string? error){Status=status;Value=value;Error=error;}
        public SaveLoadStatus Status{get;} public T? Value{get;} public string? Error{get;} public bool Succeeded=>Status is SaveLoadStatus.Success or SaveLoadStatus.RecoveredFromBackup;
    }

    public readonly struct SaveSlotInfo {
        public SaveSlotInfo(string slot,long length,DateTime lastWriteUtc){Slot=slot;Length=length;LastWriteUtc=lastWriteUtc;}
        public string Slot{get;}public long Length{get;}public DateTime LastWriteUtc{get;}
    }
}
