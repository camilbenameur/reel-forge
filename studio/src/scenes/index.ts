// Point d'entrée du registre des scènes, lu par `python -m usine_reels catalogue`.
export { getScene, listScenes, REGISTRY_PROBLEMS } from './registry';
import { listScenes } from './registry';
export const scenes = listScenes();
