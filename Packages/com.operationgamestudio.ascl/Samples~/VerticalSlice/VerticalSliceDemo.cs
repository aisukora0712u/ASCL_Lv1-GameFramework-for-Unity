using System.IO;
using ASCL.Entities;
using ASCL.Gameplay.Actions;
using ASCL.Gameplay.Buffs;
using ASCL.Gameplay.Numeric;
using ASCL.Gameplay.Skills;
using ASCL.Persistence;
using ASCL.Unity;
using Cysharp.Threading.Tasks;
using MemoryPack;
using UnityEngine;

namespace ASCL.Samples {
    [MemoryPackable(GenerateType.VersionTolerant)]
    public partial class DemoSave {
        [MemoryPackOrder(0)]public double Power{get;set;}
        [MemoryPackOrder(1)]public int BuffStacks{get;set;}
    }

    public sealed class VerticalSliceDemo:MonoBehaviour {
        private readonly NumericKey _powerKey=new(1);private Entity? _sourceEntity;private Entity? _targetEntity;private Combatant _source=null!;private Combatant _target=null!;private SkillRunner _skills=null!;private SkillDefinition _boost=null!;private MemoryPackSaveStore<DemoSave> _saves=null!;
        private void Start(){EntityWorld world=UnityWorldDriver.Instance!=null?UnityWorldDriver.Instance.World:throw new System.InvalidOperationException("UnityWorldDriver is required.");_sourceEntity=world.Create<Entity>();_targetEntity=world.Create<Entity>();_source=new Combatant(_sourceEntity.Handle,new NumericTable());_target=new Combatant(_targetEntity.Handle,new NumericTable(new[]{new NumericDefinition(_powerKey,10,0,9999)}));var buff=new BuffDefinition("sample.power",10,3,BuffStackPolicy.AddStack,new IBuffEffectDefinition[]{new NumericBuffEffectDefinition(_powerKey,NumericModifierKind.Flat,2)});_boost=new SkillDefinition("sample.boost",1,new IActionEffect[]{new ApplyBuffEffect(buff)});_skills=new SkillRunner(new ActionPipeline());IDevelopmentMirrorWriter<DemoSave>? mirror=null;
#if UNITY_EDITOR || DEVELOPMENT_BUILD
            mirror=new NewtonsoftDevelopmentMirrorWriter<DemoSave>();
#endif
            _saves=new MemoryPackSaveStore<DemoSave>(Path.Combine(Application.persistentDataPath,"ASCLSample"),Application.version,1,mirrorWriter:mirror);}
        private void Update(){if(Input.GetKeyDown(KeyCode.Space))CastAsync().Forget();if(Input.GetKeyDown(KeyCode.F5))SaveAsync().Forget();if(Input.GetKeyDown(KeyCode.F9))LoadAsync().Forget();}
        private async UniTaskVoid CastAsync(){ActionResult result=await _skills.CastAsync(_boost,_source,_target,this.GetCancellationTokenOnDestroy());Debug.Log($"ASCL cast={result.Succeeded}, power={_target.Numeric.GetValue(_powerKey)}, stacks={_target.Buffs.Active[0].Stacks}");}
        private async UniTaskVoid SaveAsync(){await _saves.SaveAsync("quick",new DemoSave{Power=_target.Numeric.GetValue(_powerKey),BuffStacks=_target.Buffs.Active.Count==0?0:_target.Buffs.Active[0].Stacks},this.GetCancellationTokenOnDestroy());Debug.Log("ASCL sample saved.");}
        private async UniTaskVoid LoadAsync(){SaveLoadResult<DemoSave> result=await _saves.LoadAsync("quick",this.GetCancellationTokenOnDestroy());Debug.Log(result.Succeeded?$"ASCL loaded power={result.Value!.Power}, stacks={result.Value.BuffStacks}":$"ASCL load failed: {result.Status} {result.Error}");}
        private void OnDestroy(){_sourceEntity?.Dispose();_targetEntity?.Dispose();}
    }
}
