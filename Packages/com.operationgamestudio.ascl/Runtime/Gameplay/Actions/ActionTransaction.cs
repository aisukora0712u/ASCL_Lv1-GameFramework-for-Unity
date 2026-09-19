using System;
using System.Collections.Generic;
using ASCL.Gameplay.Numeric;
namespace ASCL.Gameplay.Actions {
    /// <summary>Prepare/ValidateCommit may fail; Commit must only install prevalidated state and cannot call user code.</summary>
    public interface IActionTransaction {
        GameActionContext Prepare(GameActionContext context);
        void ValidateCommit();
        void Commit();
        void Publish(List<Exception> errors);
        void Rollback();
    }
    /// <summary>Isolated copies of enlisted Numeric and Buff state; live table/controller identities remain stable.</summary>
    public sealed class CombatStateTransaction:IActionTransaction {
        private readonly Dictionary<Combatant,Combatant> _drafts=new();
        private readonly Dictionary<Combatant,Combatant> _originals=new();
        private readonly Dictionary<Combatant,List<NumericChanged>> _changes=new();
        private bool _prepared,_validated,_finished;
        public CombatStateTransaction(IEnumerable<Combatant> combatants){
            foreach(var live in combatants){if(_drafts.ContainsKey(live))continue;var draft=new Combatant(live.Entity,live.Numeric.Fork());_drafts.Add(live,draft);_originals.Add(draft,live);}
            foreach(var pair in _drafts){var sources=pair.Key.Buffs.ForkInto(pair.Value.Buffs,MapToDraft);pair.Value.Numeric.RemapSources(sources);}
        }
        public Combatant Get(Combatant live)=>_drafts.TryGetValue(live,out var draft)?draft:throw new InvalidOperationException("Combatant was not enlisted.");
        private Combatant MapToDraft(Combatant live)=>_drafts.TryGetValue(live,out var draft)?draft:live;
        private Combatant MapToLive(Combatant draft)=>_originals.TryGetValue(draft,out var live)?live:draft;
        public GameActionContext Prepare(GameActionContext context){if(_prepared||_finished)throw new InvalidOperationException("Transaction already used.");_prepared=true;return new GameActionContext(context.ActionId,Get(context.Source),Get(context.Target),context.Tags,context.Magnitude);}
        public void ValidateCommit(){if(!_prepared||_finished)throw new InvalidOperationException("Transaction not active.");foreach(var pair in _drafts){_changes[pair.Key]=pair.Value.Numeric.ChangesFrom(pair.Key.Numeric);pair.Value.Buffs.PrepareAdopt(pair.Key.Buffs,MapToLive);}_validated=true;}
        public void Commit(){if(!_validated||_finished)throw new InvalidOperationException("Transaction not prepared for commit.");foreach(var pair in _drafts){pair.Key.Numeric.Adopt(pair.Value.Numeric);pair.Key.Buffs.Adopt(pair.Value.Buffs);}_finished=true;}
        public void Publish(List<Exception> errors){if(!_finished)return;foreach(var pair in _changes)pair.Key.Numeric.PublishChanges(pair.Value,errors);}
        public void Rollback(){_finished=true;_changes.Clear();}
    }
}
