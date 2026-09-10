using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using System.Threading;
using ASCL.Persistence;
using MemoryPack;
using NUnit.Framework;

namespace ASCL.Tests {
    [MemoryPackable] public partial class TestSave { public int Level{get;set;} public string Name{get;set;}=string.Empty; }
    public sealed class PersistenceTests {
        private sealed class TestMirrorWriter:IDevelopmentMirrorWriter<TestSave>{public async Cysharp.Threading.Tasks.UniTask WriteAsync(string path,SaveContainer header,TestSave value,CancellationToken cancellationToken){await File.WriteAllTextAsync(path,$"{header.SchemaVersion}:{value.Level}",cancellationToken);}}
        private string _directory=string.Empty;
        [SetUp]public void SetUp()=>_directory=Path.Combine(Path.GetTempPath(),"ascl-tests-"+Guid.NewGuid().ToString("N"));
        [TearDown]public void TearDown(){if(Directory.Exists(_directory))Directory.Delete(_directory,true);}
        [Test]public async Task SaveRoundTripCreatesJsonAndRecoversBackup(){var store=new MemoryPackSaveStore<TestSave>(_directory,"1.0",1,mirrorWriter:new TestMirrorWriter());await store.SaveAsync("slot1",new TestSave{Level=7,Name="hero"});await store.SaveAsync("slot1",new TestSave{Level=8,Name="hero"});SaveLoadResult<TestSave> loaded=await store.LoadAsync("slot1");Assert.That(loaded.Status,Is.EqualTo(SaveLoadStatus.Success));Assert.That(loaded.Value!.Level,Is.EqualTo(8));Assert.That(File.Exists(Path.Combine(_directory,"slot1.json")),Is.True);File.WriteAllBytes(Path.Combine(_directory,"slot1.sav"),new byte[]{1,2,3});loaded=await store.LoadAsync("slot1");Assert.That(loaded.Status,Is.EqualTo(SaveLoadStatus.RecoveredFromBackup));Assert.That(loaded.Value!.Level,Is.EqualTo(7));}
        [Test]public async Task FutureVersionIsRejectedWithoutFallback(){var newer=new MemoryPackSaveStore<TestSave>(_directory,"2.0",2);await newer.SaveAsync("slot",new TestSave{Level=1});var older=new MemoryPackSaveStore<TestSave>(_directory,"1.0",1);SaveLoadResult<TestSave> loaded=await older.LoadAsync("slot");Assert.That(loaded.Status,Is.EqualTo(SaveLoadStatus.FutureVersion));}
    }
}
