using System;
using System.Collections.Generic;
using ASCL.Gameplay.Numeric;
using UnityEngine;

namespace ASCL.Unity {
    [CreateAssetMenu(menuName="ASCL/Numeric Catalog")]
    public sealed class NumericCatalogSO:ScriptableObject {
        [Serializable]private struct Entry{public string name;public int id;public double defaultValue;public bool hasMinimum;public double minimum;public bool hasMaximum;public double maximum;}
        [SerializeField]private Entry[] entries=Array.Empty<Entry>();
        public IReadOnlyList<NumericDefinition> Build(){var result=new NumericDefinition[entries.Length];var ids=new HashSet<int>();for(int i=0;i<entries.Length;i++){Entry e=entries[i];if(!ids.Add(e.id))throw new InvalidOperationException($"Duplicate numeric id {e.id} ({e.name}).");result[i]=new NumericDefinition(new NumericKey(e.id),e.defaultValue,e.hasMinimum?e.minimum:null,e.hasMaximum?e.maximum:null);}return result;}
    }
}
