// Registre des scènes : fusion des lots A et B. Un type en double n'est pas fatal (le premier
// gagne) mais il est signalé dans REGISTRY_PROBLEMS, affiché par la planche ScenesSheet.
import type { SceneDefinition } from './contract';
import { SCENES_A } from './a';
import { SCENES_B } from './b';

const byType = new Map<string, SceneDefinition>();
export const REGISTRY_PROBLEMS: string[] = [];

for (const [lot, list] of [['A', SCENES_A], ['B', SCENES_B]] as const) {
  for (const def of list) {
    if (byType.has(def.type)) {
      const msg = `Type de scène en double : « ${def.type} » (lot ${lot}, ignoré)`;
      REGISTRY_PROBLEMS.push(msg);
      console.warn(`[registre des scènes] ${msg}`);
      continue;
    }
    byType.set(def.type, def);
  }
}

export const getScene = (type: string): SceneDefinition | undefined => byType.get(type);

export const listScenes = (): SceneDefinition[] => Array.from(byType.values());
