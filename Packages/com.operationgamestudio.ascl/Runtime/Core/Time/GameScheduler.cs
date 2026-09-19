using System;
using System.Collections.Generic;
using System.Threading;
using Cysharp.Threading.Tasks;

namespace ASCL.Time {
    public readonly struct TimerHandle:IEquatable<TimerHandle> {
        internal TimerHandle(long owner,long id){Owner=owner;Id=id;}
        internal long Owner{get;} internal long Id{get;}
        public bool IsValid=>Owner>0&&Id>0;
        public bool Equals(TimerHandle other)=>Owner==other.Owner&&Id==other.Id;
        public override bool Equals(object? obj)=>obj is TimerHandle other&&Equals(other);
        public override int GetHashCode()=>HashCode.Combine(Owner,Id);
    }
    /// <summary>Callbacks run on Tick's caller; cancellation can arrive from any thread.</summary>
    public sealed class GameScheduler:IDisposable {
        private static long s_owner;
        private readonly long _owner=Interlocked.Increment(ref s_owner);
        private readonly IGameClock _clock;
        private readonly object _gate=new();
        private readonly List<Item> _items;
        private long _nextId;
        private bool _disposed;
        public GameScheduler(IGameClock clock,int capacity=32){_clock=clock??throw new ArgumentNullException(nameof(clock));if(capacity<0)throw new ArgumentOutOfRangeException(nameof(capacity));_items=new List<Item>(capacity);}
        public int Count{get{lock(_gate)return _items.Count;}}
        public TimerHandle Schedule(float delay,Action callback){if(callback==null)throw new ArgumentNullException(nameof(callback));return Add(delay,callback,null).Handle;}
        private Item Add(float delay,Action callback,UniTaskCompletionSource? completion){
            if(delay<0||float.IsNaN(delay)||float.IsInfinity(delay))throw new ArgumentOutOfRangeException(nameof(delay));
            lock(_gate){if(_disposed)throw new ObjectDisposedException(nameof(GameScheduler));var item=new Item(new TimerHandle(_owner,checked(++_nextId)),_clock.Time+delay,callback,completion);_items.Add(item);return item;}
        }
        public bool Cancel(TimerHandle handle)=>Cancel(handle,default);
        private bool Cancel(TimerHandle handle,CancellationToken token){
            Item? item=null;lock(_gate){if(handle.Owner!=_owner)return false;int index=_items.FindIndex(x=>x.Handle.Equals(handle));if(index<0)return false;item=_items[index];_items.RemoveAt(index);}
            item.Cancel(token);return true;
        }
        public void Tick(){
            while(true){Item? due=null;lock(_gate){if(_disposed)return;int chosen=-1;for(int i=0;i<_items.Count;i++)if(_items[i].Due<=_clock.Time&&(chosen<0||_items[i].Due<_items[chosen].Due||(_items[i].Due==_items[chosen].Due&&_items[i].Handle.Id<_items[chosen].Handle.Id)))chosen=i;if(chosen<0)return;due=_items[chosen];_items.RemoveAt(chosen);}
                due.Complete();
            }
        }
        public UniTask DelayAsync(float delay,CancellationToken cancellationToken=default){
            if(cancellationToken.IsCancellationRequested)return UniTask.FromCanceled(cancellationToken);
            var source=new UniTaskCompletionSource();var item=Add(delay,()=>{},source);
            if(cancellationToken.CanBeCanceled){var registration=cancellationToken.Register(()=>Cancel(item.Handle,cancellationToken));bool retained;lock(_gate){retained=_items.Contains(item);if(retained)item.Registration=registration;}if(!retained)registration.Dispose();}
            return source.Task;
        }
        public void Clear(){Item[] cancelled;lock(_gate){cancelled=_items.ToArray();_items.Clear();}foreach(var item in cancelled)item.Cancel(default);}
        public void Dispose(){lock(_gate){if(_disposed)return;_disposed=true;}Clear();}
        private sealed class Item {
            public readonly TimerHandle Handle; public readonly double Due; private readonly Action _callback;private readonly UniTaskCompletionSource? _completion;
            public CancellationTokenRegistration Registration;
            public Item(TimerHandle handle,double due,Action callback,UniTaskCompletionSource? completion){Handle=handle;Due=due;_callback=callback;_completion=completion;}
            public void Cancel(CancellationToken token){Registration.Dispose();_completion?.TrySetCanceled(token);}
            public void Complete(){Registration.Dispose();if(_completion!=null)_completion.TrySetResult();else _callback();}
        }
    }
}
