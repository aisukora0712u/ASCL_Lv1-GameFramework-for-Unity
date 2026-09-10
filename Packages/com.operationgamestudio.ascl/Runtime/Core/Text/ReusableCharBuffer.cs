using System;

namespace ASCL.Text {
    public sealed class ReusableCharBuffer {
        private readonly char[] _buffer;
        private int _length;
        public ReusableCharBuffer(int capacity=64){if(capacity<1)throw new ArgumentOutOfRangeException(nameof(capacity));_buffer=new char[capacity];}
        public int Length=>_length;public int Capacity=>_buffer.Length;public char[] RawBuffer=>_buffer;
        public void Clear()=>_length=0;
        public bool TryAppend(ReadOnlySpan<char> value){if(value.Length>_buffer.Length-_length)return false;value.CopyTo(_buffer.AsSpan(_length));_length+=value.Length;return true;}
        public bool TryAppend(char value){if(_length==_buffer.Length)return false;_buffer[_length++]=value;return true;}
        public bool TryAppend(int value){if(!value.TryFormat(_buffer.AsSpan(_length),out int written,provider:System.Globalization.CultureInfo.InvariantCulture))return false;_length+=written;return true;}
        public bool TryAppend(float value,ReadOnlySpan<char> format){if(!value.TryFormat(_buffer.AsSpan(_length),out int written,format,System.Globalization.CultureInfo.InvariantCulture))return false;_length+=written;return true;}
        public ReadOnlySpan<char> AsSpan()=>_buffer.AsSpan(0,_length);
        public override string ToString()=>new string(_buffer,0,_length);
    }
}
