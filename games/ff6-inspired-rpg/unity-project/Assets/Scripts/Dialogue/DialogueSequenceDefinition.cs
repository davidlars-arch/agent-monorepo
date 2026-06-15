using System;
using System.Collections.Generic;

namespace AstralRift.Dialogue
{
    [Serializable]
    public sealed class DialogueSequenceDefinition
    {
        public string id = "";
        public List<DialogueLine> lines = new();
    }
}
