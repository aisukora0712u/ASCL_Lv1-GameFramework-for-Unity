using System;
using System.Collections.Generic;

namespace ASCL.Entities {
    public static class EntityModuleCatalog {
        private static readonly List<Action<EntitySystemRegistry>> Modules=new();
        private static readonly HashSet<string> Ids=new(StringComparer.Ordinal);
        public static void Register(string moduleId,Action<EntitySystemRegistry> register){if(string.IsNullOrWhiteSpace(moduleId))throw new ArgumentException("Module id is required.",nameof(moduleId));if(register==null)throw new ArgumentNullException(nameof(register));if(Ids.Add(moduleId))Modules.Add(register);}
        public static void Apply(EntitySystemRegistry registry){for(int i=0;i<Modules.Count;i++)Modules[i](registry);}
        public static void Reset(){Modules.Clear();Ids.Clear();}
    }
}
