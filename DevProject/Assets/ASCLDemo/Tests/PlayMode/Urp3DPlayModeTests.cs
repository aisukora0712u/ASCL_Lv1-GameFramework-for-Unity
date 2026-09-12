using System.Collections;
using System.IO;
using ASCL.Entities;
using ASCL.Unity;
using Cysharp.Threading.Tasks;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using UnityEngine.UI;
using UIText = UnityEngine.UI.Text;

namespace ASCL.DevProject.Tests {
    public sealed class Urp3DPlayModeTests {
        public sealed class TickProbe : Entity { public int Ticks; }
        private sealed class ProbeSystem : EntitySystem<TickProbe> {
            public override void Tick(TickProbe target, float deltaTime) => target.Ticks++;
        }

        [UnitySetUp]
        public IEnumerator LoadDemo() {
            yield return SceneManager.LoadSceneAsync("ASCL_URP3D", LoadSceneMode.Single);
            yield return null;
        }

        [UnityTearDown]
        public IEnumerator UnloadDemo() {
            var demoScene = SceneManager.GetActiveScene();
            SceneManager.SetActiveScene(SceneManager.CreateScene("TestCleanup"));
            yield return SceneManager.UnloadSceneAsync(demoScene);
            if (UnityWorldDriver.Instance != null)
                Object.Destroy(UnityWorldDriver.Instance.gameObject);
            yield return null;
        }

        [UnityTest]
        public IEnumerator SceneTicksWorldAndAppliesSkillBuffToPresentation() {
            var driver = UnityWorldDriver.Instance;
            Assert.That(driver, Is.Not.Null);
            var demo = Object.FindFirstObjectByType<Urp3DDemo>();
            Assert.That(demo.IsReady, Is.True);
            Assert.That(driver.World.Count, Is.EqualTo(2));
            Assert.That(demo.Power, Is.EqualTo(10));

            driver.Systems.Register(new ProbeSystem());
            var probe = driver.World.Create<TickProbe>();
            yield return null;
            yield return null;
            Assert.That(probe.Ticks, Is.GreaterThan(0), "UnityWorldDriver must tick framework entities.");
            probe.Dispose();

            // Exercise the serialized UI event as well as the awaitable gameplay entry point.
            GameObject.Find("Boost").GetComponent<Button>().onClick.Invoke();
            yield return null;
            Assert.That(demo.Power, Is.EqualTo(12));
            for (int i = 0; i < 3; i++) {
                yield return demo.BoostAsync().ToCoroutine(result => Assert.That(result.Succeeded, Is.True));
            }
            Assert.That(demo.Power, Is.EqualTo(16));
            Assert.That(demo.BuffStacks, Is.EqualTo(3));
            var cube = GameObject.Find("Power Cube").transform;
            Assert.That(cube.localScale.y, Is.EqualTo(1.6f).Within(0.001f));
            Assert.That(cube.localPosition.y, Is.EqualTo(0.8f).Within(0.001f));
            Assert.That(GameObject.Find("Status").GetComponent<UIText>().text, Does.Contain("16"));

            Object.Destroy(demo.gameObject);
            yield return null;
            Assert.That(driver.World.Count, Is.Zero, "Unloading presentation must release its entities.");
        }

        [UnityTest]
        public IEnumerator BothQualityProfilesRenderVisibleGeometryWithoutErrorShaders() {
            Assert.That(SystemInfo.graphicsDeviceType, Is.Not.EqualTo(GraphicsDeviceType.Null),
                "Run PlayMode validation with a graphics device; do not use -nographics.");
            var camera = Camera.main;
            Assert.That(camera, Is.Not.Null);
            int originalQuality = QualitySettings.GetQualityLevel();
            string[] qualityNames = QualitySettings.names;
            Assert.That(qualityNames, Is.EquivalentTo(new[] { "Mobile", "PC" }),
                "Both profiles must be available to this test platform.");
            var target = new RenderTexture(640, 360, 24);
            var pixels = new Texture2D(640, 360, TextureFormat.RGB24, false);
            RenderTexture previousTarget = camera.targetTexture;
            RenderTexture previousActive = RenderTexture.active;
            try {
                camera.targetTexture = target;
                for (int quality = 0; quality < qualityNames.Length; quality++) {
                    QualitySettings.SetQualityLevel(quality, true);
                    for (int frame = 0; frame < 8; frame++) yield return null;
                    Assert.That(RenderPipelineManager.currentPipeline, Is.TypeOf<UniversalRenderPipeline>());
                    Assert.That(GraphicsSettings.currentRenderPipeline.name, Is.EqualTo(qualityNames[quality] + "_RPAsset"));
                    RenderTexture.active = target;
                    pixels.ReadPixels(new Rect(0, 0, 640, 360), 0, 0);
                    pixels.Apply();
                    var colors = pixels.GetPixels32();
                    int magenta = 0;
                    int cyan = 0;
                    foreach (var color in colors) {
                        if (color.r > 220 && color.g < 40 && color.b > 220) magenta++;
                        if (color.g > color.r + 25 && color.b > color.r + 25 && color.g > 80) cyan++;
                    }
                    Assert.That(magenta, Is.Zero, "The rendered frame contains an error shader.");
                    Assert.That(cyan, Is.GreaterThan(100), "The cyan demo cube must be visible.");
                    string directory = Path.Combine(Application.dataPath, "../TestResults");
                    Directory.CreateDirectory(directory);
                    File.WriteAllBytes(Path.Combine(directory, $"urp3d-{qualityNames[quality]}.png"), pixels.EncodeToPNG());
                }
            } finally {
                camera.targetTexture = previousTarget;
                RenderTexture.active = previousActive;
                QualitySettings.SetQualityLevel(originalQuality, true);
                target.Release();
                Object.Destroy(target);
                Object.Destroy(pixels);
            }
        }
    }
}
