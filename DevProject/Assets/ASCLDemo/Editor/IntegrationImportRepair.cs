using UnityEditor;
namespace ASCL.DevProject.Editor {
    public static class IntegrationImportRepair {
        // Run only after opening the repository through Tools/Unity-Environment.ps1.
        public static void ReimportShaders() {
            AssetDatabase.ImportAsset("Packages/com.unity.render-pipelines.universal/Shaders/AutodeskInteractive/AutodeskInteractiveTransparent.shadergraph",ImportAssetOptions.ForceUpdate|ImportAssetOptions.ForceSynchronousImport);
            AssetDatabase.ImportAsset("Packages/com.unity.render-pipelines.core/Editor/Lighting/ProbeVolume/RenderingLayerMask/TraceRenderingLayerMask.urtshader",ImportAssetOptions.ForceUpdate|ImportAssetOptions.ForceSynchronousImport);
        }
    }
}