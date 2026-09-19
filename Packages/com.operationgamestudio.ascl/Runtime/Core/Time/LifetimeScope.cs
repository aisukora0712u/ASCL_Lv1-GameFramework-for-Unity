using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Cysharp.Threading.Tasks;
namespace ASCL.Time {
    /// <summary>Owner-thread lifetime. Dispose cancels; StopAsync additionally observes all tracked tasks.</summary>
    public sealed class LifetimeScope:IDisposable {
        private readonly CancellationTokenSource _source=new();
        private readonly CancellationToken _token;
        private readonly List<Task> _tasks=new();
        private readonly List<IDisposable> _owned=new();
        private bool _disposed;
        public LifetimeScope(){_token=_source.Token;}
        public CancellationToken Token=>_token;
        public T Own<T>(T resource) where T:IDisposable {if(_disposed)throw new ObjectDisposedException(nameof(LifetimeScope));if(resource==null)throw new ArgumentNullException(nameof(resource));_owned.Add(resource);return resource;}
        // Successful/cancelled workers no longer retain their results for the whole session.
        public int TrackedTaskCount { get { PruneCompleted();return _tasks.Count; } }
        private void PruneCompleted()=>_tasks.RemoveAll(task=>task.Status==TaskStatus.RanToCompletion||task.IsCanceled);
        public void Track(UniTask task){if(_disposed)throw new ObjectDisposedException(nameof(LifetimeScope));PruneCompleted();var observed=task.AsTask();if(observed.Status!=TaskStatus.RanToCompletion&&!observed.IsCanceled)_tasks.Add(observed);}
        public async UniTask StopAsync(){Exception? cleanup=null;try{Dispose();}catch(Exception e){cleanup=e;}try{await Task.WhenAll(_tasks);}catch(OperationCanceledException){}finally{_tasks.Clear();}if(cleanup!=null)throw cleanup;}
        public void Dispose(){if(_disposed)return;_disposed=true;var errors=new List<Exception>();try{_source.Cancel();}catch(Exception e){errors.Add(e);}for(int i=_owned.Count-1;i>=0;i--)try{_owned[i].Dispose();}catch(Exception e){errors.Add(e);}_owned.Clear();_source.Dispose();if(errors.Count>0)throw new AggregateException(errors);}
    }
}
