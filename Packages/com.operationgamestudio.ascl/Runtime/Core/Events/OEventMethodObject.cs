using System;
using Cysharp.Threading.Tasks;
using OEvent.Module;

namespace OEvent {
    [AttributeUsage(AttributeTargets.Class, AllowMultiple = true, Inherited = true)]
    public abstract class OBaseAttribute : Attribute { }

    [AttributeUsage(AttributeTargets.Class, AllowMultiple = false, Inherited = true)]
    public class OEventAttribute : OBaseAttribute {
        public readonly uint Priority;
        public OEventAttribute(uint priority = 10000) => Priority = priority;
    }

    public interface IEventRegister {
        void Register(uint priority);
        void Unregister();
    }

    [OEvent]
    public abstract class OEventNoReturnMethodObject<TEventArg> : IEventRegister where TEventArg : struct {
        public void Register(uint priority) => OEventManager.Instance.Register(this, typeof(TEventArg), typeof(void), EventKind.Sync, priority);
        public void Unregister() => OEventManager.Instance.Unregister(this);
        public abstract void Run(TEventArg eventArgs);
    }

    [OEvent]
    public abstract class OEventNoReturnAsyncMethodObject<TEventArg> : IEventRegister where TEventArg : struct {
        public void Register(uint priority) => OEventManager.Instance.Register(this, typeof(TEventArg), typeof(void), EventKind.Async, priority);
        public void Unregister() => OEventManager.Instance.Unregister(this);
        public abstract UniTask Run(TEventArg eventArg);
    }

    [OEvent]
    public abstract class OEventWithReturnMethodObject<TEventArg, TResult> : IEventRegister
        where TEventArg : struct where TResult : class, new() {
        public void Register(uint priority) => OEventManager.Instance.Register(this, typeof(TEventArg), typeof(TResult), EventKind.SyncResult, priority);
        public void Unregister() => OEventManager.Instance.Unregister(this);
        // The original contract permits null as a successful result.
        public abstract TResult Run(TEventArg eventArg);
    }

    [OEvent]
    public abstract class OEventAsyncWithReturnMethodObject<TEventArg, TResult> : IEventRegister
        where TEventArg : struct where TResult : class, new() {
        public void Register(uint priority) => OEventManager.Instance.Register(this, typeof(TEventArg), typeof(TResult), EventKind.AsyncResult, priority);
        public void Unregister() => OEventManager.Instance.Unregister(this);
        public abstract UniTask<TResult> Run(TEventArg eventArg);
    }
}
