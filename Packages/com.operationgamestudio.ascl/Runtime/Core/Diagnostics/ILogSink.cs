using System;

namespace ASCL.Diagnostics {
    public enum LogLevel : byte { Trace, Info, Warning, Error }

    public interface ILogSink {
        void Write(LogLevel level, string message, Exception? exception = null);
    }

    public sealed class NullLogSink : ILogSink {
        public static readonly NullLogSink Instance = new();
        private NullLogSink() { }
        public void Write(LogLevel level, string message, Exception? exception = null) { }
    }
}
