// Legacy seeded sequence derived from .NET Foundation's MIT-licensed CompatPrng.
// Reference: dotnet/runtime v8.0.0, Random.Net5CompatImpl.cs.
using System;
namespace ASCL.Time {
    public sealed class RandomState {
        public string Algorithm{get;set;}="system-random-compat-v1";
        public int[] Values{get;set;}=Array.Empty<int>();
        public int Next{get;set;}
        public int NextPartner{get;set;}
    }
    public interface IRestorableRandomSource:IRandomSource {
        double NextDouble();
        RandomState Capture();
        void Restore(RandomState state);
        IRestorableRandomSource Fork();
    }
    public sealed class RestorableRandomSource:IRestorableRandomSource {
        private readonly int[] _values=new int[56];private int _next;private int _partner=21;
        public RestorableRandomSource(int seed){
            int subtraction=seed==int.MinValue?int.MaxValue:Math.Abs(seed);int mj=161803398-subtraction;_values[55]=mj;int mk=1,ii=0;
            for(int i=1;i<55;i++){if((ii+=21)>=55)ii-=55;_values[ii]=mk;mk=mj-mk;if(mk<0)mk+=int.MaxValue;mj=_values[ii];}
            for(int k=1;k<5;k++)for(int i=1;i<56;i++){int n=i+30;if(n>=55)n-=55;_values[i]-=_values[1+n];if(_values[i]<0)_values[i]+=int.MaxValue;}
        }
        private int Sample(){if(++_next>=56)_next=1;if(++_partner>=56)_partner=1;int value=_values[_next]-_values[_partner];if(value==int.MaxValue)value--;if(value<0)value+=int.MaxValue;_values[_next]=value;return value;}
        public double NextDouble()=>Sample()*(1.0/int.MaxValue);
        public float NextFloat(){float value;do{value=(float)NextDouble();}while(value>=1);return value;}
        public int NextInt(int minInclusive,int maxExclusive){if(minInclusive>maxExclusive)throw new ArgumentOutOfRangeException(nameof(minInclusive));long range=(long)maxExclusive-minInclusive;if(range<=int.MaxValue)return (int)(NextDouble()*range)+minInclusive;int value=Sample();if(Sample()%2==0)value=-value;double sample=(value+(double)int.MaxValue-1)/(2.0*int.MaxValue-1);return (int)((long)(sample*range)+minInclusive);}
        public RandomState Capture()=>new(){Values=(int[])_values.Clone(),Next=_next,NextPartner=_partner};
        public void Restore(RandomState state){if(state==null||state.Algorithm!="system-random-compat-v1"||state.Values==null||state.Values.Length!=56||state.Next<0||state.Next>55||state.NextPartner<0||state.NextPartner>55)throw new ArgumentException("Invalid random state.");foreach(int value in state.Values)if(value<0||value==int.MaxValue)throw new ArgumentException("Invalid random state value.");Array.Copy(state.Values,_values,56);_next=state.Next;_partner=state.NextPartner;}
        public IRestorableRandomSource Fork(){var copy=new RestorableRandomSource(0);copy.Restore(Capture());return copy;}
    }
}
