using System;
using System.IO;
using System.Threading;
using ASCL.Persistence;
using Cysharp.Threading.Tasks;
using Newtonsoft.Json;

namespace ASCL.Unity {
    public sealed class NewtonsoftDevelopmentMirrorWriter<T>:IDevelopmentMirrorWriter<T> {
        public async UniTask WriteAsync(string path,SaveContainer header,T value,CancellationToken cancellationToken){var mirror=new Mirror{SchemaVersion=header.SchemaVersion,GameVersion=header.GameVersion,SavedAtUtc=new DateTime(header.SavedAtUtcTicks,DateTimeKind.Utc),Slot=header.Slot,Payload=value};string json=JsonConvert.SerializeObject(mirror,Formatting.Indented);await File.WriteAllTextAsync(path,json,cancellationToken);}
        private sealed class Mirror{public int SchemaVersion{get;set;}public string GameVersion{get;set;}=string.Empty;public DateTime SavedAtUtc{get;set;}public string Slot{get;set;}=string.Empty;public T? Payload{get;set;}}
    }
}
