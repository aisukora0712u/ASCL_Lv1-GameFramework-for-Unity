using System;
using System.Collections.Generic;
using System.Threading;
using ASCL.Gameplay.Actions;
using ASCL.Gameplay.Numeric;
using Cysharp.Threading.Tasks;

namespace ASCL.Gameplay.Buffs {
    public enum BuffStackPolicy:byte{Independent,RefreshDuration,AddStack,AddDuration,Replace,Ignore}
    public enum BuffApplyStatus:byte{Applied,Refreshed,Stacked,Replaced,Ignored,Rejected}
    public enum BuffRemovalReason:byte{Manual,Expired,Replaced,Dispelled,OwnerDisposed}

    public interface IBuffEffectDefinition { IBuffEffectRuntime CreateRuntime(); }
    public interface IBuffEffectRuntime {
        UniTask OnApplyAsync(BuffInstance instance,ActionExecution execution,CancellationToken cancellationToken);
        UniTask OnStackChangedAsync(BuffInstance instance,int oldStacks,ActionExecution? execution,CancellationToken cancellationToken);
        UniTask OnActionAsync(BuffInstance instance,ActionPhase phase,GameActionContext context,ActionExecution execution,CancellationToken cancellationToken);
        UniTask OnRemoveAsync(BuffInstance instance,BuffRemovalReason reason,ActionExecution? execution,CancellationToken cancellationToken);
    }

    public sealed class BuffDefinition {
        public BuffDefinition(string id,float duration,int maxStacks,BuffStackPolicy stackPolicy,IReadOnlyList<IBuffEffectDefinition>? effects=null,IReadOnlyList<BuffDefinition>? children=null,bool permanent=false) {
            if(string.IsNullOrWhiteSpace(id))throw new ArgumentException("Buff id is required.",nameof(id));if(!permanent&&(duration<0||float.IsNaN(duration)||float.IsInfinity(duration)))throw new ArgumentOutOfRangeException(nameof(duration));if(maxStacks<1)throw new ArgumentOutOfRangeException(nameof(maxStacks));
            Id=id.Trim();Duration=duration;MaxStacks=maxStacks;StackPolicy=stackPolicy;Effects=effects??Array.Empty<IBuffEffectDefinition>();Children=children??Array.Empty<BuffDefinition>();Permanent=permanent;
        }
        public string Id{get;} public float Duration{get;} public int MaxStacks{get;} public BuffStackPolicy StackPolicy{get;} public bool Permanent{get;} public IReadOnlyList<IBuffEffectDefinition> Effects{get;} public IReadOnlyList<BuffDefinition> Children{get;}
        public void ValidateGraph(){var visiting=new HashSet<BuffDefinition>();var visited=new HashSet<BuffDefinition>();Visit(this,visiting,visited);}
        private static void Visit(BuffDefinition value,HashSet<BuffDefinition> visiting,HashSet<BuffDefinition> visited){if(visited.Contains(value))return;if(!visiting.Add(value))throw new InvalidOperationException($"Buff composition cycle detected at '{value.Id}'.");for(int i=0;i<value.Children.Count;i++)Visit(value.Children[i],visiting,visited);visiting.Remove(value);visited.Add(value);}
    }

    public readonly struct BuffHandle:IEquatable<BuffHandle>{internal BuffHandle(int owner,int id,int generation){Owner=owner;Id=id;Generation=generation;}internal int Owner{get;}internal int Id{get;}internal int Generation{get;}public bool IsValid=>Owner!=0&&Id!=0&&Generation!=0;public bool Equals(BuffHandle other)=>Owner==other.Owner&&Id==other.Id&&Generation==other.Generation;public override bool Equals(object? obj)=>obj is BuffHandle other&&Equals(other);public override int GetHashCode()=>HashCode.Combine(Owner,Id,Generation);}
    public readonly struct BuffApplyResult{internal BuffApplyResult(BuffApplyStatus status,BuffHandle handle){Status=status;Handle=handle;}public BuffApplyStatus Status{get;}public BuffHandle Handle{get;}}

    public sealed class BuffInstance {
        internal BuffInstance(BuffHandle handle,BuffDefinition definition,Combatant source,Combatant owner){Handle=handle;Definition=definition;Source=source;Owner=owner;Stacks=1;Remaining=definition.Permanent?float.PositiveInfinity:definition.Duration;Runtimes=new IBuffEffectRuntime[definition.Effects.Count];for(int i=0;i<Runtimes.Length;i++)Runtimes[i]=definition.Effects[i].CreateRuntime();ChildLinks=new ChildBuffLink[definition.Children.Count];}
        public BuffHandle Handle{get;} public BuffDefinition Definition{get;} public Combatant Source{get;} public Combatant Owner{get;} public int Stacks{get;internal set;} public float Remaining{get;internal set;} internal IBuffEffectRuntime[] Runtimes{get;} internal ChildBuffLink[] ChildLinks{get;}
    }

    internal readonly struct ChildBuffLink{public ChildBuffLink(BuffHandle handle,BuffApplyStatus status){Handle=handle;Status=status;}public BuffHandle Handle{get;}public BuffApplyStatus Status{get;}}

    public sealed class BuffController {
        private static int s_owner;private readonly int _owner=System.Threading.Interlocked.Increment(ref s_owner);private readonly List<BuffInstance> _items=new();private readonly List<BuffHandle> _scratch=new();private int _nextId=1;private int _generation=1;
        internal BuffController(Combatant owner)=>Owner=owner;
        public Combatant Owner{get;} public IReadOnlyList<BuffInstance> Active=>_items;
        public async UniTask<BuffApplyResult> ApplyAsync(BuffDefinition definition,Combatant source,ActionExecution execution,CancellationToken cancellationToken=default){
            if(definition==null)throw new ArgumentNullException(nameof(definition));definition.ValidateGraph();BuffInstance? existing=Find(definition.Id);
            if(existing!=null&&existing.Definition!=definition&&definition.StackPolicy!=BuffStackPolicy.Replace)return new BuffApplyResult(BuffApplyStatus.Rejected,existing.Handle);
            switch(definition.StackPolicy){
                case BuffStackPolicy.Independent:return await AddAsync(definition,source,execution,BuffApplyStatus.Applied,cancellationToken);
                case BuffStackPolicy.RefreshDuration:if(existing!=null){existing.Remaining=definition.Duration;return new BuffApplyResult(BuffApplyStatus.Refreshed,existing.Handle);}break;
                case BuffStackPolicy.AddStack:if(existing!=null){int old=existing.Stacks;if(existing.Stacks<definition.MaxStacks)existing.Stacks++;existing.Remaining=definition.Duration;for(int i=0;i<existing.Runtimes.Length;i++)await existing.Runtimes[i].OnStackChangedAsync(existing,old,execution,cancellationToken);return new BuffApplyResult(old==existing.Stacks?BuffApplyStatus.Refreshed:BuffApplyStatus.Stacked,existing.Handle);}break;
                case BuffStackPolicy.AddDuration:if(existing!=null){existing.Remaining+=definition.Duration;return new BuffApplyResult(BuffApplyStatus.Refreshed,existing.Handle);}break;
                case BuffStackPolicy.Replace:if(existing!=null){await RemoveByIdAsync(definition.Id,BuffRemovalReason.Replaced,execution,cancellationToken);return await AddAsync(definition,source,execution,BuffApplyStatus.Replaced,cancellationToken);}break;
                case BuffStackPolicy.Ignore:if(existing!=null)return new BuffApplyResult(BuffApplyStatus.Ignored,existing.Handle);break;
            }
            return await AddAsync(definition,source,execution,BuffApplyStatus.Applied,cancellationToken);
        }
        public async UniTask TickAsync(float deltaTime,CancellationToken cancellationToken=default){if(deltaTime<0||float.IsNaN(deltaTime)||float.IsInfinity(deltaTime))throw new ArgumentOutOfRangeException(nameof(deltaTime));_scratch.Clear();for(int i=0;i<_items.Count;i++){BuffInstance b=_items[i];if(b.Definition.Permanent)continue;b.Remaining-=deltaTime;if(b.Remaining<=0)_scratch.Add(b.Handle);}for(int i=0;i<_scratch.Count;i++)await RemoveAsync(_scratch[i],BuffRemovalReason.Expired,null,cancellationToken);}
        public async UniTask<bool> RemoveAsync(BuffHandle handle,BuffRemovalReason reason=BuffRemovalReason.Manual,ActionExecution? execution=null,CancellationToken cancellationToken=default){if(!Owns(handle))return false;for(int i=0;i<_items.Count;i++)if(_items[i].Handle.Equals(handle)){BuffInstance b=_items[i];_items.RemoveAt(i);for(int j=b.ChildLinks.Length-1;j>=0;j--)await RemoveChildLinkAsync(b.ChildLinks[j],reason,execution,cancellationToken);for(int j=b.Runtimes.Length-1;j>=0;j--)await b.Runtimes[j].OnRemoveAsync(b,reason,execution,cancellationToken);return true;}return false;}
        internal async UniTask DispatchAsync(ActionPhase phase,GameActionContext context,ActionExecution execution,CancellationToken cancellationToken){int count=_items.Count;for(int i=0;i<count&&i<_items.Count;i++){BuffInstance b=_items[i];for(int j=0;j<b.Runtimes.Length;j++)await b.Runtimes[j].OnActionAsync(b,phase,context,execution,cancellationToken);}}
        private async UniTask<BuffApplyResult> AddAsync(BuffDefinition d,Combatant source,ActionExecution execution,BuffApplyStatus status,CancellationToken ct){var h=new BuffHandle(_owner,_nextId++,_generation);var b=new BuffInstance(h,d,source,Owner);_items.Add(b);for(int i=0;i<b.Runtimes.Length;i++)await b.Runtimes[i].OnApplyAsync(b,execution,ct);for(int i=0;i<d.Children.Count;i++){BuffApplyResult child=await ApplyAsync(d.Children[i],source,execution,ct);b.ChildLinks[i]=new ChildBuffLink(child.Handle,child.Status);}return new BuffApplyResult(status,h);}
        private async UniTask RemoveChildLinkAsync(ChildBuffLink link,BuffRemovalReason reason,ActionExecution? execution,CancellationToken ct){if(!link.Handle.IsValid)return;if(link.Status==BuffApplyStatus.Stacked){for(int i=0;i<_items.Count;i++)if(_items[i].Handle.Equals(link.Handle)){BuffInstance child=_items[i];int old=child.Stacks;if(child.Stacks>1){child.Stacks--;for(int j=0;j<child.Runtimes.Length;j++)await child.Runtimes[j].OnStackChangedAsync(child,old,execution,ct);}else await RemoveAsync(child.Handle,reason,execution,ct);return;}}else if(link.Status is BuffApplyStatus.Applied or BuffApplyStatus.Replaced)await RemoveAsync(link.Handle,reason,execution,ct);}
        private async UniTask RemoveByIdAsync(string id,BuffRemovalReason reason,ActionExecution execution,CancellationToken ct){_scratch.Clear();for(int i=0;i<_items.Count;i++)if(_items[i].Definition.Id==id)_scratch.Add(_items[i].Handle);for(int i=0;i<_scratch.Count;i++)await RemoveAsync(_scratch[i],reason,execution,ct);}
        private BuffInstance? Find(string id){for(int i=0;i<_items.Count;i++)if(_items[i].Definition.Id==id)return _items[i];return null;}private bool Owns(BuffHandle h)=>h.IsValid&&h.Owner==_owner&&h.Generation==_generation;
    }

    public sealed class NumericBuffEffectDefinition:IBuffEffectDefinition {
        public NumericBuffEffectDefinition(NumericKey key,NumericModifierKind kind,float valuePerStack,int priority=0){Key=key;Kind=kind;ValuePerStack=valuePerStack;Priority=priority;}
        public NumericKey Key{get;}public NumericModifierKind Kind{get;}public float ValuePerStack{get;}public int Priority{get;}public IBuffEffectRuntime CreateRuntime()=>new Runtime(this);
        private sealed class Runtime:IBuffEffectRuntime{private readonly NumericBuffEffectDefinition _d;private NumericModifierHandle _handle;public Runtime(NumericBuffEffectDefinition d)=>_d=d;public UniTask OnApplyAsync(BuffInstance i,ActionExecution e,CancellationToken c){_handle=i.Owner.Numeric.AddModifier(_d.Key,_d.Kind,_d.ValuePerStack*i.Stacks,i,_d.Priority);return UniTask.CompletedTask;}public UniTask OnStackChangedAsync(BuffInstance i,int old,ActionExecution? e,CancellationToken c){i.Owner.Numeric.SetModifierValue(_handle,_d.ValuePerStack*i.Stacks);return UniTask.CompletedTask;}public UniTask OnActionAsync(BuffInstance i,ActionPhase p,GameActionContext c,ActionExecution e,CancellationToken t)=>UniTask.CompletedTask;public UniTask OnRemoveAsync(BuffInstance i,BuffRemovalReason r,ActionExecution? e,CancellationToken c){i.Owner.Numeric.RemoveModifier(_handle);return UniTask.CompletedTask;}}
    }
}
