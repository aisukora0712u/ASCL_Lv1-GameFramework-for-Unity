using ASCL.Entities;
using UnityEngine;

namespace ASCL.Unity {
    public abstract class EntityBehaviour:MonoBehaviour {
        public Entity? Entity{get;private set;}
        protected virtual Entity CreateEntity(EntityWorld world)=>world.Create<Entity>();
        protected virtual void Awake(){Entity=CreateEntity(UnityWorldDriver.Instance!=null?UnityWorldDriver.Instance.World:throw new System.InvalidOperationException("UnityWorldDriver must initialize first."));}
        protected virtual void OnEnable()=>Entity?.SetEnabled(true);
        protected virtual void OnDisable(){if(Entity is {IsDisposed:false,State:EntityState.Enabled})Entity.SetEnabled(false);}
        protected virtual void OnDestroy(){Entity?.Dispose();Entity=null;}
    }
}

