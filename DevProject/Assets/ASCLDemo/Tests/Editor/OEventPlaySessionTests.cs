using System.Collections;
using NUnit.Framework;
using OEvent.Module;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.TestTools;

namespace ASCL.DevProject.Tests {
    public sealed class OEventPlaySessionTests {
        private bool _optionsEnabled;
        private EnterPlayModeOptions _options;
        private SceneSetup[] _sceneSetup;

        [SetUp]
        public void SaveSettings() {
            _optionsEnabled = EditorSettings.enterPlayModeOptionsEnabled;
            _options = EditorSettings.enterPlayModeOptions;
            _sceneSetup = EditorSceneManager.GetSceneManagerSetup();
        }

        [UnityTearDown]
        public IEnumerator RestoreSettings() {
            if (Application.isPlaying) yield return new ExitPlayMode();
            EditorSettings.enterPlayModeOptionsEnabled = _optionsEnabled;
            EditorSettings.enterPlayModeOptions = _options;
            if (_sceneSetup != null && _sceneSetup.Length > 0) EditorSceneManager.RestoreSceneManagerSetup(_sceneSetup);
        }

        [UnityTest]
        public IEnumerator RepeatedPlayWithoutDomainReloadRebuildsOneGlobalRegistration() {
            EditorSettings.enterPlayModeOptionsEnabled = true;
            EditorSettings.enterPlayModeOptions = EnterPlayModeOptions.DisableDomainReload;
            EditorSceneManager.OpenScene("Assets/Scenes/ASCL_URP3D.unity");
            int handlerCount = -1;
            for (int session = 0; session < 2; session++) {
                yield return new EnterPlayMode();
                yield return null;
                Assert.That(OEventManager.Instance.IsInitialized, Is.True);
                var demo = Object.FindFirstObjectByType<Urp3DDemo>();
                Assert.That(demo, Is.Not.Null);
                Assert.That(demo.Power, Is.EqualTo(10));
                Assert.That(demo.EventRefreshCount, Is.EqualTo(1));
                if (handlerCount < 0) handlerCount = OEventManager.Instance.RegisteredHandlerCount;
                Assert.That(OEventManager.Instance.RegisteredHandlerCount, Is.EqualTo(handlerCount));
                demo.Boost();
                yield return null;
                Assert.That(demo.Power, Is.EqualTo(12));
                Assert.That(demo.EventRefreshCount, Is.EqualTo(2));
                yield return new ExitPlayMode();
                Assert.That(OEventManager.Instance.IsInitialized, Is.False);
                Assert.That(OEventManager.Instance.RegisteredHandlerCount, Is.Zero);
            }
        }
    }
}
