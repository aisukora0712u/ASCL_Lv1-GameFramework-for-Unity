using System;
using ASCL.Entities;
using ASCL.Gameplay.Numeric;
using ASCL.Text;
using MemoryPack;
using NUnit.Framework;

namespace ASCL.Tests.Unity {
    [MemoryPackable]
    public partial class UnitySaveProbe {
        public int Value { get; set; }
    }

    public sealed class CoreUnityTests {
        private sealed class Parent:Entity{} private sealed class Child:Entity{}
        [Test]public void ParentDisposalInvalidatesDescendantHandle(){using var world=new EntityWorld();Parent parent=world.Create<Parent>();Child child=parent.AddChild<Child>();EntityHandle handle=child.Handle;parent.Dispose();Assert.That(world.TryResolve(handle,out _),Is.False);Assert.That(world.Count,Is.Zero);}
        [Test]public void NumericBatchPublishesOneChange(){var key=new NumericKey(1);var values=new NumericTable(new[]{new NumericDefinition(key,10)});int changes=0;values.Changed+=_=>changes++;using(values.BeginBatch()){values.AddModifier(key,NumericModifierKind.Flat,2);values.AddModifier(key,NumericModifierKind.AdditivePercent,.5f);}Assert.That(values.GetValue(key),Is.EqualTo(18));Assert.That(changes,Is.EqualTo(1));}
        [Test]public void ReusableCharBufferAllocatesZeroBytesAfterWarmup(){var buffer=new ReusableCharBuffer(32);buffer.TryAppend(123);buffer.Clear();long before=GC.GetAllocatedBytesForCurrentThread();for(int i=0;i<1000;i++){buffer.Clear();if(!buffer.TryAppend(i))Assert.Fail("Buffer capacity was exceeded.");}long allocated=GC.GetAllocatedBytesForCurrentThread()-before;Assert.That(allocated,Is.Zero);}
        [Test]public void MemoryPackRuntimeAndGeneratorRoundTrip(){byte[] bytes=MemoryPackSerializer.Serialize(new UnitySaveProbe{Value=73});UnitySaveProbe restored=MemoryPackSerializer.Deserialize<UnitySaveProbe>(bytes);Assert.That(restored.Value,Is.EqualTo(73));}
    }
}
