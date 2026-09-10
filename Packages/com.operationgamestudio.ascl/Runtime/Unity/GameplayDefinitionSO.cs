using System;
using System.Collections.Generic;
using ASCL.Gameplay.Actions;
using ASCL.Gameplay.Buffs;
using ASCL.Gameplay.Numeric;
using ASCL.Gameplay.Skills;
using UnityEngine;

namespace ASCL.Unity {
    [CreateAssetMenu(menuName="ASCL/Buff Definition")]
    public sealed class BuffDefinitionSO:ScriptableObject {
        [Serializable]private struct NumericEffect{public int numericId;public NumericModifierKind kind;public float valuePerStack;public int priority;}
        [SerializeField]private string buffId=string.Empty;[SerializeField,Min(0)]private float duration=1;[SerializeField,Min(1)]private int maxStacks=1;[SerializeField]private BuffStackPolicy stackPolicy;[SerializeField]private bool permanent;[SerializeField]private NumericEffect[] numericEffects=Array.Empty<NumericEffect>();[SerializeField]private BuffDefinitionSO[] children=Array.Empty<BuffDefinitionSO>();
        public BuffDefinition Build()=>Build(new Dictionary<BuffDefinitionSO,BuffDefinition>());
        internal BuffDefinition Build(Dictionary<BuffDefinitionSO,BuffDefinition> cache){if(cache.TryGetValue(this,out BuffDefinition? existing))return existing;if(string.IsNullOrWhiteSpace(buffId))throw new InvalidOperationException($"{name}: Buff id is required.");var effects=new IBuffEffectDefinition[numericEffects.Length];for(int i=0;i<effects.Length;i++){NumericEffect e=numericEffects[i];effects[i]=new NumericBuffEffectDefinition(new NumericKey(e.numericId),e.kind,e.valuePerStack,e.priority);}var childDefinitions=new List<BuffDefinition>();var definition=new BuffDefinition(buffId,duration,maxStacks,stackPolicy,effects,childDefinitions,permanent);cache.Add(this,definition);for(int i=0;i<children.Length;i++){if(children[i]==null)throw new InvalidOperationException($"{name}: Child buff at index {i} is null.");childDefinitions.Add(children[i].Build(cache));}definition.ValidateGraph();return definition;}
        private void OnValidate(){if(maxStacks<1)maxStacks=1;if(duration<0)duration=0;buffId=buffId.Trim();}
    }

    [CreateAssetMenu(menuName="ASCL/Skill Definition")]
    public sealed class SkillDefinitionSO:ScriptableObject {
        [SerializeField]private string skillId=string.Empty;[SerializeField,Min(1)]private int actionId=1;[SerializeField]private BuffDefinitionSO[] buffs=Array.Empty<BuffDefinitionSO>();
        public SkillDefinition Build(){var cache=new Dictionary<BuffDefinitionSO,BuffDefinition>();var effects=new IActionEffect[buffs.Length];for(int i=0;i<buffs.Length;i++){if(buffs[i]==null)throw new InvalidOperationException($"{name}: Buff at index {i} is null.");effects[i]=new ApplyBuffEffect(buffs[i].Build(cache));}return new SkillDefinition(skillId,actionId,effects);}
        private void OnValidate(){if(actionId<1)actionId=1;skillId=skillId.Trim();}
    }
}
