using System;
using ASCL.Entities;
using ASCL.Gameplay.Actions;
using ASCL.Gameplay.Buffs;
using ASCL.Gameplay.Numeric;
using ASCL.Gameplay.Skills;
using ASCL.Unity;
using Cysharp.Threading.Tasks;
using UnityEngine;
using UIText = UnityEngine.UI.Text;

namespace ASCL.DevProject {
    // Presentation stays in the host project; gameplay uses the renderer-independent package.
    public sealed class Urp3DDemo : MonoBehaviour {
        [SerializeField] private Transform powerCube;
        [SerializeField] private UIText statusLabel;
        private readonly NumericKey _powerKey = new(1);
        private Entity _sourceEntity;
        private Entity _targetEntity;
        private Combatant _source;
        private Combatant _target;
        private SkillRunner _skills;
        private SkillDefinition _boost;

        public bool IsReady => _target != null;
        public float Power => IsReady ? (float)_target.Numeric.GetValue(_powerKey) : 0;
        public int BuffStacks => IsReady && _target.Buffs.Active.Count > 0
            ? _target.Buffs.Active[0].Stacks : 0;

        private void Start() {
            if (UnityWorldDriver.Instance == null)
                throw new InvalidOperationException("The scene requires a UnityWorldDriver.");

            EntityWorld world = UnityWorldDriver.Instance.World;
            _sourceEntity = world.Create<Entity>();
            _targetEntity = world.Create<Entity>();
            _source = new Combatant(_sourceEntity.Handle, new NumericTable());
            _target = new Combatant(_targetEntity.Handle,
                new NumericTable(new[] { new NumericDefinition(_powerKey, 10, 0, 100) }));
            var buff = new BuffDefinition("urp-demo.power", 0, 3, BuffStackPolicy.AddStack,
                new IBuffEffectDefinition[] {
                    new NumericBuffEffectDefinition(_powerKey, NumericModifierKind.Flat, 2)
                }, permanent: true);
            _boost = new SkillDefinition("urp-demo.boost", 1,
                new IActionEffect[] { new ApplyBuffEffect(buff) });
            _skills = new SkillRunner(new ActionPipeline());
            RefreshView();
        }

        private void Update() {
            if (Input.GetKeyDown(KeyCode.Space)) Boost();
        }

        public void Boost() => BoostAsync().Forget();

        public async UniTask<ActionResult> BoostAsync() {
            if (!IsReady) throw new InvalidOperationException("The demo has not started yet.");
            ActionResult result = await _skills.CastAsync(_boost, _source, _target,
                this.GetCancellationTokenOnDestroy());
            RefreshView();
            return result;
        }

        private void RefreshView() {
            float height = Power / 10;
            powerCube.localScale = new Vector3(1, height, 1);
            powerCube.localPosition = new Vector3(0, height / 2, 0);
            statusLabel.text = $"Power  {Power:0}     /     Buff stacks  {BuffStacks} of 3";
        }

        private void OnDestroy() {
            _sourceEntity?.Dispose();
            _targetEntity?.Dispose();
        }
    }
}
