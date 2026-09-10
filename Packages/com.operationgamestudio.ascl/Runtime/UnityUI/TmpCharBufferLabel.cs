using System;
using ASCL.Text;
using TMPro;
using UnityEngine;

namespace ASCL.Unity.UI {
    [RequireComponent(typeof(TMP_Text))]
    public sealed class TmpCharBufferLabel:MonoBehaviour {
        [SerializeField,Min(8)]private int capacity=64;private TMP_Text _text=null!;private ReusableCharBuffer _buffer=null!;
        private void Awake(){_text=GetComponent<TMP_Text>();_buffer=new ReusableCharBuffer(capacity);}
        public bool SetInteger(int value){_buffer.Clear();if(!_buffer.TryAppend(value))return false;_text.SetCharArray(_buffer.RawBuffer,0,_buffer.Length);return true;}
        public bool SetValue(float value,string format="0.##"){_buffer.Clear();if(!_buffer.TryAppend(value,format.AsSpan()))return false;_text.SetCharArray(_buffer.RawBuffer,0,_buffer.Length);return true;}
    }
}
