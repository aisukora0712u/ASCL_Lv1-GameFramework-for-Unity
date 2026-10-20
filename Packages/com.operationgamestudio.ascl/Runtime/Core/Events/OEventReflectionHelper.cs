using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;

namespace OEvent.Module {
    public static class OEventReflectionHelper {
        public static IEnumerable<Type> GetAllSubclasses(Type baseType) => AllTypes(baseType.Assembly).Where(t => t.BaseType == baseType);
        public static IEnumerable<Type> GetAllInterfaceSubclasses(Type inter) => AllTypes(inter.Assembly).Where(t => t.GetInterfaces().Contains(inter));
        public static List<Type> GetAllTypesWithAttribute<TAttribute>() where TAttribute : Attribute =>
            AllTypes(typeof(TAttribute).Assembly).Where(IsConstructibleClass).Where(t => t.IsDefined(typeof(TAttribute), true)).ToList();

        public static List<Type> GetTypesWithAttributeFromAssembly<TAttribute>(Assembly assembly) where TAttribute : Attribute {
            if (assembly == null) throw new ArgumentNullException(nameof(assembly));
            return ReadTypes(assembly).Where(IsConstructibleClass).Where(t => t.IsDefined(typeof(TAttribute), true)).ToList();
        }

        private static bool IsConstructibleClass(Type type) => type.IsClass && !type.IsAbstract && !type.ContainsGenericParameters;
        private static IEnumerable<Type> AllTypes(Assembly definingAssembly) {
            Assembly[] loaded = AppDomain.CurrentDomain.GetAssemblies().Where(a => !a.IsDynamic).ToArray();
            // Compiler/editor tooling can be loaded without its build-time dependencies.
            // It cannot declare an OEvent handler unless its reference graph reaches Core.
            // Expand backwards through loaded references, including indirect base assemblies.
            var reachable = new HashSet<string>(StringComparer.Ordinal) { definingAssembly.GetName().Name! };
            bool changed;
            do {
                changed = false;
                foreach (Assembly assembly in loaded) {
                    string name = assembly.GetName().Name!;
                    if (!reachable.Contains(name) && assembly.GetReferencedAssemblies().Any(r => reachable.Contains(r.Name!)))
                        changed |= reachable.Add(name);
                }
            } while (changed);
            return loaded.Where(a => reachable.Contains(a.GetName().Name!))
                .OrderBy(a => a.FullName, StringComparer.Ordinal).SelectMany(ReadTypes);
        }

        private static Type[] ReadTypes(Assembly assembly) {
            try { return assembly.GetTypes(); }
            catch (ReflectionTypeLoadException ex) {
                string details = string.Join("; ", ex.LoaderExceptions.Where(e => e != null).Select(e => e!.Message));
                throw new InvalidOperationException($"OEvent could not completely inspect assembly '{assembly.FullName}': {details}", ex);
            }
        }
    }
}
