using UnityEngine;

namespace AstralRift.WebGL
{
    public sealed class WebGLSliceController : MonoBehaviour
    {
        private enum Stage
        {
            Title,
            Room,
            StarMap,
            Dialogue,
            Battle,
            Victory
        }

        private static readonly string[] MiraLines =
        {
            "The old observatory woke up again.",
            "If the engine below is singing, something ancient is listening.",
            "Take this spark and go carefully."
        };

        private Stage stage = Stage.Title;
        private int lineIndex;
        private int heroHp = 42;
        private int enemyHp = 28;
        private string battleLog = "A Clockwork Imp rattles out of the dark.";

        private GUIStyle? titleStyle;
        private GUIStyle? bodyStyle;
        private GUIStyle? buttonStyle;
        private GUIStyle? panelStyle;

        private void OnGUI()
        {
            EnsureStyles();
            DrawBackdrop();

            var panel = new Rect(Screen.width * 0.18f, Screen.height * 0.18f, Screen.width * 0.64f, Screen.height * 0.64f);
            GUI.Box(panel, GUIContent.none, panelStyle);

            GUILayout.BeginArea(new Rect(panel.x + 28, panel.y + 28, panel.width - 56, panel.height - 56));
            GUILayout.FlexibleSpace();

            switch (stage)
            {
                case Stage.Title:
                    DrawCentered("UNITY WEBGL", "FF6-inspired RPG", "A tiny original JRPG slice running from Unity.", "Start", StartGame);
                    break;
                case Stage.Room:
                    DrawCentered("OBSERVATORY ROOM", "Aster", "The floor hums under a fractured star map. Mira waits beside the engine hatch as brass footsteps tick below.", "Read Star Map", () => stage = Stage.StarMap);
                    break;
                case Stage.StarMap:
                    DrawCentered("STAR MAP", "The missing star blinks twice.", "Aster marks the impossible point before the engine answers with three iron knocks from below.", "Call Mira", () => stage = Stage.Dialogue);
                    break;
                case Stage.Dialogue:
                    DrawCentered("MIRA", MiraLines[lineIndex], "Dialogue is now flowing through the Unity runtime.", lineIndex >= MiraLines.Length - 1 ? "Enter Battle" : "Continue", ContinueDialogue);
                    break;
                case Stage.Battle:
                    DrawBattle();
                    break;
                case Stage.Victory:
                    DrawCentered("VICTORY", "The engine quiets.", "Aster gains 8 experience. The WebGL bridge is alive.", "Restart Slice", StartGame);
                    break;
            }

            GUILayout.FlexibleSpace();
            GUILayout.EndArea();
        }

        private void StartGame()
        {
            stage = Stage.Room;
            lineIndex = 0;
            heroHp = 42;
            enemyHp = 28;
            battleLog = "A Clockwork Imp rattles out of the dark.";
        }

        private void ContinueDialogue()
        {
            if (lineIndex >= MiraLines.Length - 1)
            {
                stage = Stage.Battle;
                return;
            }

            lineIndex += 1;
        }

        private void DrawCentered(string kicker, string title, string body, string action, System.Action onClick)
        {
            GUILayout.Label(kicker, bodyStyle);
            GUILayout.Space(12);
            GUILayout.Label(title, titleStyle);
            GUILayout.Space(16);
            GUILayout.Label(body, bodyStyle);
            GUILayout.Space(28);
            if (GUILayout.Button(action, buttonStyle, GUILayout.Height(48)))
            {
                onClick();
            }
        }

        private void DrawBattle()
        {
            GUILayout.Label("BATTLE TEST", bodyStyle);
            GUILayout.Space(12);
            GUILayout.Label($"Aster HP {heroHp}/42", bodyStyle);
            GUILayout.Label($"Clockwork Imp HP {enemyHp}/28", bodyStyle);
            GUILayout.Space(24);
            GUILayout.Label(battleLog, bodyStyle);
            GUILayout.Space(24);

            GUILayout.BeginHorizontal();
            if (GUILayout.Button("Attack", buttonStyle, GUILayout.Height(48)))
            {
                HeroAction("Aster attacks", 6);
            }

            if (GUILayout.Button("Spark", buttonStyle, GUILayout.Height(48)))
            {
                HeroAction("Aster casts Spark", 12);
            }
            GUILayout.EndHorizontal();
        }

        private void HeroAction(string label, int damage)
        {
            enemyHp = Mathf.Max(0, enemyHp - damage);
            battleLog = $"{label} for {damage} damage.";

            if (enemyHp <= 0)
            {
                stage = Stage.Victory;
                battleLog = "Clockwork Imp collapses into a pile of ticking brass.";
                return;
            }

            heroHp = Mathf.Max(0, heroHp - 2);
            battleLog += "\nClockwork Imp scratches for 2 damage.";
        }

        private void DrawBackdrop()
        {
            GUI.color = new Color(0.05f, 0.03f, 0.09f);
            GUI.DrawTexture(new Rect(0, 0, Screen.width, Screen.height), Texture2D.whiteTexture);
            GUI.color = Color.white;
        }

        private void EnsureStyles()
        {
            if (titleStyle != null) return;

            titleStyle = new GUIStyle(GUI.skin.label)
            {
                alignment = TextAnchor.MiddleCenter,
                fontSize = 42,
                fontStyle = FontStyle.Bold,
                wordWrap = true,
                normal = { textColor = new Color(0.93f, 0.86f, 1f) }
            };

            bodyStyle = new GUIStyle(GUI.skin.label)
            {
                alignment = TextAnchor.MiddleCenter,
                fontSize = 18,
                wordWrap = true,
                normal = { textColor = new Color(0.82f, 0.74f, 0.95f) }
            };

            buttonStyle = new GUIStyle(GUI.skin.button)
            {
                alignment = TextAnchor.MiddleCenter,
                fontSize = 18,
                fontStyle = FontStyle.Bold
            };

            panelStyle = new GUIStyle(GUI.skin.box)
            {
                normal = { background = Texture2D.grayTexture }
            };
        }
    }
}
