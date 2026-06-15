namespace AstralRift.Battle
{
    public enum BattleActionKind
    {
        Attack,
        Spell,
        Defend,
        Focus
    }

    public readonly struct BattleAction
    {
        public BattleAction(BattleActionKind kind, string actionId, int power)
        {
            Kind = kind;
            ActionId = actionId;
            Power = power;
        }

        public BattleActionKind Kind { get; }
        public string ActionId { get; }
        public int Power { get; }
    }
}
