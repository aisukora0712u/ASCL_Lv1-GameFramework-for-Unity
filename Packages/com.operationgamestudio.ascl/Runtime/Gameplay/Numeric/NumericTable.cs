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
        public NumericChanged(NumericKey key, float oldValue, float newValue) { Key=key; OldValue=oldValue; NewValue=newValue; }
        public NumericKey Key { get; }
        public float OldValue { get; }
        public float NewValue { get; }
    }

    public sealed class NumericTable {
        private static int s_nextOwner;
        private readonly int _owner = Interlocked.Increment(ref s_nextOwner);
        private readonly Dictionary<NumericKey, NumericDefinition> _definitions = new();
        private readonly Dictionary<NumericKey, float> _baseValues = new();
        private readonly Dictionary<NumericKey, float> _cache = new();
        private readonly Dictionary<int, Modifier> _modifiers = new();
        private readonly List<int> _scratchIds = new();
        private readonly Dictionary<NumericKey, float> _pendingOldValues = new();
        private int _nextId = 1;
        private int _generation = 1;
        private int _batchDepth;

        public event Action<NumericChanged>? Changed;
        public int ModifierCount => _modifiers.Count;

        public NumericTable(IEnumerable<NumericDefinition>? definitions = null) {
            if (definitions != null) foreach (NumericDefinition definition in definitions) Define(definition);
        }

        public void Define(NumericDefinition definition) {
            float old = GetValue(definition.Key);
            _definitions[definition.Key] = definition;
            if (!_baseValues.ContainsKey(definition.Key)) _baseValues.Add(definition.Key, definition.Clamp(definition.DefaultValue));
            Invalidate(definition.Key, old);
        }

        public bool HasValue(NumericKey key) => _baseValues.ContainsKey(key) || HasModifier(key);
        public float GetBaseValue(NumericKey key) => _baseValues.TryGetValue(key, out float value) ? value : 0f;
        public float GetValue(NumericKey key) { if (_cache.TryGetValue(key, out float value)) return value; value=Calculate(key, GetBaseValue(key)); _cache[key]=value; return value; }
        public float Evaluate(NumericKey key, float externalBase) { ValidateFinite(externalBase); return Calculate(key, externalBase); }

        public void SetBaseValue(NumericKey key, float value) { ValidateFinite(value); float old=GetValue(key); _baseValues[key]=Clamp(key,value); Invalidate(key,old); }

        public NumericModifierHandle AddModifier(NumericKey key, NumericModifierKind kind, float value, object? source = null, int priority = 0) {
            ValidateFinite(value);
            if (!Enum.IsDefined(typeof(NumericModifierKind), kind)) throw new ArgumentOutOfRangeException(nameof(kind));
            float old=GetValue(key); int id=NextId(); _modifiers.Add(id,new Modifier(id,_generation,key,kind,value,source,priority)); Invalidate(key,old);
            return new NumericModifierHandle(_owner,id,_generation);
        }

        public bool SetModifierValue(NumericModifierHandle handle, float value) {
            ValidateFinite(value); if (!Owns(handle) || !_modifiers.TryGetValue(handle.Id,out Modifier modifier)) return false;
            float old=GetValue(modifier.Key); modifier.Value=value; _modifiers[handle.Id]=modifier; Invalidate(modifier.Key,old); return true;
        }

        public bool RemoveModifier(NumericModifierHandle handle) {
            if (!Owns(handle) || !_modifiers.TryGetValue(handle.Id,out Modifier modifier)) return false;
            float old=GetValue(modifier.Key); _modifiers.Remove(handle.Id); Invalidate(modifier.Key,old); return true;
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
                for (int i=0;i<ids.Count;i++) if (_modifiers.TryGetValue(ids[i],out Modifier modifier)) { float old=GetValue(modifier.Key); _modifiers.Remove(ids[i]); Invalidate(modifier.Key,old); }
            }
            return ids.Count;
        }

        private float Calculate(NumericKey key,float baseValue) {
            float flat=0,addPct=0,finalFlat=0,finalPct=0; Modifier? selected=null;
            foreach (Modifier modifier in _modifiers.Values) { if (modifier.Key!=key) continue; switch(modifier.Kind) {
                case NumericModifierKind.Flat: flat+=modifier.Value; break;
                case NumericModifierKind.AdditivePercent: addPct+=modifier.Value; break;
                case NumericModifierKind.FinalFlat: finalFlat+=modifier.Value; break;
                case NumericModifierKind.FinalPercent: finalPct+=modifier.Value; break;
                case NumericModifierKind.Override: if (!selected.HasValue || modifier.Priority>selected.Value.Priority || (modifier.Priority==selected.Value.Priority && modifier.Id>selected.Value.Id)) selected=modifier; break;
                default: throw new InvalidOperationException("Invalid modifier kind.");
            }}
            float result=selected?.Value ?? (((baseValue+flat)*(1f+addPct)+finalFlat)*(1f+finalPct));
            ValidateFinite(result); return Clamp(key,result);
        }

        private float Clamp(NumericKey key,float value) => _definitions.TryGetValue(key,out NumericDefinition d) ? d.Clamp(value) : value;
        private bool HasModifier(NumericKey key) { foreach(Modifier m in _modifiers.Values) if(m.Key==key)return true; return false; }
        private bool Owns(NumericModifierHandle h) => h.IsValid && h.Owner==_owner && h.Generation==_generation;
        private int NextId(){while(_nextId==0||_modifiers.ContainsKey(_nextId))_nextId++;return _nextId++;}
        private static void ValidateFinite(float value){if(!NumericDefinition.IsFinite(value))throw new ArgumentOutOfRangeException(nameof(value));}
        private void Invalidate(NumericKey key,float old){_cache.Remove(key); if(_batchDepth>0){if(!_pendingOldValues.ContainsKey(key))_pendingOldValues.Add(key,old);return;} Notify(key,old);}
        private void Notify(NumericKey key,float old){float value=GetValue(key);if(!old.Equals(value))Changed?.Invoke(new NumericChanged(key,old,value));}
        private void EndBatch(){if(--_batchDepth>0)return;foreach(KeyValuePair<NumericKey,float> p in _pendingOldValues)Notify(p.Key,p.Value);_pendingOldValues.Clear();}

        public struct Batch : IDisposable { private NumericTable? _owner; internal Batch(NumericTable owner)=>_owner=owner; public void Dispose(){NumericTable? owner=_owner;_owner=null;owner?.EndBatch();} }
        private struct Modifier { public Modifier(int id,int generation,NumericKey key,NumericModifierKind kind,float value,object? source,int priority){Id=id;Generation=generation;Key=key;Kind=kind;Value=value;Source=source;Priority=priority;} public int Id; public int Generation; public NumericKey Key; public NumericModifierKind Kind; public float Value; public object? Source; public int Priority; }
    }
}
