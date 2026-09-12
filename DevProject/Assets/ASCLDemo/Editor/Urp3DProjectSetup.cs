using System;
using ASCL.Unity;
using UnityEditor;
using UnityEditor.Events;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.UI;
using UIText = UnityEngine.UI.Text;

namespace ASCL.DevProject.Editor {
    public static class Urp3DProjectSetup {
        public const string ScenePath = "Assets/Scenes/ASCL_URP3D.unity";

        [MenuItem("ASCL/Open URP 3D Demo")]
        public static void OpenDemo() {
            if (EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo())
                EditorSceneManager.OpenScene(ScenePath);
        }

        // Explicit batch entry point. Never regenerate or overwrite an existing scene on import.
        public static void CreateDemoScene() {
            if (AssetDatabase.LoadAssetAtPath<SceneAsset>(ScenePath) != null)
                throw new InvalidOperationException("The demo scene already exists.");
            EnsureFolder("Assets/Scenes");
            EnsureFolder("Assets/ASCLDemo/Materials");
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(0.55f, 0.65f, 0.8f);
            RenderSettings.ambientEquatorColor = new Color(0.32f, 0.4f, 0.5f);
            RenderSettings.ambientGroundColor = new Color(0.15f, 0.18f, 0.22f);

            var camera = new GameObject("Main Camera", typeof(Camera), typeof(AudioListener)).GetComponent<Camera>();
            camera.tag = "MainCamera";
            camera.transform.position = new Vector3(5, 4, -7);
            camera.transform.LookAt(new Vector3(0, 0.7f, 0));
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = new Color(0.055f, 0.08f, 0.13f);
            camera.nearClipPlane = 0.1f;
            camera.farClipPlane = 100;
            camera.GetUniversalAdditionalCameraData().renderPostProcessing = true;

            var sun = new GameObject("Directional Light", typeof(Light)).GetComponent<Light>();
            sun.type = LightType.Directional;
            sun.intensity = 2;
            sun.shadows = LightShadows.Soft;
            sun.transform.rotation = Quaternion.Euler(50, -30, 0);
            sun.gameObject.AddComponent<UniversalAdditionalLightData>();
            RenderSettings.sun = sun;

            var volume = new GameObject("Global Volume", typeof(Volume)).GetComponent<Volume>();
            volume.isGlobal = true;
            volume.sharedProfile = AssetDatabase.LoadAssetAtPath<VolumeProfile>("Assets/Settings/SampleSceneProfile.asset");
            var ground = GameObject.CreatePrimitive(PrimitiveType.Plane);
            ground.name = "Ground";
            ground.GetComponent<Renderer>().sharedMaterial = CreateMaterial("Ground", new Color(0.24f, 0.3f, 0.38f));
            var cube = GameObject.CreatePrimitive(PrimitiveType.Cube);
            cube.name = "Power Cube";
            cube.transform.position = new Vector3(0, 0.5f, 0);
            cube.GetComponent<Renderer>().sharedMaterial = CreateMaterial("PowerCube", new Color(0.08f, 0.72f, 0.85f));

            new GameObject("ASCL World", typeof(UnityWorldDriver));
            var demo = new GameObject("ASCL Demo", typeof(Urp3DDemo)).GetComponent<Urp3DDemo>();
            var canvas = new GameObject("Demo UI", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster)).GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            var scaler = canvas.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1280, 720);
            UIText title = CreateText(canvas.transform, "Title", "ASCL  /  URP 3D", new Vector2(32, -28), new Vector2(600, 54), 32);
            title.fontStyle = FontStyle.Bold;
            CreateText(canvas.transform, "Instructions", "SPACE or Boost: apply +2 power, up to 3 stacks.", new Vector2(34, -90), new Vector2(650, 34), 20);
            UIText status = CreateText(canvas.transform, "Status", "Power  10     /     Buff stacks  0 of 3", new Vector2(34, -130), new Vector2(600, 38), 22);
            var buttonObject = new GameObject("Boost", typeof(RectTransform), typeof(Image), typeof(Button));
            buttonObject.transform.SetParent(canvas.transform, false);
            Place(buttonObject.GetComponent<RectTransform>(), new Vector2(34, -192), new Vector2(180, 48));
            buttonObject.GetComponent<Image>().color = new Color(0.06f, 0.45f, 0.58f);
            UnityEventTools.AddPersistentListener(buttonObject.GetComponent<Button>().onClick, demo.Boost);
            UIText buttonLabel = CreateText(buttonObject.transform, "Label", "Boost  +2", Vector2.zero, new Vector2(180, 48), 22);
            buttonLabel.alignment = TextAnchor.MiddleCenter;
            new GameObject("EventSystem", typeof(EventSystem), typeof(StandaloneInputModule));

            var serializedDemo = new SerializedObject(demo);
            serializedDemo.FindProperty("powerCube").objectReferenceValue = cube.transform;
            serializedDemo.FindProperty("statusLabel").objectReferenceValue = status;
            serializedDemo.ApplyModifiedPropertiesWithoutUndo();
            EditorSceneManager.SaveScene(scene, ScenePath);
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
            AssetDatabase.SaveAssets();
            Debug.Log("ASCL URP 3D demo scene created.");
        }

        private static void EnsureFolder(string path) {
            if (!AssetDatabase.IsValidFolder(path)) {
                int separator = path.LastIndexOf('/');
                AssetDatabase.CreateFolder(path.Substring(0, separator), path.Substring(separator + 1));
            }
        }

        private static Material CreateMaterial(string name, Color color) {
            var material = new Material(Shader.Find("Universal Render Pipeline/Lit")) { name = name };
            material.SetColor("_BaseColor", color);
            material.SetFloat("_Smoothness", 0.3f);
            AssetDatabase.CreateAsset(material, $"Assets/ASCLDemo/Materials/{name}.mat");
            return material;
        }

        private static UIText CreateText(Transform parent, string name, string value, Vector2 position, Vector2 size, int fontSize) {
            var text = new GameObject(name, typeof(RectTransform), typeof(UIText)).GetComponent<UIText>();
            text.transform.SetParent(parent, false);
            Place(text.rectTransform, position, size);
            text.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            text.text = value;
            text.fontSize = fontSize;
            text.color = new Color(0.92f, 0.96f, 1);
            text.raycastTarget = false;
            return text;
        }

        private static void Place(RectTransform rect, Vector2 position, Vector2 size) {
            rect.anchorMin = rect.anchorMax = rect.pivot = new Vector2(0, 1);
            rect.anchoredPosition = position;
            rect.sizeDelta = size;
        }
    }
}
