using UnityEngine;
using UnityEngine.SceneManagement;

namespace AstralRift.Core
{
    public sealed class GameBootstrap : MonoBehaviour
    {
        public static GameState State { get; private set; } = GameState.NewGame();

        public void StartNewGame()
        {
            State = GameState.NewGame();
            SceneManager.LoadScene(SceneIds.ObservatoryRoom);
        }

        public void ReturnToTitle()
        {
            SceneManager.LoadScene(SceneIds.Title);
        }
    }
}
