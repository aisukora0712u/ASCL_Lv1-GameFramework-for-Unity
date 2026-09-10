using System;

namespace ASCL.Time {
    public interface IGameClock {
        double Time { get; }
        float DeltaTime { get; }
        ulong Frame { get; }
    }

    public sealed class ManualGameClock : IGameClock {
        public double Time { get; private set; }
        public float DeltaTime { get; private set; }
        public ulong Frame { get; private set; }
        public void Advance(float deltaTime) {
            if (deltaTime < 0 || float.IsNaN(deltaTime) || float.IsInfinity(deltaTime)) throw new ArgumentOutOfRangeException(nameof(deltaTime));
            DeltaTime = deltaTime;
            Time += deltaTime;
            Frame++;
        }
    }

    public interface IRandomSource {
        int NextInt(int minInclusive, int maxExclusive);
        float NextFloat();
    }

    public sealed class SeededRandomSource : IRandomSource {
        private readonly Random _random;
        public SeededRandomSource(int seed) => _random = new Random(seed);
        public int NextInt(int minInclusive, int maxExclusive) => _random.Next(minInclusive, maxExclusive);
        public float NextFloat() => (float)_random.NextDouble();
    }
}

