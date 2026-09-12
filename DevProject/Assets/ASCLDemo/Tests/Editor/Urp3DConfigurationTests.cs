using System.Linq;
using ASCL.DevProject.Editor;
using ASCL.Unity;
using NUnit.Framework;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;

namespace ASCL.DevProject.Tests {
    public sealed class Urp3DConfigurationTests {
        [Test]
        public void ProjectUsesPinnedEditorAndLinearUrpForEveryQualityLevel() {
            Assert.That(Application.unityVersion, Is.EqualTo("6000.3.23f1"));
            Assert.That(PlayerSettings.colorSpace, Is.EqualTo(ColorSpace.Linear));
            Assert.That(EditorSettings.defaultBehaviorMode, Is.EqualTo(EditorBehaviorMode.Mode3D));
            Assert.That(QualitySettings.names, Is.EquivalentTo(new[] { "Mobile", "PC" }));
            AssertUniversalRenderer(GraphicsSettings.defaultRenderPipeline);
            for (int i = 0; i < QualitySettings.names.Length; i++)
                AssertUniversalRenderer(QualitySettings.GetRenderPipelineAssetAt(i));
            var globalSettings = AssetDatabase.LoadAssetAtPath<RenderPipelineGlobalSettings>(
                "Assets/Settings/UniversalRenderPipelineGlobalSettings.asset");
            Assert.That(globalSettings, Is.Not.Null);
            Assert.That(GraphicsSettings.GetSettingsForRenderPipeline(typeof(UniversalRenderPipeline)), Is.SameAs(globalSettings));
        }

        [Test]
        public void BuildSceneHasFrameworkDriverAndValidUrpMaterials() {
            Assert.That(EditorBuildSettings.scenes.Any(s => s.enabled && s.path == Urp3DProjectSetup.ScenePath), Is.True);
            var scene = SceneManager.GetSceneByPath(Urp3DProjectSetup.ScenePath);
            bool alreadyLoaded = scene.isLoaded;
            if (!alreadyLoaded)
                scene = EditorSceneManager.OpenScene(Urp3DProjectSetup.ScenePath, OpenSceneMode.Additive);
            try {
                var roots = scene.GetRootGameObjects();
                Assert.That(roots.SelectMany(r => r.GetComponentsInChildren<UnityWorldDriver>()).Count(), Is.EqualTo(1));
                var demo = roots.SelectMany(r => r.GetComponentsInChildren<Urp3DDemo>()).Single();
                var serializedDemo = new SerializedObject(demo);
                Assert.That(serializedDemo.FindProperty("powerCube").objectReferenceValue, Is.Not.Null);
                Assert.That(serializedDemo.FindProperty("statusLabel").objectReferenceValue, Is.Not.Null);
                var renderers = roots.SelectMany(r => r.GetComponentsInChildren<MeshRenderer>()).ToArray();
                Assert.That(renderers.Length, Is.GreaterThanOrEqualTo(2));
                foreach (var renderer in renderers) {
                    Assert.That(renderer.sharedMaterial, Is.Not.Null);
                    Assert.That(renderer.sharedMaterial.shader.name, Is.EqualTo("Universal Render Pipeline/Lit"));
                }
                foreach (var root in roots)
                    foreach (var transform in root.GetComponentsInChildren<Transform>(true))
                        Assert.That(GameObjectUtility.GetMonoBehavioursWithMissingScriptCount(transform.gameObject), Is.Zero,
                            transform.name + " has a missing script.");
            } finally {
                if (!alreadyLoaded) EditorSceneManager.CloseScene(scene, true);
            }
        }

        private static void AssertUniversalRenderer(RenderPipelineAsset asset) {
            Assert.That(asset, Is.TypeOf<UniversalRenderPipelineAsset>());
            var serializedAsset = new SerializedObject(asset);
            var renderers = serializedAsset.FindProperty("m_RendererDataList");
            int index = serializedAsset.FindProperty("m_DefaultRendererIndex").intValue;
            Assert.That(index, Is.InRange(0, renderers.arraySize - 1));
            Assert.That(renderers.GetArrayElementAtIndex(index).objectReferenceValue,
                Is.TypeOf<UniversalRendererData>(), "URP 3D must use the Universal Renderer.");
        }
    }
}
