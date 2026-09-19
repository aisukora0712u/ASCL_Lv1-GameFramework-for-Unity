using System;
using System.Collections.Generic;
namespace ASCL.Gameplay.Turns {
    public enum TurnPhase:byte{Ready,Acting,Resolving,Ended}
    public readonly struct TurnState {
        public TurnState(int round,int index,int sequence,TurnPhase phase=TurnPhase.Acting){Round=round;Index=index;Sequence=sequence;Phase=phase;}
        public int Round{get;}public int Index{get;}public int Sequence{get;}public TurnPhase Phase{get;}
    }
    /// <summary>Pure discrete sequencing; skipped factions consume no action and no simulation time.</summary>
    public sealed class TurnSequence {
        private readonly string[] _order;
        public TurnSequence(IEnumerable<string> order){_order=new List<string>(order).ToArray();if(_order.Length==0)throw new ArgumentException("Turn order is empty.");var ids=new HashSet<string>(StringComparer.Ordinal);foreach(var id in _order)if(string.IsNullOrWhiteSpace(id)||!ids.Add(id))throw new ArgumentException("Turn IDs must be nonempty and unique.");}
        public TurnState State{get;private set;}=new(1,-1,0,TurnPhase.Ready);
        public IReadOnlyList<string> Order=>Array.AsReadOnly(_order);
        public bool TryNext(Func<string,bool> available,out TurnState next){var current=State;for(int i=0;i<_order.Length;i++){int index=current.Index+1,round=current.Round;if(index>=_order.Length){index=0;round++;}current=new TurnState(round,index,current.Sequence,TurnPhase.Acting);if(available(_order[index])){next=new TurnState(round,index,checked(current.Sequence+1));return true;}}next=State;return false;}
        public void Restore(TurnState state){if(state.Round<1||state.Index< -1||state.Index>=_order.Length||state.Sequence<0||!Enum.IsDefined(typeof(TurnPhase),state.Phase))throw new ArgumentException("Invalid turn state.");State=state;}
        public void Restart()=>State=new TurnState(1,-1,0,TurnPhase.Ready);
    }
    public static class ActionResource {
        public static bool CanSpend(int available,int cost)=>cost>=0&&available>=cost;
        public static int Spend(int available,int cost)=>CanSpend(available,cost)?available-cost:throw new InvalidOperationException("Insufficient action resource.");
    }
}
