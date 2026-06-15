using System.IO;
using AstralRift.WebGL;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace AstralRift.Editor
{
    public static class AstralRiftBuild
    {
        private const string BootScenePath = "Assets/Scenes/Boot.unity";
        private const string OutputPath = "../webgl-build";

        [MenuItem("Astral Rift/Create Boot Scene")]
        public static void CreateBootScene()
        {
            Directory.CreateDirectory("Assets/Scenes");

            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var cameraObject = new GameObject("Main Camera");
            var camera = cameraObject.AddComponent<Camera>();
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = new Color(0.05f, 0.03f, 0.09f);
            cameraObject.tag = "MainCamera";

            var controller = new GameObject("WebGL Slice Controller");
            controller.AddComponent<WebGLSliceController>();

            EditorSceneManager.SaveScene(scene, BootScenePath);
            EditorBuildSettings.scenes = new[]
            {
                new EditorBuildSettingsScene(BootScenePath, true)
            };

            AssetDatabase.SaveAssets();
            Debug.Log($"Created boot scene at {BootScenePath}");
        }

        [MenuItem("Astral Rift/Build WebGL")]
        public static void BuildWebGL()
        {
            CreateBootScene();
            Directory.CreateDirectory(OutputPath);

            var report = BuildPipeline.BuildPlayer(
                new[] { BootScenePath },
                OutputPath,
                BuildTarget.WebGL,
                BuildOptions.Development
            );

            if (report.summary.result != UnityEditor.Build.Reporting.BuildResult.Succeeded)
            {
                throw new System.Exception($"WebGL build failed: {report.summary.result}");
            }

            Debug.Log($"WebGL build succeeded: {Path.GetFullPath(OutputPath)}");
        }
    }
}
