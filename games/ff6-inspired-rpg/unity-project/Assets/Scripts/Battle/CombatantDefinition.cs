using System;

namespace AstralRift.Battle
{
    [Serializable]
    public sealed class CombatantDefinition
    {
        public string id = "";
        public string displayName = "";
        public int maxHp;
        public int maxMp;
        public int attack;
        public int defense;
    }
}
