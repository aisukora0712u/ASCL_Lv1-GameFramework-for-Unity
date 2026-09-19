using System;
using System.Collections.Generic;
using System.Threading;
using ASCL.Entities;
using ASCL.Gameplay.Buffs;
using ASCL.Gameplay.Numeric;
using Cysharp.Threading.Tasks;

namespace ASCL.Gameplay.Actions {
    [Flags] public enum ActionTags : ulong { None=0, Skill=1, Damage=2, Heal=4, Buff=8, Periodic=16, Critical=32 }
    public enum ActionPhase : byte { Validate, PreResolve, Resolve, PostResolve, Commit }

    public sealed class Combatant {
        public Combatant(EntityHandle entity, NumericTable numeric) { Entity=entity; Numeric=numeric??throw new ArgumentNullException(nameof(numeric)); Buffs=new BuffController(this); }
        public EntityHandle Entity { get; private set; }
        public void BindEntity(EntityHandle entity){if(Entity.IsValid || !entity.IsValid)throw new InvalidOperationException("Entity binding must occur once.");Entity=entity;}
        public NumericTable Numeric { get; }
        public BuffController Buffs { get; }
    }

    public readonly struct GameActionContext {
        public GameActionContext(int actionId, Combatant source, Combatant target, ActionTags tags = ActionTags.None, double magnitude = 0) {
            if (actionId<=0) throw new ArgumentOutOfRangeException(nameof(actionId)); ActionId=actionId; Source=source??throw new ArgumentNullException(nameof(source)); Target=target??throw new ArgumentNullException(nameof(target)); Tags=tags; Magnitude=magnitude;
        }
        public int ActionId { get; }
        public Combatant Source { get; }
        public Combatant Target { get; }
        public ActionTags Tags { get; }
        public double Magnitude { get; }
        public GameActionContext WithTarget(Combatant target) => new(ActionId,Source,target,Tags,Magnitude);
    }

    public struct ActionResult {
        internal ActionResult(bool succeeded,string? error,int effects,int depth){Succeeded=succeeded;Error=error;EffectsExecuted=effects;MaximumDepth=depth;NotificationErrors=Array.Empty<Exception>();}
        public bool Succeeded { get; }
        public string? Error { get; }
        public int EffectsExecuted { get; }
        public int MaximumDepth { get; }
        public IReadOnlyList<Exception> NotificationErrors { get; internal set; }
    }

    public interface IActionCondition { bool Evaluate(in GameActionContext context); }
    public interface IActionEffect { UniTask ExecuteAsync(GameActionContext context, ActionExecution execution, CancellationToken cancellationToken); }

    public sealed class ActionPipeline {
        public ActionPipeline(int maximumDepth=16,int maximumEffects=1024) { if(maximumDepth<1)throw new ArgumentOutOfRangeException(nameof(maximumDepth));if(maximumEffects<1)throw new ArgumentOutOfRangeException(nameof(maximumEffects));MaximumDepth=maximumDepth;MaximumEffects=maximumEffects; }
        public int MaximumDepth { get; }
        public int MaximumEffects { get; }
        public UniTask<ActionResult> ExecuteAsync(GameActionContext context,IReadOnlyList<IActionEffect> effects,CancellationToken cancellationToken=default) => ExecuteTransactionalAsync(context,effects,new CombatStateTransaction(new[]{context.Source,context.Target}),cancellationToken);
        public async UniTask<ActionResult> ExecuteTransactionalAsync(GameActionContext context,IReadOnlyList<IActionEffect> effects,IActionTransaction transaction,CancellationToken cancellationToken=default) {
            if(effects==null)throw new ArgumentNullException(nameof(effects));if(transaction==null)throw new ArgumentNullException(nameof(transaction));
            var budget=new Budget(MaximumDepth,MaximumEffects);var execution=new ActionExecution(this,budget,transaction);
            try {var draft=transaction.Prepare(context);await execution.ExecuteAsync(draft,effects,cancellationToken);cancellationToken.ThrowIfCancellationRequested();transaction.ValidateCommit();cancellationToken.ThrowIfCancellationRequested();transaction.Commit();}
            catch(OperationCanceledException){transaction.Rollback();throw;}
            catch(Exception error){transaction.Rollback();return new ActionResult(false,error.Message,budget.Effects,budget.MaxObservedDepth);}
            var errors=new List<Exception>();try{transaction.Publish(errors);}catch(Exception error){errors.Add(error);}
            return new ActionResult(true,null,budget.Effects,budget.MaxObservedDepth){NotificationErrors=errors.AsReadOnly()};
        }
        internal sealed class Budget { public Budget(int maxDepth,int maxEffects){MaxDepth=maxDepth;MaxEffects=maxEffects;} public int MaxDepth;public int MaxEffects;public int Depth;public int Effects;public int MaxObservedDepth; }
    }

    public sealed class ActionExecution {
        private readonly ActionPipeline _pipeline; private readonly ActionPipeline.Budget _budget;
        public IActionTransaction Transaction{get;}
        internal ActionExecution(ActionPipeline pipeline,ActionPipeline.Budget budget,IActionTransaction transaction){_pipeline=pipeline;_budget=budget;Transaction=transaction;}
        public async UniTask ExecuteNestedAsync(GameActionContext context,IReadOnlyList<IActionEffect> effects,CancellationToken cancellationToken=default)=>await ExecuteAsync(context,effects,cancellationToken);
        internal async UniTask ExecuteAsync(GameActionContext context,IReadOnlyList<IActionEffect> effects,CancellationToken cancellationToken) {
            cancellationToken.ThrowIfCancellationRequested(); if(++_budget.Depth>_budget.MaxDepth)throw new ActionBudgetExceededException("Action chain exceeded maximum depth."); if(_budget.Depth>_budget.MaxObservedDepth)_budget.MaxObservedDepth=_budget.Depth;
            try {
                await context.Target.Buffs.DispatchAsync(ActionPhase.Validate,context,this,cancellationToken);
                await context.Source.Buffs.DispatchAsync(ActionPhase.PreResolve,context,this,cancellationToken);
                if(!ReferenceEquals(context.Source,context.Target))await context.Target.Buffs.DispatchAsync(ActionPhase.PreResolve,context,this,cancellationToken);
                await context.Target.Buffs.DispatchAsync(ActionPhase.Resolve,context,this,cancellationToken);
                for(int i=0;i<effects.Count;i++){cancellationToken.ThrowIfCancellationRequested();if(++_budget.Effects>_budget.MaxEffects)throw new ActionBudgetExceededException("Action chain exceeded effect budget.");await effects[i].ExecuteAsync(context,this,cancellationToken);}
                await context.Source.Buffs.DispatchAsync(ActionPhase.PostResolve,context,this,cancellationToken);
                if(!ReferenceEquals(context.Source,context.Target))await context.Target.Buffs.DispatchAsync(ActionPhase.PostResolve,context,this,cancellationToken);
                await context.Target.Buffs.DispatchAsync(ActionPhase.Commit,context,this,cancellationToken);
            } finally {_budget.Depth--;}
        }
    }

    public sealed class ActionBudgetExceededException : Exception { public ActionBudgetExceededException(string message):base(message){} }

    public sealed class SetNumericBaseEffect : IActionEffect {
        public SetNumericBaseEffect(NumericKey key,double value){Key=key;Value=value;}
        public NumericKey Key{get;} public double Value{get;}
        public UniTask ExecuteAsync(GameActionContext context,ActionExecution execution,CancellationToken cancellationToken){context.Target.Numeric.SetBaseValue(Key,Value);return UniTask.CompletedTask;}
    }
}

