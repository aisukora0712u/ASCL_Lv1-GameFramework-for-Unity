using UnityEngine;

namespace ASCL.Unity.Popup {
    public enum PopupKind:byte{Damage,Heal,Shield,Text,Icon}
    public enum PopupOverflowPolicy:byte{DropNewest,ReuseOldest}
    public readonly struct PopupRequest {
        public PopupRequest(Vector3 position,PopupKind kind,int value=0,int styleId=0,bool critical=false,Transform? follow=null){Position=position;Kind=kind;Value=value;StyleId=styleId;Critical=critical;Follow=follow;}
        public Vector3 Position{get;}public PopupKind Kind{get;}public int Value{get;}public int StyleId{get;}public bool Critical{get;}public Transform? Follow{get;}
        public static PopupRequest Damage(Vector3 position,int value,int styleId=0,bool critical=false)=>new(position,PopupKind.Damage,value,styleId,critical);
        public static PopupRequest Heal(Vector3 position,int value,bool critical=false)=>new(position,PopupKind.Heal,value,0,critical);
    }
}

