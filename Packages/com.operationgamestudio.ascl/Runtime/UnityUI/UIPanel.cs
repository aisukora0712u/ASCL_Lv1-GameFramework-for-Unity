using System;
using System.Threading;
using Cysharp.Threading.Tasks;
using UnityEngine;

namespace ASCL.Unity.UI {
    public enum UILayer:byte{Background,Screen,Overlay,Modal,System}
    public abstract class UIPanel:MonoBehaviour {
        [SerializeField]private CanvasGroup? canvasGroup;
        public object? ViewModel{get;private set;}public bool IsVisible{get;private set;}
        public void Bind(object viewModel){ViewModel=viewModel??throw new ArgumentNullException(nameof(viewModel));OnBind(viewModel);}
        protected abstract void OnBind(object viewModel);
        protected virtual void OnUnbind(){}
        public virtual async UniTask ShowAsync(IUITweenPlayer tween,CancellationToken cancellationToken=default){gameObject.SetActive(true);if(canvasGroup!=null)await tween.ShowAsync(canvasGroup,cancellationToken);IsVisible=true;}
        public virtual async UniTask HideAsync(IUITweenPlayer tween,CancellationToken cancellationToken=default){if(canvasGroup!=null){canvasGroup.interactable=false;canvasGroup.blocksRaycasts=false;await tween.HideAsync(canvasGroup,cancellationToken);}IsVisible=false;gameObject.SetActive(false);}
        public void Unbind(){if(ViewModel==null)return;OnUnbind();ViewModel=null;}
    }

    public abstract class UIPanel<TViewModel>:UIPanel where TViewModel:class {
        protected TViewModel TypedViewModel=default!;
        protected sealed override void OnBind(object viewModel){TypedViewModel=viewModel as TViewModel??throw new InvalidCastException($"Expected {typeof(TViewModel).Name}.");OnBind(TypedViewModel);}
        protected abstract void OnBind(TViewModel viewModel);
        protected sealed override void OnUnbind(){OnUnbind(TypedViewModel);TypedViewModel=default!;}
        protected virtual void OnUnbind(TViewModel viewModel){}
    }

    public interface IUITweenPlayer { UniTask ShowAsync(CanvasGroup target,CancellationToken cancellationToken);UniTask HideAsync(CanvasGroup target,CancellationToken cancellationToken); }
    public sealed class CanvasGroupTweenPlayer:IUITweenPlayer {
        private readonly float _duration;public CanvasGroupTweenPlayer(float duration=0.15f){if(duration<0)throw new ArgumentOutOfRangeException(nameof(duration));_duration=duration;}
        public UniTask ShowAsync(CanvasGroup target,CancellationToken cancellationToken)=>PlayAsync(target,0,1,cancellationToken);
        public UniTask HideAsync(CanvasGroup target,CancellationToken cancellationToken)=>PlayAsync(target,1,0,cancellationToken);
        private async UniTask PlayAsync(CanvasGroup target,float from,float to,CancellationToken ct){if(_duration<=0){target.alpha=to;return;}target.alpha=from;float elapsed=0;while(elapsed<_duration){ct.ThrowIfCancellationRequested();elapsed+=UnityEngine.Time.unscaledDeltaTime;target.alpha=Mathf.LerpUnclamped(from,to,Mathf.Clamp01(elapsed/_duration));await UniTask.Yield(PlayerLoopTiming.Update,ct);}target.alpha=to;target.interactable=to>0.99f;target.blocksRaycasts=to>0.99f;}
    }
}
