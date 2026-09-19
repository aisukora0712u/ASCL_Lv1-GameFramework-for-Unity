using System;
using System.Collections.Generic;
using System.Threading;

namespace ASCL.Gameplay.Numeric {
    public enum NumericModifierKind : byte { Flat, AdditivePercent, FinalFlat, FinalPercent, Override }

    public readonly struct NumericModifierHandle : IEquatable<NumericModifierHandle> {
        internal NumericModifierHandle(int owner, int id, int generation) { Owner=owner; Id=id; Generation=generation; }
        internal int Owner { get; }
        internal int Id { get; }
        internal int Generation { get; }
        public bool IsValid => Owner != 0 && Id != 0 && Generation != 0;
        public bool Equals(NumericModifierHandle other) => Owner==other.Owner && Id==other.Id && Generation==other.Generation;
        public override bool Equals(object? obj) => obj is NumericModifierHandle other && Equals(other);
        public override int GetHashCode() => HashCode.Combine(Owner, Id, Generation);
    }

    public readonly struct NumericChanged {
        public NumericChanged(NumericKey key, double oldValue, double newValue) { Key=key; OldValue=oldValue; NewValue=newValue; }
        public NumericKey Key { get; }
        public double OldValue { get; }
        public double NewValue { get; }
    }

    public sealed class NumericTable {
        private static int s_nextOwner;
        private int _owner = Interlocked.Increment(ref s_nextOwner);
        private Dictionary<NumericKey, NumericDefinition> _definitions = new();
        private Dictionary<NumericKey, double> _baseValues = new();
        private Dictionary<NumericKey, double> _cache = new();
        private Dictionary<int, Modifier> _modifiers = new();
        private List<int> _scratchIds = new();
        private Dictionary<NumericKey, double> _pendingOldValues = new();
        private int _nextId = 1;
        private int _generation = 1;
        private int _batchDepth;

        public event Action<NumericChanged>? Changed;
        public int ModifierCount => _modifiers.Count;

        public NumericTable(IEnumerable<NumericDefinition>? definitions = null) {
            if (definitions != null) foreach (NumericDefinition definition in definitions) Define(definition);
        }

        public void Define(NumericDefinition definition) {
            double old = GetValue(definition.Key);
            _definitions[definition.Key] = definition;
            if (!_baseValues.ContainsKey(definition.Key)) _baseValues.Add(definition.Key, definition.Clamp(definition.DefaultValue));
            Invalidate(definition.Key, old);
        }

        public bool HasValue(NumericKey key) => _baseValues.ContainsKey(key) || HasModifier(key);
        public double GetBaseValue(NumericKey key) => _baseValues.TryGetValue(key, out double value) ? value : 0d;
        public double GetValue(NumericKey key) { if (_cache.TryGetValue(key, out double value)) return value; value=Calculate(key, GetBaseValue(key)); _cache[key]=value; return value; }
        public double Evaluate(NumericKey key, double externalBase) { ValidateFinite(externalBase); return Calculate(key, externalBase); }

        public void SetBaseValue(NumericKey key, double value) { ValidateFinite(value); double old=GetValue(key); _baseValues[key]=Clamp(key,value); Invalidate(key,old); }

        public NumericModifierHandle AddModifier(NumericKey key, NumericModifierKind kind, double value, object? source = null, int priority = 0) {
            ValidateFinite(value);
            if (!Enum.IsDefined(typeof(NumericModifierKind), kind)) throw new ArgumentOutOfRangeException(nameof(kind));
            double old=GetValue(key); int id=NextId(); _modifiers.Add(id,new Modifier(id,_generation,key,kind,value,source,priority)); Invalidate(key,old);
            return new NumericModifierHandle(_owner,id,_generation);
        }

        public bool SetModifierValue(NumericModifierHandle handle, double value) {
            ValidateFinite(value); if (!Owns(handle) || !_modifiers.TryGetValue(handle.Id,out Modifier modifier)) return false;
            double old=GetValue(modifier.Key); modifier.Value=value; _modifiers[handle.Id]=modifier; Invalidate(modifier.Key,old); return true;
        }

        public bool RemoveModifier(NumericModifierHandle handle) {
            if (!Owns(handle) || !_modifiers.TryGetValue(handle.Id,out Modifier modifier)) return false;
            double old=GetValue(modifier.Key); _modifiers.Remove(handle.Id); Invalidate(modifier.Key,old); return true;
        }

        public int RemoveModifiersFromSource(object? source) {
            _scratchIds.Clear(); foreach (KeyValuePair<int,Modifier> pair in _modifiers) if (ReferenceEquals(pair.Value.Source,source)) _scratchIds.Add(pair.Key);
            return RemoveIds(_scratchIds);
        }

        public Batch BeginBatch() { _batchDepth++; return new Batch(this); }

        public void ClearModifiers() {
            using (BeginBatch()) { _scratchIds.Clear(); foreach (int id in _modifiers.Keys) _scratchIds.Add(id); RemoveIds(_scratchIds); }
            _generation++; if (_generation<=0) _generation=1;
        }

        private int RemoveIds(List<int> ids) {
            using (BeginBatch()) {
                for (int i=0;i<ids.Count;i++) if (_modifiers.TryGetValue(ids[i],out Modifier modifier)) { double old=GetValue(modifier.Key); _modifiers.Remove(ids[i]); Invalidate(modifier.Key,old); }
            }
            return ids.Count;
        }

        private double Calculate(NumericKey key,double baseValue) {
            double flat=0,addPct=0,finalFlat=0,finalPct=0; Modifier? selected=null;
            foreach (Modifier modifier in _modifiers.Values) { if (modifier.Key!=key) continue; switch(modifier.Kind) {
                case NumericModifierKind.Flat: flat+=modifier.Value; break;
                case NumericModifierKind.AdditivePercent: addPct+=modifier.Value; break;
                case NumericModifierKind.FinalFlat: finalFlat+=modifier.Value; break;
                case NumericModifierKind.FinalPercent: finalPct+=modifier.Value; break;
                case NumericModifierKind.Override: if (!selected.HasValue || modifier.Priority>selected.Value.Priority || (modifier.Priority==selected.Value.Priority && modifier.Id>selected.Value.Id)) selected=modifier; break;
                default: throw new InvalidOperationException("Invalid modifier kind.");
            }}
            double result=selected?.Value ?? (((baseValue+flat)*(1d+addPct)+finalFlat)*(1d+finalPct));
            ValidateFinite(result); return Clamp(key,result);
        }

        private double Clamp(NumericKey key,double value) => _definitions.TryGetValue(key,out NumericDefinition d) ? d.Clamp(value) : value;
        private bool HasModifier(NumericKey key) { foreach(Modifier m in _modifiers.Values) if(m.Key==key)return true; return false; }
        private bool Owns(NumericModifierHandle h) => h.IsValid && h.Owner==_owner && h.Generation==_generation;
        private int NextId(){while(_nextId==0||_modifiers.ContainsKey(_nextId))_nextId++;return _nextId++;}
        private static void ValidateFinite(double value){if(!NumericDefinition.IsFinite(value))throw new ArgumentOutOfRangeException(nameof(value));}
        private void Invalidate(NumericKey key,double old){_cache.Remove(key); if(_batchDepth>0){if(!_pendingOldValues.ContainsKey(key))_pendingOldValues.Add(key,old);return;} Notify(key,old);}
        private void Notify(NumericKey key,double old){double value=GetValue(key);if(!old.Equals(value))Changed?.Invoke(new NumericChanged(key,old,value));}
        private void EndBatch(){if(--_batchDepth>0)return;var pending=new List<KeyValuePair<NumericKey,double>>(_pendingOldValues);_pendingOldValues.Clear();foreach(var p in pending)Notify(p.Key,p.Value);}

        public struct Batch : IDisposable { private NumericTable? _owner; internal Batch(NumericTable owner)=>_owner=owner; public void Dispose(){NumericTable? owner=_owner;_owner=null;owner?.EndBatch();} }
        internal NumericTable Fork() {
            var copy=new NumericTable();copy._owner=_owner;copy._nextId=_nextId;copy._generation=_generation;
            copy._definitions=new(_definitions);copy._baseValues=new(_baseValues);copy._cache=new(_cache);copy._modifiers=new(_modifiers);return copy;
        }
        internal void RemapSources(IReadOnlyDictionary<object,object> mapping) {
            foreach(int id in new List<int>(_modifiers.Keys)){var value=_modifiers[id];if(value.Source!=null&&mapping.TryGetValue(value.Source,out var replacement)){value.Source=replacement;_modifiers[id]=value;}}
        }
        internal List<NumericChanged> ChangesFrom(NumericTable previous) {
            var keys=new HashSet<NumericKey>(_baseValues.Keys);keys.UnionWith(previous._baseValues.Keys);
            foreach(var modifier in _modifiers.Values)keys.Add(modifier.Key);foreach(var modifier in previous._modifiers.Values)keys.Add(modifier.Key);
            var sorted=new List<NumericKey>(keys);sorted.Sort();var changes=new List<NumericChanged>();
            foreach(var key in sorted){double before=previous.GetValue(key),after=GetValue(key);if(!before.Equals(after))changes.Add(new NumericChanged(key,before,after));}return changes;
        }
        internal void Adopt(NumericTable draft) {
            _definitions=draft._definitions;_baseValues=draft._baseValues;_cache=draft._cache;_modifiers=draft._modifiers;_nextId=draft._nextId;_generation=draft._generation;
        }
        internal void PublishChanges(IEnumerable<NumericChanged> changes,List<Exception> errors) {
            foreach(var change in changes)if(Changed!=null)foreach(Action<NumericChanged> observer in Changed.GetInvocationList())try{observer(change);}catch(Exception error){errors.Add(error);}
        }
        private struct Modifier { public Modifier(int id,int generation,NumericKey key,NumericModifierKind kind,double value,object? source,int priority){Id=id;Generation=generation;Key=key;Kind=kind;Value=value;Source=source;Priority=priority;} public int Id; public int Generation; public NumericKey Key; public NumericModifierKind Kind; public double Value; public object? Source; public int Priority; }
    }
}
