using System;
using ASCL.Entities;
using UnityEngine;
namespace ASCL.Unity {
    /// <summary>Scene-owned driver. Unlike the legacy singleton, independent sessions can coexist.</summary>
    public sealed class UnityWorldHost:MonoBehaviour {
        public EntityWorld? World{get;private set;}private bool _owns;
        public void Bind(EntityWorld world,bool owns=false){if(World!=null)throw new InvalidOperationException("Host is already bound.");World=world??throw new ArgumentNullException(nameof(world));_owns=owns;}
        private void Update(){if(World!=null&&!World.IsDisposed)World.Tick(UnityEngine.Time.deltaTime);}
        private void OnDestroy(){if(_owns)World?.Dispose();World=null;}
    }
}
