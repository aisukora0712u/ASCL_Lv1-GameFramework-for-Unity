using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ASCL.Entities;
using ASCL.Gameplay.Actions;
using ASCL.Gameplay.Buffs;
using ASCL.Gameplay.Numeric;
using ASCL.Gameplay.Skills;
using ASCL.Gameplay.Turns;
using ASCL.Time;
using Cysharp.Threading.Tasks;
using NUnit.Framework;
namespace ASCL.Tests {
    public sealed class IntegrationFoundationTests {
        private static readonly NumericKey Health=new(1);
        [Test]public void HandlesAreWorldScopedAndNeverResolveAfterRecreation(){using var first=new EntityWorld();using var second=new EntityWorld();var a=first.Create<Entity>();var b=second.Create<Entity>();Assert.That(a.Handle.Id,Is.EqualTo(b.Handle.Id));Assert.That(second.TryResolve(a.Handle,out _),Is.False);var stale=a.Handle;a.Dispose();var replacement=first.Create<Entity>();Assert.That(first.TryResolve(stale,out _),Is.False);Assert.That(first.TryResolve(replacement.Handle,out _),Is.True);}
        [TestCase(0)][TestCase(73129)][TestCase(-1)][TestCase(int.MinValue)][TestCase(int.MaxValue)]
        public void RandomPreservesLegacySequenceAndRestoresWithoutReplaying(int seed){var legacy=new Random(seed);var stream=new RestorableRandomSource(seed);for(int i=0;i<10000;i++)Assert.That(stream.NextDouble(),Is.EqualTo(legacy.NextDouble()));var state=stream.Capture();var expected=Enumerable.Range(0,100).Select(_=>stream.NextDouble()).ToArray();stream.Restore(state);Assert.That(Enumerable.Range(0,100).Select(_=>stream.NextDouble()).ToArray(),Is.EqualTo(expected));var fork=stream.Fork();Assert.That(fork.NextDouble(),Is.EqualTo(stream.NextDouble()));state.Values[1]=-1;Assert.Throws<ArgumentException>(()=>stream.Restore(state));}
        [Test]public async Task SchedulerClearAndDisposeTerminateAllWaiters(){var clock=new ManualGameClock();var scheduler=new GameScheduler(clock);var first=scheduler.DelayAsync(10);scheduler.Clear();Assert.That(first.Status,Is.EqualTo(UniTaskStatus.Canceled));var second=scheduler.DelayAsync(1);scheduler.Dispose();Assert.That(second.Status,Is.EqualTo(UniTaskStatus.Canceled));scheduler.Dispose();Assert.Throws<ObjectDisposedException>(()=>scheduler.Schedule(1,()=>{}));await Task.CompletedTask;}
        [Test]public async Task SchedulerCancellationRaceHasExactlyOneTerminalResult(){for(int i=0;i<100;i++){var clock=new ManualGameClock();using var scheduler=new GameScheduler(clock);using var token=new CancellationTokenSource();var waiting=scheduler.DelayAsync(1,token.Token).AsTask();var cancelling=Task.Run(()=>token.Cancel());clock.Advance(1);scheduler.Tick();await cancelling;Assert.That(waiting.IsCompleted);try{await waiting;}catch(OperationCanceledException){}Assert.That(scheduler.Count,Is.Zero);}}
        [Test]public void SchedulerRejectsForeignTimerHandles(){var clock=new ManualGameClock();using var a=new GameScheduler(clock);using var b=new GameScheduler(clock);var timer=a.Schedule(1,()=>{});b.Schedule(1,()=>{});Assert.That(b.Cancel(timer),Is.False);Assert.That(a.Cancel(timer),Is.True);Assert.That(a.Cancel(timer),Is.False);}
        [Test]public void NumericPreservesIntegersAboveFloatPrecision(){var table=new NumericTable();table.SetBaseValue(Health,16777217);table.AddModifier(Health,NumericModifierKind.Flat,2);Assert.That(table.GetValue(Health),Is.EqualTo(16777219));}
        [Test]public async Task TransactionFailureAndCancellationDoNotPublishOrMutate(){var actor=new Combatant(new EntityHandle(1,1,1),new NumericTable());actor.Numeric.SetBaseValue(Health,100);int events=0;actor.Numeric.Changed+=_=>events++;var pipeline=new ActionPipeline();var failed=await pipeline.ExecuteAsync(new GameActionContext(1,actor,actor),new IActionEffect[]{new SetNumericBaseEffect(Health,1),new FailEffect()});Assert.That(failed.Succeeded,Is.False);Assert.That(actor.Numeric.GetValue(Health),Is.EqualTo(100));Assert.That(events,Is.Zero);using var cancellation=new CancellationTokenSource();var pending=pipeline.ExecuteAsync(new GameActionContext(1,actor,actor),new IActionEffect[]{new SetNumericBaseEffect(Health,2),new CancelEffect(cancellation)},cancellation.Token).AsTask();try{await pending;Assert.Fail("Expected cancellation");}catch(OperationCanceledException){}Assert.That(actor.Numeric.GetValue(Health),Is.EqualTo(100));Assert.That(events,Is.Zero);}
        [Test]public async Task TransactionBudgetsRollbackAlreadyEvaluatedEffects(){var actor=new Combatant(new EntityHandle(1,1,1),new NumericTable());actor.Numeric.SetBaseValue(Health,100);var result=await new ActionPipeline(maximumEffects:1).ExecuteAsync(new GameActionContext(1,actor,actor),new IActionEffect[]{new SetNumericBaseEffect(Health,1),new SetNumericBaseEffect(Health,2)});Assert.That(result.Succeeded,Is.False);Assert.That(actor.Numeric.GetValue(Health),Is.EqualTo(100));}
        [Test]public async Task NotificationsObserveEveryCommittedTargetAndCannotUndoSuccess(){var first=new Combatant(new EntityHandle(1,1,1),new NumericTable());var second=new Combatant(new EntityHandle(1,2,1),new NumericTable());first.Numeric.SetBaseValue(Health,100);second.Numeric.SetBaseValue(Health,200);var originalTable=first.Numeric;int calls=0;first.Numeric.Changed+=_=>{calls++;Assert.That(second.Numeric.GetValue(Health),Is.EqualTo(180));throw new InvalidOperationException("observer");};var result=await new ActionPipeline().ExecuteAsync(new GameActionContext(1,first,second),new IActionEffect[]{new BothEffect()});Assert.That(result.Succeeded);Assert.That(result.NotificationErrors.Count,Is.EqualTo(1));Assert.That(first.Numeric,Is.SameAs(originalTable));Assert.That(first.Numeric.GetValue(Health),Is.EqualTo(90));Assert.That(calls,Is.EqualTo(1));}
        [Test]public async Task BuffStateAndModifiersRollbackTogether(){var actor=new Combatant(new EntityHandle(1,1,1),new NumericTable());actor.Numeric.SetBaseValue(Health,100);var buff=new BuffDefinition("armor",1,3,BuffStackPolicy.AddStack,new IBuffEffectDefinition[]{new NumericBuffEffectDefinition(Health,NumericModifierKind.Flat,5)},permanent:true);var runner=new SkillRunner(new ActionPipeline());await runner.CastAsync(new SkillDefinition("equip",1,new IActionEffect[]{new ApplyBuffEffect(buff)}),actor,actor);var original=actor.Buffs.Active[0].Handle;var failed=await new ActionPipeline().ExecuteAsync(new GameActionContext(1,actor,actor),new IActionEffect[]{new ApplyBuffEffect(buff),new FailEffect()});Assert.That(failed.Succeeded,Is.False);Assert.That(actor.Buffs.Active[0].Stacks,Is.EqualTo(1));Assert.That(actor.Numeric.GetValue(Health),Is.EqualTo(105));Assert.That(await actor.Buffs.RemoveAsync(original),Is.True);Assert.That(actor.Numeric.GetValue(Health),Is.EqualTo(100));}
        [Test]public void TurnPreviewIsPureAndCanRestoreSkippedFactionSequence(){var turns=new TurnSequence(new[]{"player","empty","enemy"});Assert.That(turns.TryNext(id=>id!="empty",out var player));Assert.That(turns.State.Index,Is.EqualTo(-1));turns.Restore(player);Assert.That(turns.TryNext(id=>id!="empty",out var enemy));Assert.That(enemy.Index,Is.EqualTo(2));turns.Restore(enemy);Assert.That(turns.TryNext(id=>id!="empty",out var next));Assert.That(next.Round,Is.EqualTo(2));Assert.That(next.Sequence,Is.EqualTo(3));Assert.That(ActionResource.Spend(2,1),Is.EqualTo(1));Assert.Throws<InvalidOperationException>(()=>ActionResource.Spend(0,1));}
        [Test]public void FailedInitializationAndCleanupReleaseTheWholeOwnershipTree(){
            var systems=new EntitySystemRegistry();systems.Register(new FailingInitialization());using var world=new EntityWorld(systems);
            Assert.Throws<InvalidOperationException>(()=>world.Create<InitializationProbe>());Assert.That(world.Count,Is.Zero);
            var parent=world.Create<Entity>();parent.Track(new ThrowingDisposable());var child=parent.AddChild<Entity>();
            Assert.Throws<AggregateException>(()=>parent.Dispose());Assert.That(child.IsDisposed);Assert.That(world.Count,Is.Zero);parent.Dispose();
        }
        [Test]public void AttachedFactoryCannotDestroyExistingOwnership(){using var world=new EntityWorld();var parent=world.Create<Entity>();var child=parent.AddChild<Entity>();Assert.Throws<InvalidOperationException>(()=>world.Create(parent,()=>child));Assert.That(world.TryResolve(child.Handle,out _));Assert.That(world.Count,Is.EqualTo(2));}
        [Test]public async Task OwnerDoesNotRetainCompletedWorkerResultsAndWaitsForCancellation(){
            var owner=new LifetimeScope();for(int i=0;i<1000;i++)owner.Track(UniTask.CompletedTask);Assert.That(owner.TrackedTaskCount,Is.Zero);
            bool finished=false;async UniTask Worker(){try{await Task.Delay(100000,owner.Token);}finally{finished=true;}}
            owner.Track(Worker());Assert.That(owner.TrackedTaskCount,Is.EqualTo(1));await owner.StopAsync();Assert.That(finished);Assert.That(owner.TrackedTaskCount,Is.Zero);await owner.StopAsync();
        }
        [Test]public async Task OwnerReportsFaultButStillJoinsOtherWorkers(){
            var owner=new LifetimeScope();var signal=new TaskCompletionSource<bool>();bool finished=false;
            async UniTask Fault(){await Task.Yield();throw new InvalidOperationException("worker");}
            async UniTask Worker(){await signal.Task;finished=true;}
            owner.Track(Fault());owner.Track(Worker());var stopping=owner.StopAsync().AsTask();Assert.That(stopping.IsCompleted,Is.False);signal.SetResult(true);
            try{await stopping;Assert.Fail("Fault must be observed");}catch(InvalidOperationException){}Assert.That(finished);Assert.That(owner.TrackedTaskCount,Is.Zero);
        }
        public sealed class InitializationProbe:Entity{}
        private sealed class FailingInitialization:EntitySystem<InitializationProbe>{public override void Initialize(InitializationProbe target){target.AddChild<Entity>();throw new InvalidOperationException("initialization");}}
        private sealed class ThrowingDisposable:IDisposable{public void Dispose()=>throw new InvalidOperationException("cleanup");}
        private sealed class FailEffect:IActionEffect{public UniTask ExecuteAsync(GameActionContext c,ActionExecution e,CancellationToken t)=>throw new InvalidOperationException("effect failure");}
        private sealed class CancelEffect:IActionEffect{private readonly CancellationTokenSource _source;public CancelEffect(CancellationTokenSource source)=>_source=source;public UniTask ExecuteAsync(GameActionContext c,ActionExecution e,CancellationToken t){_source.Cancel();return UniTask.CompletedTask;}}
        private sealed class BothEffect:IActionEffect{public UniTask ExecuteAsync(GameActionContext c,ActionExecution e,CancellationToken t){c.Source.Numeric.SetBaseValue(Health,90);c.Target.Numeric.SetBaseValue(Health,180);return UniTask.CompletedTask;}}
    }
}
