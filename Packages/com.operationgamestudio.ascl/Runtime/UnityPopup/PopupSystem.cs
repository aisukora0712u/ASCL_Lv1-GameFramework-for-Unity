using UnityEngine;

namespace ASCL.Unity.Popup {
    [DefaultExecutionOrder(-100)]
    public sealed class PopupSystem:MonoBehaviour {
        public static PopupSystem? Instance{get;private set;}
        [SerializeField]private PopupSpriteDatabase database=null!;[SerializeField,Min(1)]private int capacity=64;[SerializeField,Min(1)]private int maxGlyphs=12;[SerializeField,Min(.01f)]private float duration=.8f;[SerializeField]private float rise=1.2f;[SerializeField,Min(.001f)]private float spacing=.22f;[SerializeField]private PopupOverflowPolicy overflowPolicy=PopupOverflowPolicy.ReuseOldest;[SerializeField]private Camera? targetCamera;
        private PopupItem[] _items=null!;private int _searchIndex;private ulong _sequence;
        public int ActiveCount{get{int count=0;if(_items!=null)for(int i=0;i<_items.Length;i++)if(_items[i].Active)count++;return count;}}
        private void Awake(){if(Instance==null)Instance=this;if(database!=null)Prewarm();}
        public void Initialize(PopupSpriteDatabase sprites,int poolCapacity=64,PopupOverflowPolicy policy=PopupOverflowPolicy.ReuseOldest,Camera? camera=null){if(_items!=null)throw new System.InvalidOperationException("Popup pool already initialized.");if(sprites==null)throw new System.ArgumentNullException(nameof(sprites));if(poolCapacity<1)throw new System.ArgumentOutOfRangeException(nameof(poolCapacity));database=sprites;capacity=poolCapacity;overflowPolicy=policy;targetCamera=camera;Prewarm();}
        public void Clear(){if(_items!=null)for(int i=0;i<_items.Length;i++)_items[i].Stop();}
        private void Prewarm(){if(capacity<1||maxGlyphs<1)throw new System.InvalidOperationException("Invalid popup capacity.");_items=new PopupItem[capacity];for(int i=0;i<capacity;i++){var child=new GameObject("Popup_"+i);child.transform.SetParent(transform,false);PopupItem item=child.AddComponent<PopupItem>();item.Initialize(maxGlyphs,i*maxGlyphs);_items[i]=item;}if(targetCamera==null)targetCamera=Camera.main;}
        private void Update(){if(_items==null)return;float dt=UnityEngine.Time.deltaTime;for(int i=0;i<_items.Length;i++)_items[i].Tick(dt,targetCamera);}
        public bool Show(in PopupRequest request){if(_items==null)throw new System.InvalidOperationException("Popup pool is not initialized.");PopupItem? item=Acquire();if(item==null)return false;item.Play(in request,database,duration,rise,spacing,++_sequence);return true;}
        private PopupItem? Acquire(){for(int i=0;i<_items.Length;i++){int index=(_searchIndex+i)%_items.Length;if(!_items[index].Active){_searchIndex=(index+1)%_items.Length;return _items[index];}}if(overflowPolicy==PopupOverflowPolicy.DropNewest)return null;int oldest=0;ulong sequence=_items[0].Sequence;for(int i=1;i<_items.Length;i++)if(_items[i].Sequence<sequence){sequence=_items[i].Sequence;oldest=i;}_items[oldest].Stop();_searchIndex=(oldest+1)%_items.Length;return _items[oldest];}
        private void OnDestroy(){if(Instance==this)Instance=null;}
    }
}
