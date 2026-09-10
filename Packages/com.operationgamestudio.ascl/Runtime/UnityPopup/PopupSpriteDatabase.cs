using System;
using UnityEngine;

namespace ASCL.Unity.Popup {
    [CreateAssetMenu(menuName="ASCL/Popup Sprite Database")]
    public sealed class PopupSpriteDatabase:ScriptableObject {
        [Serializable]private struct Style{public PopupKind kind;public int styleId;public Color color;public Sprite? icon;public Sprite[] textGlyphs;}
        [SerializeField]private Sprite[] digits=Array.Empty<Sprite>();[SerializeField]private Sprite? plus;[SerializeField]private Sprite? minus;[SerializeField]private Style[] styles=Array.Empty<Style>();
        public Sprite Digit(int value){if(digits.Length!=10)throw new InvalidOperationException("Exactly ten digit sprites are required.");return digits[value];}
        public Sprite? Plus=>plus;public Sprite? Minus=>minus;
        public Color ColorFor(PopupKind kind,int styleId){for(int i=0;i<styles.Length;i++)if(styles[i].kind==kind&&styles[i].styleId==styleId)return styles[i].color;return Color.white;}
        public Sprite? IconFor(PopupKind kind,int styleId){for(int i=0;i<styles.Length;i++)if(styles[i].kind==kind&&styles[i].styleId==styleId)return styles[i].icon;return null;}
        public Sprite[]? TextFor(int styleId){for(int i=0;i<styles.Length;i++)if(styles[i].kind==PopupKind.Text&&styles[i].styleId==styleId)return styles[i].textGlyphs;return null;}
    }
}

