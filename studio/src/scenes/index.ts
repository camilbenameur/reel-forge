// Entry point of the scene registry, read by `python -m reelforge catalog`.
export { getScene, listScenes, REGISTRY_PROBLEMS } from './registry';
import { listScenes } from './registry';
export const scenes = listScenes();
