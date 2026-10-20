#nullable enable
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using ASCL.Diagnostics;
using Cysharp.Threading.Tasks;
using NUnit.Framework;
using OEvent;
using OEvent.Module;

namespace ASCL.Tests {
#if !UNITY_5_3_OR_NEWER
    // Unity's NUnit fork does not expose this attribute and runs these fixtures serially.
    [NonParallelizable]
#endif
    public sealed class OEventTests {
        private static OEventManager Manager => OEventManager.Instance;
        public sealed class A { }
        public sealed class B { }
        public sealed class C { }
        public sealed class Reply { }
        public sealed class OtherReply { }
        public sealed class Context {
            public readonly List<string> Calls = new();
            public Action<Type>? Sync;
            public Func<Type, UniTask>? Async;
            public Func<Type, object?>? Result;
            public Func<Type, UniTask<object?>>? AsyncResult;
        }
        public readonly struct Message {
            public readonly Context Context;
            public Message(Context context) => Context = context;
        }
        // Open generic definitions are deliberately not auto-discovered. Explicit
        // closed types keep negative fixtures out of application startup discovery.
        public sealed class Sync<T> : OEventNoReturnMethodObject<Message> {
            public override void Run(Message message) {
                message.Context.Calls.Add(typeof(T).Name);
                message.Context.Sync?.Invoke(typeof(T));
            }
        }
        public sealed class Async<T> : OEventNoReturnAsyncMethodObject<Message> {
            public override async UniTask Run(Message message) {
                message.Context.Calls.Add(typeof(T).Name);
                if (message.Context.Async != null) await message.Context.Async(typeof(T));
            }
        }
        public sealed class Result<T, R> : OEventWithReturnMethodObject<Message, R> where R : class, new() {
            public override R Run(Message message) {
                message.Context.Calls.Add(typeof(T).Name);
                return (R)message.Context.Result!(typeof(T))!;
            }
        }
        public sealed class AsyncResult<T, R> : OEventAsyncWithReturnMethodObject<Message, R> where R : class, new() {
            public override async UniTask<R> Run(Message message) {
                message.Context.Calls.Add(typeof(T).Name);
                return (R)(await message.Context.AsyncResult!(typeof(T)))!;
            }
        }
        [OEvent]
        public sealed class FailingRegister<T> : IEventRegister {
            private readonly Sync<T> _handler = new();
            public void Register(uint priority) { _handler.Register(priority); throw new InvalidOperationException("registration fixture"); }
            public void Unregister() => _handler.Unregister();
        }
        public sealed class FailingConstructor<T> : OEventNoReturnMethodObject<Message> {
            public FailingConstructor() => throw new InvalidOperationException("constructor fixture");
            public override void Run(Message message) { }
        }
        public sealed class NoDefaultConstructor<T> : OEventNoReturnMethodObject<Message> {
            public NoDefaultConstructor(int _) { }
            public override void Run(Message message) { }
        }
        private sealed class Log : ILogSink {
            public readonly List<string> Messages = new();
            public void Write(LogLevel level, string message, Exception? exception = null) => Messages.Add(message);
        }

        [SetUp] public void SetUp() { Manager.Dispose(); Manager.Init(Array.Empty<Type>()); }
        [TearDown] public void TearDown() => Manager.Dispose();

        [Test] public void AutomaticDiscoveryIncludesInheritedAttributeAndStableTypeOrder() {
            Manager.Dispose();
            Manager.Init();
            int count = Manager.RegisteredHandlerCount;
            Manager.Init();
            var calls = new List<string>();
            Manager.BroadcastEvent(new AutoProbe(calls));
            Assert.That(calls, Is.EqualTo(new[] { "A", "B" }));
            Assert.That(Manager.RegisteredHandlerCount, Is.EqualTo(count));
            Assert.That(OEventReflectionHelper.GetTypesWithAttributeFromAssembly<OEventAttribute>(typeof(AutoA).Assembly), Does.Contain(typeof(AutoA)));
        }

        [Test] public void ExplicitInitializationSortsTypesAndDeduplicatesInput() {
            Manager.Dispose();
            Manager.Init(new[] { typeof(Sync<B>), typeof(Sync<A>), typeof(Sync<A>) });
            var c = new Context();
            Manager.BroadcastEvent(new Message(c));
            Assert.That(c.Calls, Is.EqualTo(new[] { "A", "B" }));
            Assert.That(Manager.RegisteredHandlerCount, Is.EqualTo(2));
        }

        [Test] public void PriorityStableTiesAndSelfRemoval() {
            var a = new Sync<A>(); var b = new Sync<B>(); var cHandler = new Sync<C>();
            b.Register(20); a.Register(10); cHandler.Register(20);
            var c = new Context { Sync = t => { if (t == typeof(B)) b.Unregister(); } };
            Manager.BroadcastEvent(new Message(c)); Manager.BroadcastEvent(new Message(c));
            Assert.That(c.Calls, Is.EqualTo(new[] { "A", "B", "C", "A", "C" }));
        }

        [Test] public void AddedHandlersWaitForNextBroadcastAndRemovalIsImmediate() {
            var a = new Sync<A>(); var b = new Sync<B>(); var next = new Sync<C>();
            a.Register(10); b.Register(20);
            var c = new Context { Sync = t => { if (t == typeof(A)) { next.Register(0); b.Unregister(); } } };
            Manager.BroadcastEvent(new Message(c)); Manager.BroadcastEvent(new Message(c));
            Assert.That(c.Calls, Is.EqualTo(new[] { "A", "C", "A" }));
        }

        [Test] public void NestedBroadcastGetsItsOwnStableCandidates() {
            var a = new Sync<A>(); var b = new Sync<B>(); var next = new Sync<C>();
            a.Register(10); b.Register(20);
            var c = new Context(); bool nested = false;
            c.Sync = t => { if (t == typeof(A) && !nested) { nested = true; next.Register(0); Manager.BroadcastEvent(new Message(c)); b.Unregister(); } };
            Manager.BroadcastEvent(new Message(c));
            Assert.That(c.Calls, Is.EqualTo(new[] { "A", "C", "A", "B" }));
        }

        [Test] public void DuplicateRegistrationAndWrongInstanceRemovalAreHarmless() {
            var original = new Sync<A>(); var other = new Sync<A>(); var log = new Log();
            Manager.Dispose(); Manager.Init(Array.Empty<Type>(), log);
            original.Register(10); original.Register(0); other.Register(0); other.Unregister();
            var c = new Context(); Manager.BroadcastEvent(new Message(c));
            Assert.That(c.Calls, Is.EqualTo(new[] { "A" }));
            original.Unregister(); original.Unregister();
            Assert.That(Manager.RegisteredHandlerCount, Is.Zero);
            Assert.That(log.Messages, Is.Empty);
        }

        [Test] public async Task AsyncHandlersAreAwaitedAndSeeRemovalWhileSuspended() {
            var gate = new UniTaskCompletionSource();
            var a = new Async<A>(); var b = new Async<B>(); var next = new Async<C>();
            b.Register(20); a.Register(10);
            var c = new Context { Async = t => t == typeof(A) ? gate.Task : UniTask.CompletedTask };
            Task pending = Manager.BroadcastEventAsync(new Message(c)).AsTask();
            try {
                Assert.That(pending.IsCompleted, Is.False);
                Assert.That(c.Calls, Is.EqualTo(new[] { "A" }));
                b.Unregister(); next.Register(0);
            } finally { gate.TrySetResult(); }
            await pending;
            c.Async = null;
            await Manager.BroadcastEventAsync(new Message(c));
            Assert.That(c.Calls, Is.EqualTo(new[] { "A", "C", "A" }));
        }

        [Test] public void NoReturnFailureStopsLaterHandlers() {
            new Sync<A>().Register(0); new Sync<B>().Register(1);
            var c = new Context { Sync = _ => throw new InvalidOperationException("expected") };
            Assert.Throws<InvalidOperationException>(() => Manager.BroadcastEvent(new Message(c)));
            Assert.That(c.Calls, Is.EqualTo(new[] { "A" }));
        }

        [Test] public void AsyncNoReturnFailureStopsLaterHandlers() {
            new Async<A>().Register(0); new Async<B>().Register(1);
            var c = new Context { Async = _ => UniTask.FromException(new InvalidOperationException("expected")) };
            Assert.ThrowsAsync<InvalidOperationException>(async () => await Manager.BroadcastEventAsync(new Message(c)));
            Assert.That(c.Calls, Is.EqualTo(new[] { "A" }));
        }

        [Test] public void ResultFallsBackOnFailureButNullIsSuccessful() {
            Manager.Dispose(); var log = new Log(); Manager.Init(Array.Empty<Type>(), log);
            new Result<A, Reply>().Register(0); new Result<B, Reply>().Register(1); new Result<C, Reply>().Register(2);
            var c = new Context { Result = t => t == typeof(A) ? throw new InvalidOperationException("expected") : null };
            Assert.That(Manager.BroadcastEventWithReturn<Message, Reply>(new Message(c)), Is.Null);
            Assert.That(c.Calls, Is.EqualTo(new[] { "A", "B" }));
            Assert.That(log.Messages.Count, Is.EqualTo(1));
        }

        [Test] public async Task AsyncResultFallsBackAndReturnsFirstValue() {
            var log = new Log(); Manager.Dispose(); Manager.Init(Array.Empty<Type>(), log);
            new AsyncResult<A, Reply>().Register(0); new AsyncResult<B, Reply>().Register(1); new AsyncResult<C, Reply>().Register(2);
            var expected = new Reply();
            var c = new Context { AsyncResult = t => t == typeof(A) ? UniTask.FromException<object?>(new InvalidOperationException("expected")) : UniTask.FromResult<object?>(expected) };
            Assert.That(await Manager.BroadcastEventAsyncWithReturn<Message, Reply>(new Message(c)), Is.SameAs(expected));
            Assert.That(c.Calls, Is.EqualTo(new[] { "A", "B" }));
            Assert.That(log.Messages.Count, Is.EqualTo(1));
        }

        [Test] public async Task AsyncNullResultStopsFallback() {
            new AsyncResult<A, Reply>().Register(0); new AsyncResult<B, Reply>().Register(1);
            var c = new Context { AsyncResult = _ => UniTask.FromResult<object?>(null) };
            Assert.That(await Manager.BroadcastEventAsyncWithReturn<Message, Reply>(new Message(c)), Is.Null);
            Assert.That(c.Calls, Is.EqualTo(new[] { "A" }));
        }

        [Test] public async Task ResultChannelsIncludeResultTypeAndMode() {
            new Result<A, Reply>().Register(0); new Result<B, OtherReply>().Register(0);
            new AsyncResult<A, Reply>().Register(0); new AsyncResult<B, OtherReply>().Register(0);
            var r = new Reply(); var other = new OtherReply();
            var c = new Context { Result = t => t == typeof(A) ? r : other,
                AsyncResult = t => UniTask.FromResult<object?>(t == typeof(A) ? r : other) };
            Assert.That(Manager.BroadcastEventWithReturn<Message, Reply>(new Message(c)), Is.SameAs(r));
            Assert.That(Manager.BroadcastEventWithReturn<Message, OtherReply>(new Message(c)), Is.SameAs(other));
            Assert.That(await Manager.BroadcastEventAsyncWithReturn<Message, Reply>(new Message(c)), Is.SameAs(r));
            Assert.That(await Manager.BroadcastEventAsyncWithReturn<Message, OtherReply>(new Message(c)), Is.SameAs(other));
        }

        [Test] public void CancellationNeverFallsBackToAnotherResultHandler() {
            new Result<A, Reply>().Register(0); new Result<B, Reply>().Register(1);
            new AsyncResult<A, Reply>().Register(0); new AsyncResult<B, Reply>().Register(1);
            var c = new Context { Result = _ => throw new OperationCanceledException(),
                AsyncResult = _ => UniTask.FromException<object?>(new OperationCanceledException()) };
            Assert.Throws<OperationCanceledException>(() => Manager.BroadcastEventWithReturn<Message, Reply>(new Message(c)));
            Assert.ThrowsAsync(Is.InstanceOf<OperationCanceledException>(), async () => await Manager.BroadcastEventAsyncWithReturn<Message, Reply>(new Message(c)));
            Assert.That(c.Calls, Is.EqualTo(new[] { "A", "A" }));
        }

        [Test] public async Task EmptyChannelsHaveOriginalNoOpAndDefaultResultBehavior() {
            var c = new Context();
            Manager.BroadcastEvent(new Message(c)); await Manager.BroadcastEventAsync(new Message(c));
            Assert.That(Manager.BroadcastEventWithReturn<Message, Reply>(new Message(c)), Is.Null);
            Assert.That(await Manager.BroadcastEventAsyncWithReturn<Message, Reply>(new Message(c)), Is.Null);
        }

        [TestCase(false)] [TestCase(true)]
        public async Task ResultFallbackUsesOriginalCandidatesAndImmediateRemoval(bool asynchronous) {
            var c = new Context();
            IEventRegister a = asynchronous ? new AsyncResult<A, Reply>() : new Result<A, Reply>();
            IEventRegister b = asynchronous ? new AsyncResult<B, Reply>() : new Result<B, Reply>();
            IEventRegister added = asynchronous ? new AsyncResult<C, Reply>() : new Result<C, Reply>();
            a.Register(0); b.Register(1);
            var expected = new Reply();
            c.Result = t => {
                if (t == typeof(A)) { a.Unregister(); b.Unregister(); added.Register(0); throw new InvalidOperationException("expected"); }
                return expected;
            };
            c.AsyncResult = t => UniTask.FromResult(c.Result(t));
            Reply first = asynchronous ? await Manager.BroadcastEventAsyncWithReturn<Message, Reply>(new Message(c)) : Manager.BroadcastEventWithReturn<Message, Reply>(new Message(c));
            Assert.That(first, Is.Null);
            Reply second = asynchronous ? await Manager.BroadcastEventAsyncWithReturn<Message, Reply>(new Message(c)) : Manager.BroadcastEventWithReturn<Message, Reply>(new Message(c));
            Assert.That(second, Is.SameAs(expected));
            Assert.That(c.Calls, Is.EqualTo(new[] { "A", "C" }));
        }

        [TestCase(typeof(FailingRegister<A>))]
        [TestCase(typeof(FailingConstructor<A>))]
        [TestCase(typeof(NoDefaultConstructor<A>))]
        [TestCase(typeof(Sync<>))]
        [TestCase(typeof(string))]
        public void FailedInitializationClearsPartialRegistrationAndCanRecover(Type invalid) {
            Manager.Dispose();
            var ex = Assert.Throws<InvalidOperationException>(() => Manager.Init(new[] { typeof(AutoA), invalid }));
            Assert.That(ex!.Message, Does.Contain(invalid.FullName));
            Assert.That(Manager.IsInitialized, Is.False);
            Assert.That(Manager.RegisteredHandlerCount, Is.Zero);
            Manager.Init(new[] { typeof(Sync<A>) });
            var c = new Context(); Manager.BroadcastEvent(new Message(c));
            Assert.That(c.Calls, Is.EqualTo(new[] { "A" }));
        }

        [Test] public void CleanupIsIdempotentAndOldObjectsCannotRemoveNewRegistration() {
            var old = new Sync<A>(); old.Register(0);
            Manager.Dispose(); Manager.Dispose();
            Assert.Throws<InvalidOperationException>(() => Manager.BroadcastEvent(new Message(new Context())));
            Manager.Init(new[] { typeof(Sync<A>) }); old.Unregister();
            var c = new Context(); Manager.BroadcastEvent(new Message(c));
            Assert.That(c.Calls, Is.EqualTo(new[] { "A" }));
        }

        [TestCase(false)] [TestCase(true)]
        public async Task SuspendedOldGenerationIsCancelledAfterCurrentHandlerFinishes(bool withReturn) {
            var gate = new UniTaskCompletionSource(); var c = new Context();
            c.Async = async _ => await gate.Task;
            c.AsyncResult = async _ => { await gate.Task; return new Reply(); };
            if (withReturn) { new AsyncResult<A, Reply>().Register(0); new AsyncResult<B, Reply>().Register(1); }
            else { new Async<A>().Register(0); new Async<B>().Register(1); }
            Task pending = withReturn ? Manager.BroadcastEventAsyncWithReturn<Message, Reply>(new Message(c)).AsTask() : Manager.BroadcastEventAsync(new Message(c)).AsTask();
            try {
                Manager.Dispose(); Manager.Init(new[] { typeof(Sync<C>) });
                Assert.That(pending.IsCompleted, Is.False, "Dispose must not pretend to force-stop an entered Run.");
            } finally { gate.TrySetResult(); }
            try { await pending; Assert.Fail("Old dispatch must cancel."); } catch (OperationCanceledException) { }
            Assert.That(c.Calls, Is.EqualTo(new[] { "A" }));
            Manager.BroadcastEvent(new Message(c));
            Assert.That(c.Calls, Is.EqualTo(new[] { "A", "C" }));
        }

        public readonly struct AutoProbe {
            public readonly List<string> Calls;
            public AutoProbe(List<string> calls) => Calls = calls;
        }
        // Real discoverable fixtures are stateless and operate on supplied data only.
        public sealed class AutoA : OEventNoReturnMethodObject<AutoProbe> {
            public override void Run(AutoProbe message) => message.Calls.Add("A");
        }
        public sealed class AutoB : OEventNoReturnMethodObject<AutoProbe> {
            public override void Run(AutoProbe message) => message.Calls.Add("B");
        }
    }
}
