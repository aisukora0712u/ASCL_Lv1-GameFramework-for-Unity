using ASCL.Diagnostics;
using ASCL.Entities;
using UnityEngine;

namespace ASCL.Unity {
    [DefaultExecutionOrder(-10000)]
    public sealed class UnityWorldDriver : MonoBehaviour {
        public static UnityWorldDriver? Instance { get; private set; }
        public EntityWorld World { get; private set; } = null!;
        public EntitySystemRegistry Systems { get; private set; } = null!;
        public ILogSink Log { get; private set; } = null!;
        private void Awake(){if(Instance!=null&&Instance!=this){Destroy(gameObject);return;}Instance=this;DontDestroyOnLoad(gameObject);Systems=new EntitySystemRegistry();EntityModuleCatalog.Apply(Systems);GeneratedRegistry.Register(Systems);World=new EntityWorld(Systems);Log=new UnityLogSink();}
        private void Update()=>World.Tick(UnityEngine.Time.deltaTime);
        private void OnDestroy(){if(Instance==this)Instance=null;World?.Dispose();}
    }

    public static partial class GeneratedRegistry {
        public static void Register(EntitySystemRegistry registry){RegisterGenerated(registry);}
        static partial void RegisterGenerated(EntitySystemRegistry registry);
    }

    public sealed class UnityLogSink:ILogSink {
        public void Write(LogLevel level,string message,System.Exception? exception=null){string text=exception==null?message:$"{message}\n{exception}";switch(level){case LogLevel.Warning:Debug.LogWarning(text);break;case LogLevel.Error:Debug.LogError(text);break;default:Debug.Log(text);break;}}
    }
}
