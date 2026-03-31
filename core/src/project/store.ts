import path from "node:path";
import fs from "fs-extra";
import { defaultInspector, defaultUnityOptions, Project, ProjectPaths } from "../types.js";
import { createId, nowIso } from "../utils/id.js";

export function resolveProjectPaths(projectDir: string): ProjectPaths {
  const rootDir = path.join(projectDir, ".spriteforge");
  return {
    projectDir,
    rootDir,
    cacheDir: path.join(rootDir, "cache"),
    projectFile: path.join(rootDir, "project.json")
  };
}

export async function ensureProjectScaffold(projectDir: string): Promise<ProjectPaths> {
  const paths = resolveProjectPaths(projectDir);
  await fs.ensureDir(paths.cacheDir);
  return paths;
}

export function createEmptyProject(): Project {
  const now = nowIso();
  return {
    version: "1.0",
    createdAt: now,
    updatedAt: now,
    presets: [
      {
        id: createId("preset"),
        name: "Default",
        unity: { ...defaultUnityOptions },
        inspector: { ...defaultInspector },
        packing: { padding: 2, allowRotate: false }
      }
    ],
    clips: []
  };
}

export async function loadProject(projectDir: string): Promise<Project> {
  const paths = await ensureProjectScaffold(projectDir);
  const exists = await fs.pathExists(paths.projectFile);
  if (!exists) {
    const project = createEmptyProject();
    await saveProject(projectDir, project);
    return project;
  }
  const project = await fs.readJson(paths.projectFile);
  return project as Project;
}

export async function saveProject(projectDir: string, project: Project): Promise<void> {
  const paths = await ensureProjectScaffold(projectDir);
  const serializable: Project = {
    ...project,
    version: "1.0",
    updatedAt: nowIso(),
    createdAt: project.createdAt || nowIso()
  };
  await fs.writeJson(paths.projectFile, serializable, { spaces: 2 });
}
