using System;using System.Collections;using System.Threading;using ASCL.Unity.UI;using Cysharp.Threading.Tasks;using NUnit.Framework;using UnityEngine;using UnityEngine.TestTools;
namespace ASCL.DevProject.Tests {
 public sealed class UIOwnershipTests {
  public sealed class ProbePanel:UIPanel<string>{public int Bound,Unbound;public CancellationToken LastToken;protected override void OnBind(string model){Bound++;LastToken=BindingToken;}protected override void OnUnbind(string model){Unbound++;}}
  private sealed class Loader:IUIPanelLoader {public int Releases;public bool Delayed;public UniTaskCompletionSource<UIPanel> Pending=new();public ProbePanel Panel;
   public UniTask<UIPanel> LoadAsync(string id,Transform parent,CancellationToken ct){if(Delayed)return Pending.Task;Panel=new GameObject("TestPanel",typeof(RectTransform),typeof(CanvasGroup)).AddComponent<ProbePanel>();Panel.transform.SetParent(parent,false);return UniTask.FromResult<UIPanel>(Panel);}
   public void Release(string id,UIPanel panel){Releases++;UnityEngine.Object.Destroy(panel.gameObject);}}
  [UnityTest]public IEnumerator RebindingAndReopeningReleaseSubscriptionsAndRestoreInteraction(){var host=new GameObject("Router",typeof(RectTransform));var router=host.AddComponent<UIRouter>();var loader=new Loader();router.Configure(loader,new CanvasGroupTweenPlayer(0));router.SetRoot(UILayer.Modal,host.transform);var oldScale=UnityEngine.Time.timeScale;UnityEngine.Time.timeScale=0;
   yield return router.OpenAsync<ProbePanel>("modal","model",UILayer.Modal).ToCoroutine();var panel=loader.Panel;var binding=panel.LastToken;Assert.That(router.HasModal);
   yield return router.CloseAsync("modal").ToCoroutine();Assert.That(binding.IsCancellationRequested);Assert.That(panel.Unbound,Is.EqualTo(1));Assert.That(router.HasModal,Is.False);
   yield return router.OpenAsync<ProbePanel>("modal","model",UILayer.Modal).ToCoroutine();Assert.That(panel.GetComponent<CanvasGroup>().interactable);Assert.That(panel.GetComponent<CanvasGroup>().blocksRaycasts);
   router.Dispose();Assert.That(loader.Releases,Is.EqualTo(1));Assert.That(panel.Unbound,Is.EqualTo(2));router.Dispose();UnityEngine.Time.timeScale=oldScale;UnityEngine.Object.Destroy(host);yield return null;
  }
  [UnityTest]public IEnumerator LateLoaderResultIsReleasedAfterRouterDisposal(){var host=new GameObject("Router",typeof(RectTransform));var router=host.AddComponent<UIRouter>();var loader=new Loader{Delayed=true};router.Configure(loader);router.SetRoot(UILayer.Screen,host.transform);var pending=router.OpenAsync<ProbePanel>("late","model").AsTask();router.Dispose();var panel=new GameObject("LatePanel").AddComponent<ProbePanel>();loader.Pending.TrySetResult(panel);yield return null;Assert.That(pending.IsCompleted);Assert.That(loader.Releases,Is.EqualTo(1));try{pending.GetAwaiter().GetResult();Assert.Fail("Expected cancellation");}catch(OperationCanceledException){}UnityEngine.Object.Destroy(host);yield return null;}
 }
}
