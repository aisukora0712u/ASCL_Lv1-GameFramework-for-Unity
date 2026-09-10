using System;
using System.Collections.Generic;
using System.Threading;
using Cysharp.Threading.Tasks;
using UnityEngine;

namespace ASCL.Unity.UI {
    public interface IUIPanelLoader { UniTask<UIPanel> LoadAsync(string panelId,Transform parent,CancellationToken cancellationToken);void Release(string panelId,UIPanel panel); }
    public sealed class UIRouter:MonoBehaviour {
        [Serializable]private struct LayerRoot{public UILayer layer;public Transform root;}
        [SerializeField]private LayerRoot[] roots=Array.Empty<LayerRoot>();
        private readonly Dictionary<UILayer,Transform> _rootMap=new();private readonly Dictionary<string,UIPanel> _cache=new(StringComparer.Ordinal);private readonly HashSet<string> _releaseOnClose=new(StringComparer.Ordinal);private readonly List<UIPanel> _modalStack=new();
        private IUIPanelLoader? _loader;private IUITweenPlayer _tween=new CanvasGroupTweenPlayer();
        public void Configure(IUIPanelLoader loader,IUITweenPlayer? tween=null){_loader=loader??throw new ArgumentNullException(nameof(loader));if(tween!=null)_tween=tween;_rootMap.Clear();for(int i=0;i<roots.Length;i++)_rootMap[roots[i].layer]=roots[i].root;}
        public async UniTask<TPanel> OpenAsync<TPanel>(string panelId,object viewModel,UILayer layer=UILayer.Screen,bool cache=true,CancellationToken cancellationToken=default)where TPanel:UIPanel{
            if(_loader==null)throw new InvalidOperationException("UIRouter is not configured.");if(!_rootMap.TryGetValue(layer,out Transform? root))throw new InvalidOperationException($"Missing root for layer {layer}.");if(!_cache.TryGetValue(panelId,out UIPanel? panel)){panel=await _loader.LoadAsync(panelId,root,cancellationToken);if(panel is not TPanel)throw new InvalidCastException($"Panel '{panelId}' is not {typeof(TPanel).Name}.");_cache.Add(panelId,panel);if(!cache)_releaseOnClose.Add(panelId);}panel.Bind(viewModel);await panel.ShowAsync(_tween,cancellationToken);if(layer==UILayer.Modal&&!_modalStack.Contains(panel))_modalStack.Add(panel);return (TPanel)panel;
        }
        public async UniTask<bool> CloseAsync(string panelId,bool release=false,CancellationToken cancellationToken=default){if(!_cache.TryGetValue(panelId,out UIPanel? panel))return false;await panel.HideAsync(_tween,cancellationToken);panel.Unbind();_modalStack.Remove(panel);if(release||_releaseOnClose.Remove(panelId)){_cache.Remove(panelId);_loader!.Release(panelId,panel);}return true;}
        public async UniTask<bool> CloseTopModalAsync(CancellationToken cancellationToken=default){if(_modalStack.Count==0)return false;UIPanel panel=_modalStack[_modalStack.Count-1];string? id=null;foreach(KeyValuePair<string,UIPanel> pair in _cache)if(ReferenceEquals(pair.Value,panel)){id=pair.Key;break;}return id!=null&&await CloseAsync(id,false,cancellationToken);}
        private void OnDestroy(){if(_loader==null)return;foreach(KeyValuePair<string,UIPanel> pair in _cache)_loader.Release(pair.Key,pair.Value);_cache.Clear();_releaseOnClose.Clear();_modalStack.Clear();}
    }
}
