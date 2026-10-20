using OEvent.Module;
using UnityEngine;

namespace ASCL.Unity {
    /// <summary>One event registry per application, independent of individual worlds/scenes.</summary>
    public static class OEventRuntimeBootstrap {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        private static void Reset() {
            Application.quitting -= Shutdown;
            OEventManager.Instance.Dispose();
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        private static void Initialize() {
            OEventManager.Instance.Init(
                OEventReflectionHelper.GetAllTypesWithAttribute<global::OEvent.OEventAttribute>(), new UnityLogSink());
            Application.quitting -= Shutdown;
            Application.quitting += Shutdown;
        }

        private static void Shutdown() => OEventManager.Instance.Dispose();
    }
}
