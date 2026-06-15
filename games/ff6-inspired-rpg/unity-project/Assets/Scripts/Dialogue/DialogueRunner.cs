using System;
using UnityEngine;

namespace AstralRift.Dialogue
{
    public sealed class DialogueRunner : MonoBehaviour
    {
        [SerializeField] private DialogueSequenceDefinition sequence = new()
        {
            id = "mira_intro",
            lines =
            {
                new DialogueLine { speaker = "Mira", text = "The old observatory woke up again." },
                new DialogueLine { speaker = "Mira", text = "If the engine below is singing, something ancient is listening." },
                new DialogueLine { speaker = "Mira", text = "Take this spark and go carefully." }
            }
        };

        public event Action<DialogueLine>? LineChanged;
        public event Action? Completed;

        private int index;

        public void Begin()
        {
            index = 0;
            EmitCurrent();
        }

        public void Continue()
        {
            index += 1;
            if (index >= sequence.lines.Count)
            {
                Completed?.Invoke();
                return;
            }

            EmitCurrent();
        }

        private void EmitCurrent()
        {
            LineChanged?.Invoke(sequence.lines[index]);
        }
    }
}
