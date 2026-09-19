using System;

namespace ASCL.Gameplay.Numeric {
    public readonly struct NumericKey : IEquatable<NumericKey>, IComparable<NumericKey> {
        public NumericKey(int value) { if (value <= 0) throw new ArgumentOutOfRangeException(nameof(value)); Value = value; }
        public int Value { get; }
        public bool Equals(NumericKey other) => Value == other.Value;
        public override bool Equals(object? obj) => obj is NumericKey other && Equals(other);
        public override int GetHashCode() => Value;
        public int CompareTo(NumericKey other) => Value.CompareTo(other.Value);
        public static bool operator ==(NumericKey left, NumericKey right) => left.Equals(right);
        public static bool operator !=(NumericKey left, NumericKey right) => !left.Equals(right);
        public override string ToString() => Value.ToString(System.Globalization.CultureInfo.InvariantCulture);
    }

    public readonly struct NumericDefinition {
        public NumericDefinition(NumericKey key, double defaultValue, double? minimum = null, double? maximum = null) {
            if (!IsFinite(defaultValue)) throw new ArgumentOutOfRangeException(nameof(defaultValue));
            if (minimum.HasValue && !IsFinite(minimum.Value)) throw new ArgumentOutOfRangeException(nameof(minimum));
            if (maximum.HasValue && !IsFinite(maximum.Value)) throw new ArgumentOutOfRangeException(nameof(maximum));
            if (minimum > maximum) throw new ArgumentException("Minimum must not exceed maximum.");
            Key=key; DefaultValue=defaultValue; Minimum=minimum; Maximum=maximum;
        }
        public NumericKey Key { get; }
        public double DefaultValue { get; }
        public double? Minimum { get; }
        public double? Maximum { get; }
        public double Clamp(double value) { if (Minimum.HasValue && value < Minimum.Value) value=Minimum.Value; if (Maximum.HasValue && value > Maximum.Value) value=Maximum.Value; return value; }
        internal static bool IsFinite(double value) => !double.IsNaN(value) && !double.IsInfinity(value);
    }
}

