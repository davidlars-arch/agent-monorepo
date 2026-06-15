using System;

namespace AstralRift.Inventory
{
    [Serializable]
    public sealed class ItemDefinition
    {
        public string id = "";
        public string displayName = "";
        public string description = "";
        public int price;
    }
}
