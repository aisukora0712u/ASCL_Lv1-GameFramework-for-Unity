using System;

namespace OEvent.Module {
    internal enum EventKind : byte { Sync, Async, SyncResult, AsyncResult }

    internal sealed class EventEntry {
        internal readonly IEventRegister Handler;
        internal readonly uint Priority;
        internal readonly (Type, Type, EventKind) Key;
        internal bool Active = true;
        internal EventEntry(IEventRegister handler, uint priority, (Type, Type, EventKind) key) {
            Handler = handler;
            Priority = priority;
            Key = key;
        }
    }

    // Copy on subscription changes, not on broadcast. A running dispatch owns its
    // immutable candidate array; Active also makes removals visible to nested/awaiting dispatches.
    internal sealed class EventChannel {
        internal EventEntry[] Entries { get; private set; } = Array.Empty<EventEntry>();
        internal void Add(EventEntry entry) {
            EventEntry[] old = Entries;
            int index = 0;
            while (index < old.Length && old[index].Priority <= entry.Priority) index++;
            var next = new EventEntry[old.Length + 1];
            Array.Copy(old, 0, next, 0, index);
            next[index] = entry;
            Array.Copy(old, index, next, index + 1, old.Length - index);
            Entries = next;
        }
        internal void Remove(EventEntry entry) {
            entry.Active = false;
            int index = Array.IndexOf(Entries, entry);
            if (index < 0) return;
            var next = new EventEntry[Entries.Length - 1];
            Array.Copy(Entries, 0, next, 0, index);
            Array.Copy(Entries, index + 1, next, index, next.Length - index);
            Entries = next;
        }
    }
}
