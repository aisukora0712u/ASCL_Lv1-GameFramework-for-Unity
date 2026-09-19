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
        private readonly Dictionary<UILayer,Transform> _rootMap=new();
        private readonly Dictionary<string,UIPanel> _cache=new(StringComparer.Ordinal);
        private readonly HashSet<string> _releaseOnClose=new(StringComparer.Ordinal),_busy=new(StringComparer.Ordinal);
        private readonly List<UIPanel> _modalStack=new();
        private readonly CancellationTokenSource _lifetime=new();
        private IUIPanelLoader? _loader;private IUITweenPlayer _tween=new CanvasGroupTweenPlayer();private bool _disposed;
        public bool HasModal=>_modalStack.Count>0;
        public void Configure(IUIPanelLoader loader,IUITweenPlayer? tween=null){if(_disposed)throw new ObjectDisposedException(nameof(UIRouter));if(_cache.Count>0||_busy.Count>0)throw new InvalidOperationException("Cannot replace an active loader.");_loader=loader??throw new ArgumentNullException(nameof(loader));if(tween!=null)_tween=tween;for(int i=0;i<roots.Length;i++)_rootMap[roots[i].layer]=roots[i].root;}
        public void SetRoot(UILayer layer,Transform root){if(_disposed)throw new ObjectDisposedException(nameof(UIRouter));_rootMap[layer]=root!=null?root:throw new ArgumentNullException(nameof(root));}
        public async UniTask<TPanel> OpenAsync<TPanel>(string panelId,object viewModel,UILayer layer=UILayer.Screen,bool cache=true,CancellationToken cancellationToken=default)where TPanel:UIPanel{
            if(_disposed)throw new ObjectDisposedException(nameof(UIRouter));
            var loader=_loader??throw new InvalidOperationException("UIRouter is not configured.");
            if(!_rootMap.TryGetValue(layer,out Transform? root))throw new InvalidOperationException($"Missing root for layer {layer}.");
            if(!_busy.Add(panelId))throw new InvalidOperationException($"Panel '{panelId}' already has an operation in progress.");
            using var linked=CancellationTokenSource.CreateLinkedTokenSource(cancellationToken,_lifetime.Token);
            UIPanel? panel=null;bool loaded=false,added=false;
            try{
                linked.Token.ThrowIfCancellationRequested();
                if(!_cache.TryGetValue(panelId,out panel)){panel=await loader.LoadAsync(panelId,root,linked.Token);loaded=true;linked.Token.ThrowIfCancellationRequested();if(panel is not TPanel)throw new InvalidCastException($"Panel '{panelId}' is not {typeof(TPanel).Name}.");_cache.Add(panelId,panel);added=true;}
                if(panel is not TPanel typed)throw new InvalidCastException($"Panel '{panelId}' is not {typeof(TPanel).Name}.");
                if(!cache)_releaseOnClose.Add(panelId);
                panel.Bind(viewModel);await panel.ShowAsync(_tween,linked.Token);linked.Token.ThrowIfCancellationRequested();
                if(layer==UILayer.Modal&&!_modalStack.Contains(panel))_modalStack.Add(panel);return typed;
            }catch{
                if(panel!=null){panel.Unbind();_modalStack.Remove(panel);if(!_disposed)panel.gameObject.SetActive(false);
                    if(loaded&&(!added||_cache.Remove(panelId))){_releaseOnClose.Remove(panelId);loader.Release(panelId,panel);}}
                throw;
            }finally{_busy.Remove(panelId);}
        }
        public async UniTask<bool> CloseAsync(string panelId,bool release=false,CancellationToken cancellationToken=default){
            if(_disposed)throw new ObjectDisposedException(nameof(UIRouter));if(!_cache.TryGetValue(panelId,out UIPanel? panel))return false;
            if(!_busy.Add(panelId))throw new InvalidOperationException($"Panel '{panelId}' already has an operation in progress.");
            using var linked=CancellationTokenSource.CreateLinkedTokenSource(cancellationToken,_lifetime.Token);
            try{await panel.HideAsync(_tween,linked.Token);linked.Token.ThrowIfCancellationRequested();panel.Unbind();_modalStack.Remove(panel);if(release||_releaseOnClose.Remove(panelId)){_cache.Remove(panelId);_loader!.Release(panelId,panel);}return true;}finally{_busy.Remove(panelId);}
        }
        public async UniTask<bool> CloseTopModalAsync(CancellationToken cancellationToken=default){if(_modalStack.Count==0)return false;UIPanel panel=_modalStack[_modalStack.Count-1];string? id=null;foreach(KeyValuePair<string,UIPanel> pair in _cache)if(ReferenceEquals(pair.Value,panel)){id=pair.Key;break;}return id!=null&&await CloseAsync(id,false,cancellationToken);}
        public void Dispose(){if(_disposed)return;_disposed=true;var errors=new List<Exception>();try{_lifetime.Cancel();}catch(Exception e){errors.Add(e);}foreach(var pair in _cache){try{pair.Value.Unbind();}catch(Exception e){errors.Add(e);}try{_loader?.Release(pair.Key,pair.Value);}catch(Exception e){errors.Add(e);}}_cache.Clear();_releaseOnClose.Clear();_modalStack.Clear();_lifetime.Dispose();if(errors.Count>0)throw new AggregateException(errors);}
        private void OnDestroy(){Dispose();}
    }
}
