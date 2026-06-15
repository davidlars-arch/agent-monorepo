using System;
using UnityEngine;

namespace AstralRift.Battle
{
    public sealed class BattleController : MonoBehaviour
    {
        private const int SparkMpCost = 3;
        private const int SparkPower = 14;
        private const int FocusMpGain = 2;

        [SerializeField] private CombatantDefinition hero = new()
        {
            id = "aster",
            displayName = "Aster",
            maxHp = 42,
            maxMp = 12,
            attack = 8,
            defense = 4
        };

        [SerializeField] private CombatantDefinition enemy = new()
        {
            id = "clockwork_imp",
            displayName = "Clockwork Imp",
            maxHp = 28,
            attack = 6,
            defense = 2
        };

        public event Action<string>? LogEmitted;
        public event Action<BattleSnapshot>? SnapshotChanged;
        public event Action? Victory;
        public event Action? Defeat;

        private int heroHp;
        private int heroMp;
        private int enemyHp;
        private int focusStacks;
        private bool heroGuarding;
        private EnemyIntent enemyIntent = EnemyIntent.Scratch;

        private void Awake()
        {
            heroHp = hero.maxHp;
            heroMp = hero.maxMp;
            enemyHp = enemy.maxHp;
            Emit($"{enemy.displayName} rattles out of the dark.");
            EmitIntent();
            EmitSnapshot();
        }

        public void Attack()
        {
            ResolveHeroAction(new BattleAction(BattleActionKind.Attack, "attack", hero.attack));
        }

        public void CastSpark()
        {
            if (heroMp < SparkMpCost)
            {
                Emit($"{hero.displayName} reaches for Spark, but the charge is gone.");
                EmitSnapshot();
                return;
            }

            heroMp -= SparkMpCost;
            ResolveHeroAction(new BattleAction(BattleActionKind.Spell, "spark", SparkPower));
        }

        public void Defend()
        {
            ResolveHeroAction(new BattleAction(BattleActionKind.Defend, "defend", 0));
        }

        public void Focus()
        {
            ResolveHeroAction(new BattleAction(BattleActionKind.Focus, "focus", 0));
        }

        private void ResolveHeroAction(BattleAction action)
        {
            heroGuarding = action.Kind == BattleActionKind.Defend;

            if (action.Kind == BattleActionKind.Defend)
            {
                Emit($"{hero.displayName} braces behind a flickering ward.");
            }
            else if (action.Kind == BattleActionKind.Focus)
            {
                focusStacks += 1;
                heroMp = Math.Min(hero.maxMp, heroMp + FocusMpGain);
                Emit($"{hero.displayName} tunes the prism lens. Spark will burn brighter.");
            }
            else
            {
                var focusedPower = action.Power + focusStacks * 4;
                var damage = Math.Max(1, focusedPower - enemy.defense);
                focusStacks = 0;
                enemyHp = Math.Max(0, enemyHp - damage);
                Emit(action.Kind == BattleActionKind.Spell
                    ? $"{hero.displayName} casts Spark for {damage} damage."
                    : $"{hero.displayName} attacks for {damage} damage.");
            }

            if (enemyHp <= 0)
            {
                Emit($"{enemy.displayName} collapses into a pile of ticking brass.");
                EmitSnapshot();
                Victory?.Invoke();
                return;
            }

            ResolveEnemyTurn();
        }

        private void ResolveEnemyTurn()
        {
            var incomingPower = enemyIntent == EnemyIntent.Overwind ? enemy.attack + 5 : enemy.attack;
            var guardBonus = heroGuarding ? 4 : 0;
            var damage = Math.Max(1, incomingPower - hero.defense - guardBonus);
            heroHp = Math.Max(0, heroHp - damage);
            Emit(enemyIntent == EnemyIntent.Overwind
                ? $"{enemy.displayName} over-winds and slams for {damage} damage."
                : $"{enemy.displayName} scratches for {damage} damage.");

            heroGuarding = false;

            if (heroHp <= 0)
            {
                Emit($"{hero.displayName} falls as the observatory lights go red.");
                EmitSnapshot();
                Defeat?.Invoke();
                return;
            }

            enemyIntent = enemyIntent == EnemyIntent.Scratch ? EnemyIntent.Overwind : EnemyIntent.Scratch;
            EmitIntent();
            EmitSnapshot();
        }

        private void Emit(string message)
        {
            Debug.Log(message);
            LogEmitted?.Invoke(message);
        }

        private void EmitIntent()
        {
            Emit(enemyIntent == EnemyIntent.Overwind
                ? $"{enemy.displayName} winds its key for a heavy strike."
                : $"{enemy.displayName} jitters, ready to scratch.");
        }

        private void EmitSnapshot()
        {
            SnapshotChanged?.Invoke(new BattleSnapshot(
                heroHp,
                hero.maxHp,
                heroMp,
                hero.maxMp,
                enemyHp,
                enemy.maxHp,
                focusStacks,
                enemyIntent));
        }
    }

    public enum EnemyIntent
    {
        Scratch,
        Overwind
    }

    public readonly struct BattleSnapshot
    {
        public BattleSnapshot(
            int heroHp,
            int heroMaxHp,
            int heroMp,
            int heroMaxMp,
            int enemyHp,
            int enemyMaxHp,
            int focusStacks,
            EnemyIntent enemyIntent)
        {
            HeroHp = heroHp;
            HeroMaxHp = heroMaxHp;
            HeroMp = heroMp;
            HeroMaxMp = heroMaxMp;
            EnemyHp = enemyHp;
            EnemyMaxHp = enemyMaxHp;
            FocusStacks = focusStacks;
            EnemyIntent = enemyIntent;
        }

        public int HeroHp { get; }
        public int HeroMaxHp { get; }
        public int HeroMp { get; }
        public int HeroMaxMp { get; }
        public int EnemyHp { get; }
        public int EnemyMaxHp { get; }
        public int FocusStacks { get; }
        public EnemyIntent EnemyIntent { get; }
    }
}
