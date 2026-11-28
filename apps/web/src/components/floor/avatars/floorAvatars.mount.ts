import type { FloorAvatarWorker } from "./floorAvatars.logic";
import type { FloorAvatarsHandle, FloorAvatarsOptions } from "./floorAvatars.scene";

export type FloorAvatarModule = {
  mountFloorAvatars: (
    host: HTMLElement,
    initial: FloorAvatarWorker[],
    options?: FloorAvatarsOptions,
  ) => FloorAvatarsHandle;
};

export type MountFloorAvatarLayerOptions = {
  host: HTMLElement;
  workers: FloorAvatarWorker[];
  options: FloorAvatarsOptions;
  loadShader: () => Promise<FloorAvatarModule>;
  loadGlb: () => Promise<FloorAvatarModule>;
  hasWebGL2: () => boolean;
  isDisposed: () => boolean;
};

/**
 * The shader is the default. The r3 GLBs cover only a shader compile/link failure; without
 * WebGL2 there is no three.js renderer, so the caller keeps the SVG workers.
 */
export async function mountFloorAvatarLayer(
  input: MountFloorAvatarLayerOptions,
): Promise<FloorAvatarsHandle | null> {
  if (input.isDisposed()) return null;
  if (!input.hasWebGL2()) {
    input.options.onFailure?.();
    return null;
  }

  const mount = async (load: () => Promise<FloorAvatarModule>) => {
    const module = await load();
    if (input.isDisposed()) return null;
    return module.mountFloorAvatars(input.host, input.workers, input.options);
  };

  let handle: FloorAvatarsHandle | null = null;
  try {
    handle = await mount(input.loadShader);
  } catch {
    // A compile/link failure or a failed shader chunk falls through to the GLBs.
  }

  if (handle) {
    if (input.isDisposed()) {
      handle.dispose();
      return null;
    }
    return handle;
  }

  try {
    handle = await mount(input.loadGlb);
  } catch {
    if (!input.isDisposed()) input.options.onFailure?.();
    return null;
  }

  if (handle && input.isDisposed()) {
    handle.dispose();
    return null;
  }
  return handle;
}
