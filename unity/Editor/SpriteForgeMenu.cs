using System;
using UnityEditor;

namespace SpriteForge.Editor
{
    public static class SpriteForgeMenu
    {
        [MenuItem("Sprite Forge/Regenerate From Meta (Selected)")]
        public static void RegenerateSelected()
        {
            var selected = Selection.assetGUIDs;
            foreach (var guid in selected)
            {
                var path = AssetDatabase.GUIDToAssetPath(guid);
                if (!path.EndsWith("meta.json", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                SpriteForgeGenerator.GenerateFromMeta(path);
            }
        }

        [MenuItem("Sprite Forge/Regenerate From Meta (Selected)", true)]
        public static bool ValidateRegenerateSelected()
        {
            foreach (var guid in Selection.assetGUIDs)
            {
                var path = AssetDatabase.GUIDToAssetPath(guid);
                if (path.EndsWith("meta.json", StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }

            return false;
        }
    }
}
