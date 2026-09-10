using System;
using System.Collections.Generic;
using System.Threading;
using ASCL.Gameplay.Actions;
using ASCL.Gameplay.Buffs;
using Cysharp.Threading.Tasks;

namespace ASCL.Gameplay.Skills {
    public sealed class SkillDefinition {
        public SkillDefinition(string id,int actionId,IReadOnlyList<IActionEffect> effects,IActionCondition? condition=null){if(string.IsNullOrWhiteSpace(id))throw new ArgumentException("Skill id is required.",nameof(id));if(actionId<=0)throw new ArgumentOutOfRangeException(nameof(actionId));Id=id.Trim();ActionId=actionId;Effects=effects??throw new ArgumentNullException(nameof(effects));Condition=condition;}
        public string Id{get;}public int ActionId{get;}public IReadOnlyList<IActionEffect> Effects{get;}public IActionCondition? Condition{get;}
    }
    public sealed class SkillRunner {
        private readonly ActionPipeline _pipeline;public SkillRunner(ActionPipeline pipeline)=>_pipeline=pipeline??throw new ArgumentNullException(nameof(pipeline));
        public async UniTask<ActionResult> CastAsync(SkillDefinition skill,Combatant source,Combatant target,CancellationToken cancellationToken=default){if(skill==null)throw new ArgumentNullException(nameof(skill));var context=new GameActionContext(skill.ActionId,source,target,ActionTags.Skill);if(skill.Condition!=null&&!skill.Condition.Evaluate(in context))return new ActionResult(false,"Skill condition rejected the cast.",0,0);return await _pipeline.ExecuteAsync(context,skill.Effects,cancellationToken);}
    }
    public sealed class ApplyBuffEffect:IActionEffect {
        private readonly BuffDefinition _definition;public ApplyBuffEffect(BuffDefinition definition)=>_definition=definition??throw new ArgumentNullException(nameof(definition));
        public async UniTask ExecuteAsync(GameActionContext context,ActionExecution execution,CancellationToken cancellationToken)=>await context.Target.Buffs.ApplyAsync(_definition,context.Source,execution,cancellationToken);
    }
}
