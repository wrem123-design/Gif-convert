using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Animations;
using UnityEngine;
using UnityEngine.UI;

namespace SpriteForge.Editor
{
    [Serializable]
    public class SpriteForgeRect
    {
        public int x;
        public int y;
        public int w;
        public int h;
    }

    [Serializable]
    public class SpriteForgeVec2
    {
        public float x;
        public float y;
    }

    [Serializable]
    public class SpriteForgeFrame
    {
        public int index;
        public string name = string.Empty;
        public int delayMs;
        public SpriteForgeVec2 pivotNorm = new SpriteForgeVec2();
        public SpriteForgeVec2 offsetPx = new SpriteForgeVec2();
        public SpriteForgeRect rect = new SpriteForgeRect();
    }

    [Serializable]
    public class SpriteForgeSheet
    {
        public int width;
        public int height;
        public int maxTextureSize;
        public int padding;
    }

    [Serializable]
    public class SpriteForgeUnitySettings
    {
        public int ppu = 2728;
        public string filterMode = "Bilinear";
        public string spriteModeDefault = "Single";
        public string loopMode = "loop";
        public bool createPrefab;
        public string prefabRenderer = "SpriteRenderer";
    }

    [Serializable]
    public class SpriteForgeMeta
    {
        public string toolVersion = "1.0.0";
        public string clipName = "Clip";
        public string exportMode = "sheet";
        public SpriteForgeSheet sheet = new SpriteForgeSheet();
        public SpriteForgeFrame[] frames = Array.Empty<SpriteForgeFrame>();
        public SpriteForgeUnitySettings unity = new SpriteForgeUnitySettings();
    }

    public class SpriteForgeMetaAssetPostprocessor : AssetPostprocessor
    {
        private static void OnPostprocessAllAssets(
            string[] importedAssets,
            string[] deletedAssets,
            string[] movedAssets,
            string[] movedFromAssetPaths)
        {
            foreach (var assetPath in importedAssets)
            {
                if (!assetPath.EndsWith("meta.json", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                SpriteForgeGenerator.GenerateFromMeta(assetPath);
            }
        }
    }

    public static class SpriteForgeGenerator
    {
        public static void GenerateFromMeta(string metaAssetPath)
        {
            try
            {
                var jsonText = File.ReadAllText(metaAssetPath);
                var meta = JsonUtility.FromJson<SpriteForgeMeta>(jsonText);
                if (meta == null)
                {
                    Debug.LogError($"Sprite Forge: unable to parse {metaAssetPath}");
                    return;
                }

                var exportFolder = Path.GetDirectoryName(metaAssetPath)?.Replace("\\", "/") ?? string.Empty;
                var generatedFolder = $"{exportFolder}/UnityGenerated";
                EnsureFolder(generatedFolder);

                var sprites = ResolveSprites(meta, exportFolder);
                if (sprites.Count == 0)
                {
                    Debug.LogWarning($"Sprite Forge: no sprites found for {metaAssetPath}");
                    return;
                }

                var clipPath = $"{generatedFolder}/{meta.clipName}.anim";
                var controllerPath = $"{generatedFolder}/{meta.clipName}.controller";
                var prefabPath = $"{generatedFolder}/{meta.clipName}.prefab";

                var clip = BuildOrUpdateAnimationClip(clipPath, meta, sprites);
                var controller = BuildOrUpdateAnimatorController(controllerPath, clip);

                if (meta.unity.createPrefab)
                {
                    BuildOrUpdatePrefab(prefabPath, meta, sprites[0], controller);
                }

                AssetDatabase.SaveAssets();
                AssetDatabase.Refresh();
                Debug.Log($"Sprite Forge: generated assets for {meta.clipName}");
            }
            catch (Exception ex)
            {
                Debug.LogError($"Sprite Forge generation failed for {metaAssetPath}: {ex}");
            }
        }

        private static List<Sprite> ResolveSprites(SpriteForgeMeta meta, string exportFolder)
        {
            if (meta.exportMode.Equals("sheet", StringComparison.OrdinalIgnoreCase))
            {
                var sheetPath = $"{exportFolder}/sheet.png";
                ConfigureSheetImporter(sheetPath, meta);
                AssetDatabase.ImportAsset(sheetPath, ImportAssetOptions.ForceUpdate);

                var loaded = AssetDatabase
                    .LoadAllAssetRepresentationsAtPath(sheetPath)
                    .OfType<Sprite>()
                    .ToDictionary(s => s.name, s => s);

                var ordered = new List<Sprite>();
                foreach (var frame in meta.frames.OrderBy(f => f.index))
                {
                    if (loaded.TryGetValue(frame.name, out var sprite))
                    {
                        ordered.Add(sprite);
                    }
                }

                return ordered;
            }

            var sequence = new List<Sprite>();
            foreach (var frame in meta.frames.OrderBy(f => f.index))
            {
                var framePath = $"{exportFolder}/frames/frame_{frame.index:000}.png";
                ConfigureSequenceImporter(framePath, meta);
                AssetDatabase.ImportAsset(framePath, ImportAssetOptions.ForceUpdate);
                var sprite = AssetDatabase.LoadAssetAtPath<Sprite>(framePath);
                if (sprite != null)
                {
                    sequence.Add(sprite);
                }
            }

            return sequence;
        }

        private static void ConfigureSequenceImporter(string assetPath, SpriteForgeMeta meta)
        {
            var importer = AssetImporter.GetAtPath(assetPath) as TextureImporter;
            if (importer == null)
            {
                return;
            }

            importer.textureType = TextureImporterType.Sprite;
            importer.spriteImportMode = SpriteImportMode.Single;
            importer.filterMode = meta.unity.filterMode.Equals("Bilinear", StringComparison.OrdinalIgnoreCase)
                ? FilterMode.Bilinear
                : FilterMode.Point;
            importer.mipmapEnabled = false;
            importer.spritePixelsPerUnit = meta.unity.ppu;
            importer.alphaIsTransparency = true;
            EditorUtility.SetDirty(importer);
        }

        private static void ConfigureSheetImporter(string sheetPath, SpriteForgeMeta meta)
        {
            var importer = AssetImporter.GetAtPath(sheetPath) as TextureImporter;
            if (importer == null)
            {
                Debug.LogError($"Sprite Forge: cannot load sheet importer at {sheetPath}");
                return;
            }

            importer.textureType = TextureImporterType.Sprite;
            importer.spriteImportMode = SpriteImportMode.Multiple;
            importer.mipmapEnabled = false;
            importer.alphaIsTransparency = true;
            importer.spritePixelsPerUnit = meta.unity.ppu;
            importer.filterMode = meta.unity.filterMode.Equals("Bilinear", StringComparison.OrdinalIgnoreCase)
                ? FilterMode.Bilinear
                : FilterMode.Point;

            var spritesheet = new List<SpriteMetaData>();
            foreach (var frame in meta.frames.OrderBy(f => f.index))
            {
                var convertedY = meta.sheet.height - frame.rect.y - frame.rect.h;
                spritesheet.Add(new SpriteMetaData
                {
                    name = frame.name,
                    rect = new Rect(frame.rect.x, convertedY, frame.rect.w, frame.rect.h),
                    alignment = (int)SpriteAlignment.Custom,
                    pivot = new Vector2(frame.pivotNorm.x, frame.pivotNorm.y)
                });
            }

            importer.spritesheet = spritesheet.ToArray();
            EditorUtility.SetDirty(importer);
        }

        private static AnimationClip BuildOrUpdateAnimationClip(string clipPath, SpriteForgeMeta meta, List<Sprite> sprites)
        {
            var clip = AssetDatabase.LoadAssetAtPath<AnimationClip>(clipPath);
            if (clip == null)
            {
                clip = new AnimationClip();
                AssetDatabase.CreateAsset(clip, clipPath);
            }

            clip.frameRate = 60f;

            var binding = new EditorCurveBinding
            {
                path = string.Empty,
                type = typeof(SpriteRenderer),
                propertyName = "m_Sprite"
            };

            var keys = BuildSpriteKeyframes(meta, sprites);
            AnimationUtility.SetObjectReferenceCurve(clip, binding, keys);

            var shouldLoop = !meta.unity.loopMode.Equals("once", StringComparison.OrdinalIgnoreCase);
            var so = new SerializedObject(clip);
            var loopProp = so.FindProperty("m_AnimationClipSettings.m_LoopTime");
            if (loopProp != null)
            {
                loopProp.boolValue = shouldLoop;
            }
            so.ApplyModifiedProperties();

            EditorUtility.SetDirty(clip);
            return clip;
        }

        private static ObjectReferenceKeyframe[] BuildSpriteKeyframes(SpriteForgeMeta meta, List<Sprite> sprites)
        {
            var orderedIndices = BuildFrameOrder(meta.frames.Length, meta.unity.loopMode);
            var keys = new List<ObjectReferenceKeyframe>();
            var currentTime = 0f;

            foreach (var frameIndex in orderedIndices)
            {
                if (frameIndex < 0 || frameIndex >= meta.frames.Length || frameIndex >= sprites.Count)
                {
                    continue;
                }

                var frame = meta.frames[frameIndex];
                keys.Add(new ObjectReferenceKeyframe
                {
                    time = currentTime,
                    value = sprites[frameIndex]
                });

                currentTime += Mathf.Max(0.01f, frame.delayMs / 1000f);
            }

            return keys.ToArray();
        }

        private static List<int> BuildFrameOrder(int length, string loopMode)
        {
            var order = new List<int>();
            if (length <= 0)
            {
                return order;
            }

            if (loopMode.Equals("reverse", StringComparison.OrdinalIgnoreCase))
            {
                for (var i = length - 1; i >= 0; i--) order.Add(i);
                return order;
            }

            if (loopMode.Equals("pingpong", StringComparison.OrdinalIgnoreCase))
            {
                for (var i = 0; i < length; i++) order.Add(i);
                for (var i = length - 2; i > 0; i--) order.Add(i);
                return order;
            }

            for (var i = 0; i < length; i++) order.Add(i);
            return order;
        }

        private static AnimatorController BuildOrUpdateAnimatorController(string controllerPath, AnimationClip clip)
        {
            var controller = AssetDatabase.LoadAssetAtPath<AnimatorController>(controllerPath);
            if (controller == null)
            {
                controller = AnimatorController.CreateAnimatorControllerAtPath(controllerPath);
            }

            var stateMachine = controller.layers[0].stateMachine;
            var existingStates = stateMachine.states.ToArray();
            foreach (var child in existingStates)
            {
                stateMachine.RemoveState(child.state);
            }

            var state = stateMachine.AddState("Default");
            state.motion = clip;
            stateMachine.defaultState = state;

            EditorUtility.SetDirty(controller);
            return controller;
        }

        private static void BuildOrUpdatePrefab(string prefabPath, SpriteForgeMeta meta, Sprite firstSprite, AnimatorController controller)
        {
            var root = new GameObject(meta.clipName);
            try
            {
                var animator = root.AddComponent<Animator>();
                animator.runtimeAnimatorController = controller;

                if (meta.unity.prefabRenderer.Equals("UI", StringComparison.OrdinalIgnoreCase))
                {
                    var canvasRenderer = root.AddComponent<CanvasRenderer>();
                    var image = root.AddComponent<Image>();
                    image.sprite = firstSprite;
                    image.SetNativeSize();
                }
                else
                {
                    var renderer = root.AddComponent<SpriteRenderer>();
                    renderer.sprite = firstSprite;
                }

                PrefabUtility.SaveAsPrefabAsset(root, prefabPath);
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(root);
            }
        }

        private static void EnsureFolder(string assetFolder)
        {
            if (AssetDatabase.IsValidFolder(assetFolder))
            {
                return;
            }

            var parent = Path.GetDirectoryName(assetFolder)?.Replace("\\", "/") ?? string.Empty;
            var folder = Path.GetFileName(assetFolder);
            if (!AssetDatabase.IsValidFolder(parent))
            {
                EnsureFolder(parent);
            }
            AssetDatabase.CreateFolder(parent, folder);
        }
    }
}
