using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ASCL.Entities;
using ASCL.Gameplay.Actions;
using ASCL.Gameplay.Buffs;
using ASCL.Gameplay.Numeric;
using ASCL.Gameplay.Skills;
using ASCL.Text;
using ASCL.Time;
using Cysharp.Threading.Tasks;
using NUnit.Framework;

namespace ASCL.Tests {
    [EntitySystem] public sealed class GeneratedProbeSystem:EntitySystem<GeneratedProbeEntity>{public static int Initialized;public override void Initialize(GeneratedProbeEntity target)=>Initialized++;}
    public sealed class GeneratedProbeEntity:Entity{}
    public sealed class DisposeOnTickEntity:Entity{} public sealed class CountOnTickEntity:Entity{public int Ticks;}
    public sealed class DisposeOnTickSystem:EntitySystem<DisposeOnTickEntity>{public override void Tick(DisposeOnTickEntity target,float deltaTime)=>target.Dispose();}
    public sealed class CountOnTickSystem:EntitySystem<CountOnTickEntity>{public override void Tick(CountOnTickEntity target,float deltaTime)=>target.Ticks++;}
    public sealed class CoreFrameworkTests {
        private sealed class Root:Entity{} private sealed class Child:Entity{} private sealed class Component:Entity{}
        private sealed class RecorderSystem<T>:EntitySystem<T> where T:Entity { private readonly List<string> _log;private readonly string _name;public RecorderSystem(List<string> log,string name){_log=log;_name=name;}public override void Initialize(T target)=>_log.Add(_name+".init");public override void Enable(T target)=>_log.Add(_name+".enable");public override void Disable(T target)=>_log.Add(_name+".disable");public override void Dispose(T target)=>_log.Add(_name+".dispose");}

        [Test] public void EntityHierarchyOwnsChildrenComponentsAndInvalidatesHandles(){var log=new List<string>();var systems=new EntitySystemRegistry();systems.Register(new RecorderSystem<Root>(log,"root"));systems.Register(new RecorderSystem<Child>(log,"child"));systems.Register(new RecorderSystem<Component>(log,"component"));using var world=new EntityWorld(systems);Root root=world.Create<Root>();Child child=root.AddChild<Child>();Component component=root.AddComponent<Component>();Assert.That(root.Children,Has.Count.EqualTo(1));EntityHandle handle=child.Handle;Assert.That(world.Count,Is.EqualTo(3));root.Dispose();Assert.That(world.Count,Is.Zero);Assert.That(world.TryResolve(handle,out _),Is.False);Assert.That(log,Is.EqualTo(new[]{"root.init","root.enable","child.init","child.enable","component.init","component.enable","root.disable","child.disable","component.disable","child.dispose","component.dispose","root.dispose"}));}



        [Test] public void NumericFormulaAndBatchEmitOneFinalNotification(){var key=new NumericKey(1);var table=new NumericTable(new[]{new NumericDefinition(key,100,0,1000)});int changes=0;table.Changed+=_=>changes++;using(table.BeginBatch()){table.AddModifier(key,NumericModifierKind.Flat,10);table.AddModifier(key,NumericModifierKind.AdditivePercent,.5f);table.AddModifier(key,NumericModifierKind.FinalFlat,5);table.AddModifier(key,NumericModifierKind.FinalPercent,.1f);}Assert.That(table.GetValue(key),Is.EqualTo(187).Within(.001));Assert.That(changes,Is.EqualTo(1));}

        [Test] public async Task SkillAppliesAndStacksBuffWithOwnedNumericModifier(){var key=new NumericKey(1);var source=new Combatant(new EntityHandle(1,1,1),new NumericTable());var target=new Combatant(new EntityHandle(1,2,1),new NumericTable(new[]{new NumericDefinition(key,10)}));var buff=new BuffDefinition("power",10,2,BuffStackPolicy.AddStack,new IBuffEffectDefinition[]{new NumericBuffEffectDefinition(key,NumericModifierKind.Flat,1)});var skill=new SkillDefinition("boost",100,new IActionEffect[]{new ApplyBuffEffect(buff)});var runner=new SkillRunner(new ActionPipeline());Assert.That((await runner.CastAsync(skill,source,target)).Succeeded,Is.True);Assert.That((await runner.CastAsync(skill,source,target)).Succeeded,Is.True);Assert.That(target.Numeric.GetValue(key),Is.EqualTo(12));Assert.That(target.Buffs.Active.Count,Is.EqualTo(1));Assert.That(target.Buffs.Active[0].Stacks,Is.EqualTo(2));Assert.That(await target.Buffs.RemoveAsync(target.Buffs.Active[0].Handle),Is.True);Assert.That(target.Numeric.GetValue(key),Is.EqualTo(10));}
        [Test]public async Task CompositeBuffRemovalOnlyRevertsItsChildStackContribution(){var key=new NumericKey(1);var source=new Combatant(new EntityHandle(1,1,1),new NumericTable());var target=new Combatant(new EntityHandle(1,2,1),new NumericTable(new[]{new NumericDefinition(key,10)}));var child=new BuffDefinition("child",10,3,BuffStackPolicy.AddStack,new IBuffEffectDefinition[]{new NumericBuffEffectDefinition(key,NumericModifierKind.Flat,1)});var parent=new BuffDefinition("parent",10,1,BuffStackPolicy.Independent,children:new[]{child});var runner=new SkillRunner(new ActionPipeline());await runner.CastAsync(new SkillDefinition("childSkill",1,new IActionEffect[]{new ApplyBuffEffect(child)}),source,target);await runner.CastAsync(new SkillDefinition("parentSkill",2,new IActionEffect[]{new ApplyBuffEffect(parent)}),source,target);Assert.That(target.Numeric.GetValue(key),Is.EqualTo(12));BuffInstance parentInstance=target.Buffs.Active[1];await target.Buffs.RemoveAsync(parentInstance.Handle);Assert.That(target.Numeric.GetValue(key),Is.EqualTo(11));Assert.That(target.Buffs.Active,Has.Count.EqualTo(1));Assert.That(target.Buffs.Active[0].Stacks,Is.EqualTo(1));}

        [Test] public void BuffCompositionRejectsCycles(){var children=new List<BuffDefinition>();var a=new BuffDefinition("a",1,1,BuffStackPolicy.Ignore,children:children);children.Add(a);Assert.Throws<InvalidOperationException>(a.ValidateGraph);}

        [Test] public void ReusableCharBufferDoesNotGrowAndFormatsWithoutStringCreation(){var buffer=new ReusableCharBuffer(16);Assert.That(buffer.TryAppend(12345),Is.True);Assert.That(buffer.AsSpan().SequenceEqual("12345".AsSpan()),Is.True);buffer.Clear();Assert.That(buffer.TryAppend("abcdefghijklmnopq".AsSpan()),Is.False);Assert.That(buffer.Length,Is.Zero);}
        [Test] public void SourceGeneratorBuildsExplicitAotRegistry(){GeneratedProbeSystem.Initialized=0;var registry=new EntitySystemRegistry();global::ASCL.Generated.ASCL_TestsEntitySystems.Register(registry);using var world=new EntityWorld(registry);world.Create<GeneratedProbeEntity>();Assert.That(GeneratedProbeSystem.Initialized,Is.EqualTo(1));}
        [Test]public void RemovingEntityDuringTickDoesNotSkipFollowingEntity(){var registry=new EntitySystemRegistry();registry.Register(new DisposeOnTickSystem());registry.Register(new CountOnTickSystem());using var world=new EntityWorld(registry);world.Create<DisposeOnTickEntity>();CountOnTickEntity counter=world.Create<CountOnTickEntity>();world.Tick(.016f);Assert.That(counter.Ticks,Is.EqualTo(1));Assert.That(world.Count,Is.EqualTo(1));}
        private sealed class TrackedResource : IDisposable { public int Disposals; public void Dispose() => Disposals++; }
        [Test] public void EntityLifetimeDisposesTrackedResourceOnce() { using var world = new EntityWorld(); Entity entity = world.Create<Entity>(); var resource = new TrackedResource(); entity.Track(resource); entity.Dispose(); entity.Dispose(); Assert.That(resource.Disposals, Is.EqualTo(1)); }
        [Test]public void SchedulerIsStableAndCancellationSafe(){var clock=new ManualGameClock();var scheduler=new GameScheduler(clock);var order=new List<int>();scheduler.Schedule(1,()=>order.Add(1));TimerHandle cancelled=scheduler.Schedule(.5f,()=>order.Add(9));scheduler.Schedule(1,()=>order.Add(2));Assert.That(scheduler.Cancel(cancelled),Is.True);clock.Advance(1);scheduler.Tick();Assert.That(order,Is.EqualTo(new[]{1,2}));}
    }
}
