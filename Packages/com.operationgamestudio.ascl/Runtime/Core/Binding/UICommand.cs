using System;

namespace ASCL.Binding {
    public sealed class UICommand {
        private readonly Action _execute;private readonly Func<bool>? _canExecute;
        public UICommand(Action execute,Func<bool>? canExecute=null){_execute=execute??throw new ArgumentNullException(nameof(execute));_canExecute=canExecute;}
        public event Action? CanExecuteChanged;
        public bool CanExecute()=>_canExecute?.Invoke()??true;
        public bool TryExecute(){if(!CanExecute())return false;_execute();return true;}
        public void NotifyCanExecuteChanged()=>CanExecuteChanged?.Invoke();
    }
}
