using AstralRift.Dialogue;
using UnityEngine;

namespace AstralRift.Exploration
{
    public sealed class NpcTrigger : MonoBehaviour
    {
        [SerializeField] private DialogueRunner dialogue = null!;

        public void Interact()
        {
            dialogue.Begin();
        }
    }
}
