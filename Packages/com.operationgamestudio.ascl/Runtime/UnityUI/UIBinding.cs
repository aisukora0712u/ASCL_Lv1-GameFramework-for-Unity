using System;

namespace ASCL.Unity.UI {
    [AttributeUsage(AttributeTargets.Field|AttributeTargets.Property)]public sealed class UIBindAttribute:Attribute{public UIBindAttribute(string path)=>Path=path;public string Path{get;}}
    public interface IGeneratedViewBinder<in TViewModel>{void Bind(TViewModel viewModel);void Unbind();}
    public interface IUITimelinePlayer{Cysharp.Threading.Tasks.UniTask PlayAsync(string cue,System.Threading.CancellationToken cancellationToken=default);void Stop(string cue);}
}
