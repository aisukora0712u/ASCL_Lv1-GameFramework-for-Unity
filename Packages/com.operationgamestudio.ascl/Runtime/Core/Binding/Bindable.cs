using System;

namespace ASCL.Binding {
    public sealed class Bindable<T> {
        private T _value;
        public Bindable(T value=default!)=>_value=value;
        public event Action<T,T>? Changed;
        public T Value { get=>_value; set { if(Equals(_value,value))return;T old=_value;_value=value;Changed?.Invoke(old,value); } }
        public void SetSilently(T value)=>_value=value;
    }
}

