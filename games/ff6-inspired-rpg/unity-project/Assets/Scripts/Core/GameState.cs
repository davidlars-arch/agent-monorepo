using System;
using System.Collections.Generic;

namespace AstralRift.Core
{
    [Serializable]
    public sealed class PartyMemberState
    {
        public string id = "";
        public string displayName = "";
        public int level = 1;
        public int hp;
        public int maxHp;
        public int mp;
        public int maxMp;
        public List<string> spells = new();
    }

    public sealed class GameState
    {
        public List<PartyMemberState> party = new();
        public HashSet<string> flags = new();
        public string currentLocation = SceneIds.ObservatoryRoom;

        public static GameState NewGame()
        {
            return new GameState
            {
                party =
                {
                    new PartyMemberState
                    {
                        id = "aster",
                        displayName = "Aster",
                        level = 1,
                        hp = 42,
                        maxHp = 42,
                        mp = 12,
                        maxMp = 12,
                        spells = { "spark" }
                    }
                }
            };
        }
    }
}
