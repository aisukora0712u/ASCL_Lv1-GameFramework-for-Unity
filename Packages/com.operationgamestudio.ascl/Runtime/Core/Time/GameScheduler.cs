using System;
using System.Collections.Generic;
using System.Threading;
using Cysharp.Threading.Tasks;

namespace ASCL.Time {
    public readonly struct TimerHandle:IEquatable<TimerHandle>{internal TimerHandle(int id,int generation){Id=id;Generation=generation;}internal int Id{get;}internal int Generation{get;}public bool IsValid=>Id!=0&&Generation!=0;public bool Equals(TimerHandle other)=>Id==other.Id&&Generation==other.Generation;public override bool Equals(object? obj)=>obj is TimerHandle other&&Equals(other);public override int GetHashCode()=>HashCode.Combine(Id,Generation);}

    public sealed class GameScheduler {
        private readonly IGameClock _clock;private readonly List<Item> _heap=new();private readonly HashSet<TimerHandle> _cancelled=new();private int _nextId=1;private int _generation=1;private long _sequence;
        public GameScheduler(IGameClock clock,int capacity=32){_clock=clock??throw new ArgumentNullException(nameof(clock));if(capacity<0)throw new ArgumentOutOfRangeException(nameof(capacity));_heap.Capacity=capacity;}
        public int Count=>_heap.Count;
        public TimerHandle Schedule(float delay,Action callback){if(delay<0||float.IsNaN(delay)||float.IsInfinity(delay))throw new ArgumentOutOfRangeException(nameof(delay));if(callback==null)throw new ArgumentNullException(nameof(callback));var handle=new TimerHandle(_nextId++,_generation);Push(new Item(handle,_clock.Time+delay,_sequence++,callback));return handle;}
        public bool Cancel(TimerHandle handle){if(!handle.IsValid||handle.Generation!=_generation)return false;return _cancelled.Add(handle);}
        public void Tick(){while(_heap.Count>0&&_heap[0].Due<=_clock.Time){Item item=Pop();if(_cancelled.Remove(item.Handle))continue;item.Callback();}}
        public UniTask DelayAsync(float delay,CancellationToken cancellationToken=default){if(cancellationToken.IsCancellationRequested)return UniTask.FromCanceled(cancellationToken);var source=new UniTaskCompletionSource();TimerHandle handle=default;CancellationTokenRegistration registration=default;handle=Schedule(delay,()=>{registration.Dispose();source.TrySetResult();});if(cancellationToken.CanBeCanceled)registration=cancellationToken.Register(()=>{if(Cancel(handle))source.TrySetCanceled(cancellationToken);});return source.Task;}
        public void Clear(){_heap.Clear();_cancelled.Clear();_generation++;if(_generation<=0)_generation=1;}
        private void Push(Item item){_heap.Add(item);int index=_heap.Count-1;while(index>0){int parent=(index-1)/2;if(Compare(_heap[parent],item)<=0)break;_heap[index]=_heap[parent];index=parent;}_heap[index]=item;}
        private Item Pop(){Item root=_heap[0];int lastIndex=_heap.Count-1;Item last=_heap[lastIndex];_heap.RemoveAt(lastIndex);if(lastIndex==0)return root;int index=0;while(true){int left=index*2+1;if(left>=lastIndex)break;int right=left+1;int child=right<lastIndex&&Compare(_heap[right],_heap[left])<0?right:left;if(Compare(last,_heap[child])<=0)break;_heap[index]=_heap[child];index=child;}_heap[index]=last;return root;}
        private static int Compare(Item a,Item b){int due=a.Due.CompareTo(b.Due);return due!=0?due:a.Sequence.CompareTo(b.Sequence);}
        private readonly struct Item{public Item(TimerHandle handle,double due,long sequence,Action callback){Handle=handle;Due=due;Sequence=sequence;Callback=callback;}public TimerHandle Handle{get;}public double Due{get;}public long Sequence{get;}public Action Callback{get;}}
    }
}
