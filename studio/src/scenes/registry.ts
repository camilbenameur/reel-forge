// Scene registry: merge of libraries A and B. A duplicate type is not fatal (the first one
// wins) but it is reported in REGISTRY_PROBLEMS, shown by the ScenesSheet.
import type { SceneDefinition } from './contract';
import { SCENES_A } from './a';
import { SCENES_B } from './b';

const byType = new Map<string, SceneDefinition>();
export const REGISTRY_PROBLEMS: string[] = [];

for (const [library, list] of [['A', SCENES_A], ['B', SCENES_B]] as const) {
  for (const def of list) {
    if (byType.has(def.type)) {
      const msg = `Duplicate scene type: "${def.type}" (library ${library}, ignored)`;
      REGISTRY_PROBLEMS.push(msg);
      console.warn(`[scene registry] ${msg}`);
      continue;
    }
    byType.set(def.type, def);
  }
}

export const getScene = (type: string): SceneDefinition | undefined => byType.get(type);

export const listScenes = (): SceneDefinition[] => Array.from(byType.values());
