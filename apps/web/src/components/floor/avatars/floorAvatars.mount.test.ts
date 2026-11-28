import { describe, expect, it, vi } from "vite-plus/test";

import { mountFloorAvatarLayer, type FloorAvatarModule } from "./floorAvatars.mount";
import type { FloorAvatarsHandle } from "./floorAvatars.scene";
import type { FloorAvatarWorker } from "./floorAvatars.logic";

const workers: FloorAvatarWorker[] = [
  { id: "nasir", color: "#45707e", xPercent: 10, busy: true, selected: false, phase: 0 },
];

function fakeHandle(): FloorAvatarsHandle {
  return {
    setWorkers: vi.fn(),
    dispose: vi.fn(),
  };
}

function fakeModule(mount: FloorAvatarModule["mountFloorAvatars"]): FloorAvatarModule {
  return { mountFloorAvatars: mount };
}

function input(overrides: Partial<Parameters<typeof mountFloorAvatarLayer>[0]> = {}) {
  const host = {} as HTMLElement;
  return {
    host,
    workers,
    options: {},
    loadShader: vi.fn(async () => fakeModule(() => fakeHandle())),
    loadGlb: vi.fn(async () => fakeModule(() => fakeHandle())),
    hasWebGL2: () => true,
    isDisposed: () => false,
    ...overrides,
  };
}

describe("mountFloorAvatarLayer", () => {
  it("prefers the shader and does not load the GLBs when it mounts", async () => {
    const glbHandle = fakeHandle();
    const loadGlb = vi.fn(async () => fakeModule(() => glbHandle));
    const handle = await mountFloorAvatarLayer(input({ loadGlb }));
    expect(handle).not.toBeNull();
    expect(loadGlb).not.toHaveBeenCalled();
  });

  it("mounts the GLBs when the shader throws a compile or link error", async () => {
    const glbHandle = fakeHandle();
    const loadGlb = vi.fn(async () => fakeModule(() => glbHandle));
    const options = {
      onFailure: vi.fn(),
    };
    const handle = await mountFloorAvatarLayer(
      input({
        options,
        loadShader: vi.fn(async () =>
          fakeModule(() => {
            throw new Error("shader compile failed");
          }),
        ),
        loadGlb,
      }),
    );
    expect(handle).toBe(glbHandle);
    expect(options.onFailure).not.toHaveBeenCalled();
  });

  it("keeps the SVG workers when WebGL2 is missing, without loading either renderer", async () => {
    const options = { onFailure: vi.fn() };
    const loadShader = vi.fn(async () => fakeModule(() => fakeHandle()));
    const loadGlb = vi.fn(async () => fakeModule(() => fakeHandle()));
    const handle = await mountFloorAvatarLayer(
      input({ options, hasWebGL2: () => false, loadShader, loadGlb }),
    );
    expect(handle).toBeNull();
    expect(loadShader).not.toHaveBeenCalled();
    expect(loadGlb).not.toHaveBeenCalled();
    expect(options.onFailure).toHaveBeenCalledOnce();
  });

  it("reports a failure when both renderers fail", async () => {
    const options = { onFailure: vi.fn() };
    const handle = await mountFloorAvatarLayer(
      input({
        options,
        loadShader: vi.fn(async () =>
          fakeModule(() => {
            throw new Error("shader compile failed");
          }),
        ),
        loadGlb: vi.fn(async () =>
          fakeModule(() => {
            throw new Error("GLB mount failed");
          }),
        ),
      }),
    );
    expect(handle).toBeNull();
    expect(options.onFailure).toHaveBeenCalledOnce();
  });

  it("does not mount after the component has been disposed", async () => {
    const loadShader = vi.fn(async () => fakeModule(() => fakeHandle()));
    const handle = await mountFloorAvatarLayer(input({ isDisposed: () => true, loadShader }));
    expect(handle).toBeNull();
    expect(loadShader).not.toHaveBeenCalled();
  });
});
