import {
  CanvasTexture,
  GLSL3,
  Group,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PlaneGeometry,
  RawShaderMaterial,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
  type Texture,
} from "three";
import { observeResize } from "~/lib/observeResize";

import {
  FRAGMENT,
  KINDS,
  layout as shaderLayout,
  uniformValues,
  VERTEX_THREE,
} from "./r6/avatar-shader";
import { rigAt } from "./r6/rig";
import {
  parseFloorAvatarManifest,
  type FloorAvatarAsset,
  type FloorAvatarId,
  type FloorAvatarWorker,
} from "./floorAvatars.logic";
import type { FloorAvatarsHandle, FloorAvatarsOptions } from "./floorAvatars.scene";

const AVATAR_PIXELS = 104;
const BASELINE_PX = 148;
const MAX_DPR = 2;

// The default skins are the manifest defaults. They keep the first frame stable while the
// manifest fetch is in flight and cover a failed manifest fetch.
const DEFAULT_SKINS: Record<FloorAvatarId, [string, string, string]> = {
  nasir: ["#d4a257", "#f8f5ec", "#5a3d22"],
  baashe: ["#d9621f", "#f3e6d3", "#2b1d17"],
  faris: ["#8a5a34", "#cfa87a", "#3c2616"],
  qasim: ["#c7863f", "#f0d9b0", "#5b3a1c"],
};

type ShaderUniforms = Record<string, { value: number | number[] }>;

type ShaderRuntime = {
  id: FloorAvatarId;
  color: string;
  xPercent: number;
  busy: boolean;
  selected: boolean;
  phase: number;
  root: Group;
  mesh: Mesh<PlaneGeometry, RawShaderMaterial>;
  uniforms: ShaderUniforms;
  selection: Mesh<PlaneGeometry, MeshBasicMaterial>;
  selectionMaterial: MeshBasicMaterial;
  asset: FloorAvatarAsset | null;
  skin: [string, string, string];
  avatarPixels: number;
  selectionWidth: number;
  selectionHeight: number;
};

export function mountFloorAvatars(
  host: HTMLElement,
  initial: FloorAvatarWorker[],
  options: FloorAvatarsOptions = {},
): FloorAvatarsHandle {
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 2000);
  camera.position.z = 500;

  const renderer = new WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.setAttribute("aria-hidden", "true");
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  host.appendChild(renderer.domElement);

  let shaderError: string | null = null;
  renderer.debug.onShaderError = (_gl, _program, vertexShader, fragmentShader) => {
    shaderError = `Floor avatar shader failed to compile: ${vertexShader} / ${fragmentShader}`;
  };

  const glowTexture = createGlowTexture();
  const avatars = new Map<string, ShaderRuntime>();
  const assets = new Map<string, FloorAvatarAsset>();
  let width = 0;
  let height = 0;
  let dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  let disposed = false;
  let contextLost = false;
  let frame = 0;
  let lastTime = 0;
  let elapsed = 0;
  let dprQuery: MediaQueryList | null = null;

  const media = window.matchMedia("(prefers-reduced-motion: reduce)");

  function onContextLost(event: Event) {
    event.preventDefault();
    contextLost = true;
    stop();
    options.onFailure?.();
  }

  function selectionMaterial(color: string): MeshBasicMaterial {
    return new MeshBasicMaterial({
      map: glowTexture,
      color,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      toneMapped: false,
    });
  }

  function createRuntime(worker: FloorAvatarWorker): ShaderRuntime | null {
    if (!(worker.id in KINDS)) return null;
    const id = worker.id as FloorAvatarId;
    const asset = assets.get(id) ?? null;
    const skin = skinFor(id, asset);
    const root = new Group();
    root.name = `avatar_${id}`;
    root.rotation.y = 0;

    const selection = new Mesh(new PlaneGeometry(1, 1), selectionMaterial(worker.color));
    selection.name = "selection";
    selection.position.z = -0.42;
    selection.renderOrder = 0;
    selection.visible = false;
    root.add(selection);

    const values = uniformValues(
      { id, skin, accent: worker.color, h: AVATAR_PIXELS, dpr },
      rigAt("idle", 0),
    );
    const uniforms: ShaderUniforms = Object.fromEntries(
      Object.entries(values).map(([key, value]) => [key, { value }]),
    );
    const material = new RawShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: VERTEX_THREE,
      fragmentShader: FRAGMENT,
      uniforms,
      transparent: true,
      premultipliedAlpha: true,
      toneMapped: false,
      depthWrite: false,
    });
    const mesh = new Mesh(new PlaneGeometry(1, 1), material);
    mesh.name = "shader";
    mesh.position.z = 0;
    mesh.renderOrder = 1;
    root.add(mesh);

    scene.add(root);
    return {
      id,
      color: worker.color,
      xPercent: worker.xPercent,
      busy: worker.busy,
      selected: worker.selected,
      phase: worker.phase,
      root,
      mesh,
      uniforms,
      selection,
      selectionMaterial: selection.material,
      asset,
      skin,
      avatarPixels: AVATAR_PIXELS,
      selectionWidth: 1,
      selectionHeight: 1,
    };
  }

  function layout() {
    if (width === 0 || height === 0) return;
    const nextDpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    if (nextDpr !== dpr) {
      dpr = nextDpr;
      renderer.setPixelRatio(dpr);
      renderer.setSize(width, height, false);
    }
    const avatarPixels = Math.max(64, Math.min(AVATAR_PIXELS, width / 5 - 12));
    for (const runtime of avatars.values()) {
      const size = shaderLayout(avatarPixels, dpr);
      runtime.avatarPixels = avatarPixels;
      runtime.root.position.x = (runtime.xPercent / 100) * width - width / 2;
      runtime.root.position.y = height / 2 - BASELINE_PX;
      runtime.mesh.scale.set(size.width, size.height, 1);
      runtime.mesh.position.y = size.height / 2;
      runtime.selectionWidth = size.width * 1.4;
      runtime.selectionHeight = size.height * 1.1;
      runtime.selection.scale.set(runtime.selectionWidth, runtime.selectionHeight, 1);
      runtime.selection.position.y = size.height / 2;
    }
  }

  function paint(
    runtime: ShaderRuntime,
    state: "idle" | "working",
    t: number,
    phaseOffset: number,
  ) {
    const values = uniformValues(
      {
        id: runtime.id,
        skin: runtime.skin,
        accent: runtime.color,
        h: runtime.avatarPixels,
        dpr,
      },
      rigAt(state, t + phaseOffset),
    );
    for (const [key, value] of Object.entries(values)) {
      const uniform = runtime.uniforms[key];
      if (uniform) uniform.value = value;
    }
  }

  function syncDpr() {
    if (width === 0 || height === 0) return;
    const nextDpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    if (nextDpr === dpr) return;
    dpr = nextDpr;
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    layout();
  }

  function pose(seconds: number, reduced: boolean) {
    syncDpr();
    for (const runtime of avatars.values()) {
      paint(
        runtime,
        reduced ? "idle" : runtime.busy ? "working" : "idle",
        reduced ? 1 : seconds,
        reduced ? 0 : runtime.phase,
      );
      runtime.selection.visible = runtime.selected;
      if (runtime.selected) {
        const pulse = 1 + (reduced ? 0 : 0.04 * Math.sin(seconds * 3.2));
        runtime.selection.scale.set(
          runtime.selectionWidth * pulse,
          runtime.selectionHeight * pulse,
          1,
        );
        runtime.selectionMaterial.opacity = reduced ? 0.34 : 0.3 + 0.12 * Math.sin(seconds * 3.2);
      }
    }
  }

  function renderFrame() {
    if (contextLost || width === 0 || height === 0) return;
    renderer.render(scene, camera);
  }

  function tick(now: number) {
    if (disposed || contextLost) return;
    frame = window.requestAnimationFrame(tick);
    const delta = lastTime === 0 ? 0 : Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    if (!document.hidden) elapsed += delta;
    pose(elapsed, false);
    renderer.render(scene, camera);
  }

  function stop() {
    if (frame !== 0) window.cancelAnimationFrame(frame);
    frame = 0;
  }

  function start() {
    if (disposed || contextLost || frame !== 0 || media.matches || document.hidden) return;
    lastTime = 0;
    frame = window.requestAnimationFrame(tick);
  }

  function renderStill() {
    pose(elapsed, media.matches);
    renderFrame();
  }

  function onVisibility() {
    if (document.hidden) stop();
    else start();
  }

  function onMotionPreference() {
    if (media.matches) {
      stop();
      renderStill();
    } else {
      start();
    }
  }

  function onDprChange() {
    resize();
    watchDpr();
  }

  function watchDpr() {
    dprQuery?.removeEventListener("change", onDprChange);
    dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    dprQuery.addEventListener("change", onDprChange, { once: true });
  }

  function resize() {
    if (contextLost) return;
    const nextWidth = host.clientWidth;
    const nextHeight = host.clientHeight;
    if (nextWidth === 0 || nextHeight === 0) return;
    width = nextWidth;
    height = nextHeight;
    camera.left = -width / 2;
    camera.right = width / 2;
    camera.top = height / 2;
    camera.bottom = -height / 2;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR));
    renderer.setSize(width, height, false);
    layout();
    if (frame === 0) renderStill();
  }

  function setWorkers(workers: FloorAvatarWorker[]) {
    const keep = new Set(workers.map((worker) => worker.id));
    for (const [id, runtime] of avatars) {
      if (!keep.has(id)) {
        scene.remove(runtime.root);
        disposeRuntime(runtime);
        avatars.delete(id);
      }
    }
    for (const worker of workers) {
      let runtime = avatars.get(worker.id);
      if (!runtime) {
        const created = createRuntime(worker);
        if (!created) continue;
        runtime = created;
        avatars.set(worker.id, runtime);
      }
      runtime.busy = worker.busy;
      runtime.selected = worker.selected;
      runtime.phase = worker.phase;
      runtime.xPercent = worker.xPercent;
      if (runtime.color !== worker.color) {
        runtime.color = worker.color;
        runtime.selectionMaterial.color.set(worker.color);
      }
      if (runtime.asset) runtime.skin = skinFor(runtime.id, runtime.asset);
    }
    layout();
    if (frame === 0) renderStill();
  }

  async function loadManifest() {
    const assetBase = new URL(
      "floor/avatars/",
      new URL(import.meta.env.BASE_URL, window.location.href),
    );
    try {
      const response = await fetch(new URL("manifest.json", assetBase), { cache: "no-store" });
      if (!response.ok) return;
      const manifest = parseFloorAvatarManifest(await response.json());
      if (!manifest || disposed) return;
      for (const asset of manifest.avatars) {
        assets.set(asset.id, asset);
        const runtime = avatars.get(asset.id);
        if (runtime) {
          runtime.asset = asset;
          runtime.skin = skinFor(asset.id, asset);
        }
      }
      options.onAssets?.({ loaded: manifest.avatars.length, total: manifest.avatars.length });
      if (frame === 0) renderStill();
    } catch {
      // The built-in default skins keep the shader running without the manifest.
    }
  }

  function disposeRuntime(runtime: ShaderRuntime) {
    runtime.root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.geometry.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        material.dispose();
      }
    });
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    stop();
    stopResize();
    window.removeEventListener("resize", resize);
    dprQuery?.removeEventListener("change", onDprChange);
    document.removeEventListener("visibilitychange", onVisibility);
    media.removeEventListener("change", onMotionPreference);
    renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
    for (const runtime of avatars.values()) disposeRuntime(runtime);
    avatars.clear();
    glowTexture?.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  }

  const stopResize = observeResize(host, resize);
  window.addEventListener("resize", resize);
  watchDpr();
  document.addEventListener("visibilitychange", onVisibility);
  media.addEventListener("change", onMotionPreference);
  renderer.domElement.addEventListener("webglcontextlost", onContextLost);

  setWorkers(initial);
  options.onAssets?.({ loaded: initial.length, total: initial.length });
  resize();
  renderer.compile(scene, camera);
  if (shaderError) {
    dispose();
    throw new Error(shaderError);
  }
  renderStill();
  if (shaderError) {
    dispose();
    throw new Error(shaderError);
  }
  options.onReady?.();
  start();
  void loadManifest();

  return { setWorkers, dispose };
}

function skinFor(id: FloorAvatarId, asset: FloorAvatarAsset | null): [string, string, string] {
  const name = asset?.defaultSkin;
  const skin = name ? asset?.skins[name] : undefined;
  return skin ? [skin.base, skin.belly, skin.mark] : DEFAULT_SKINS[id];
}

function createGlowTexture(): Texture | null {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const gradient = context.createRadialGradient(64, 64, 10, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.9)");
  gradient.addColorStop(0.45, "rgba(255, 255, 255, 0.32)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
