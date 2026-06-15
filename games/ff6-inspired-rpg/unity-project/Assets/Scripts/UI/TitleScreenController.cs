using AstralRift.Core;
using UnityEngine;

namespace AstralRift.UI
{
    public sealed class TitleScreenController : MonoBehaviour
    {
        [SerializeField] private GameBootstrap bootstrap = null!;

        public void StartPressed()
        {
            bootstrap.StartNewGame();
        }
    }
}
