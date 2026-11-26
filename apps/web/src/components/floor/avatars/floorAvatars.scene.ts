// The Floor's 3D layer. three.js is loaded only on /floor through a dynamic import, so the
// rest of the web client pays nothing for it. Until the Media desk's GLBs land, each worker
// gets a placeholder built from the same node and joint names the GLBs will use.
import {
  ACESFilmicToneMapping,
  Box3,
  CanvasTexture,
  CapsuleGeometry,
  CircleGeometry,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  OrthographicCamera,
  PMREMGenerator,
  PlaneGeometry,
  Quaternion,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
} from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  bodyBob,
  isAnimatedFloorJoint,
  jointAngle,
  parseFloorAvatarManifest,
  parseSand3dJoint,
  type FloorAvatarAsset,
  type FloorAvatarAssetsState,
  type FloorAvatarWorker,
  type FloorJoint,
} from "./floorAvatars.logic";

const AVATAR_PIXELS = 104;
const BASELINE_PX = 148;
const MAX_DPR = 2;

type JointRuntime = {
  node: Object3D;
  rest: Quaternion;
  axis: Vector3;
  joint: FloorJoint;
};

type AccentMaterial = { color: Color; factor: number };

type AvatarRuntime = {
  id: string;
  color: string;
  xPercent: number;
  busy: boolean;
  selected: boolean;
  phase: number;
  root: Group;
  slot: Group;
  current: Object3D | null;
  body: Object3D | null;
  bodyRestY: number;
  joints: JointRuntime[];
  accentMaterials: AccentMaterial[];
  selection: Mesh;
  selectionMaterial: MeshBasicMaterial;
  height: number;
};

export type FloorAvatarsHandle = {
  setWorkers(workers: FloorAvatarWorker[]): void;
  dispose(): void;
};

export type FloorAvatarsOptions = {
  onReady?: () => void;
  onFailure?: () => void;
  onAssets?: (state: FloorAvatarAssetsState) => void;
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
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.setAttribute("aria-hidden", "true");
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  host.appendChild(renderer.domElement);

  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environmentTexture = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  pmrem.dispose();
  scene.environment = environmentTexture;

  const key = new DirectionalLight(0xffffff, 2.2);
  key.position.set(-2.5, 4, 5);
  scene.add(key);
  const fill = new DirectionalLight(0xbfd8ff, 1);
  fill.position.set(3, 1.5, 3);
  scene.add(fill);
  const rim = new DirectionalLight(0xd9e8ff, 2.6);
  rim.position.set(0, 3, -4);
  scene.add(rim);
  scene.add(new HemisphereLight(0xffffff, 0x27313d, 1.3));

  const glowTexture = createGlowTexture();
  const avatars = new Map<string, AvatarRuntime>();
  const rotation = new Quaternion();
  let width = 0;
  let height = 0;
  let disposed = false;
  let contextLost = false;
  let frame = 0;
  let lastTime = 0;
  let elapsed = 0;

  const media = window.matchMedia("(prefers-reduced-motion: reduce)");

  function onContextLost(event: Event) {
    event.preventDefault();
    contextLost = true;
    stop();
    options.onFailure?.();
  }

  function applyColor(runtime: AvatarRuntime) {
    const base = new Color(runtime.color);
    for (const entry of runtime.accentMaterials) {
      entry.color.copy(base);
      if (entry.factor !== 1) entry.color.multiplyScalar(entry.factor);
    }
    runtime.selectionMaterial.color.set(runtime.color);
  }

  function layout() {
    if (width === 0 || height === 0) return;
    const avatarPixels = Math.max(64, Math.min(AVATAR_PIXELS, width / 5 - 12));
    for (const runtime of avatars.values()) {
      runtime.root.position.x = (runtime.xPercent / 100) * width - width / 2;
      runtime.root.position.y = height / 2 - BASELINE_PX;
      runtime.root.scale.setScalar(avatarPixels / runtime.height);
    }
  }

  function pose(seconds: number) {
    for (const runtime of avatars.values()) {
      for (const joint of runtime.joints) {
        rotation.setFromAxisAngle(
          joint.axis,
          jointAngle(joint.joint, runtime.busy, seconds, runtime.phase),
        );
        joint.node.quaternion.copy(joint.rest).multiply(rotation);
      }
      if (runtime.body)
        runtime.body.position.y = runtime.bodyRestY + bodyBob(runtime.busy, seconds, runtime.phase);
      runtime.selection.visible = runtime.selected;
      if (runtime.selected) {
        const pulse = 1 + 0.04 * Math.sin(seconds * 3.2);
        runtime.selection.scale.setScalar(pulse);
        runtime.selectionMaterial.opacity = 0.3 + 0.12 * Math.sin(seconds * 3.2);
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
    pose(elapsed);
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
    pose(elapsed);
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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_DPR));
    renderer.setSize(width, height, false);
    layout();
    if (frame === 0) renderStill();
  }

  function createRuntime(worker: FloorAvatarWorker): AvatarRuntime {
    const root = new Group();
    root.name = `avatar_${worker.id}`;
    root.rotation.y = (avatars.size % 2 === 0 ? 1 : -1) * 0.09;
    const slot = new Group();
    slot.name = "model";
    root.add(slot);

    const selectionMaterial = new MeshBasicMaterial({
      map: glowTexture,
      color: worker.color,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      toneMapped: false,
    });
    const selection = new Mesh(new PlaneGeometry(1.25, 1.25), selectionMaterial);
    selection.position.set(0, 0.6, -0.42);
    selection.name = "selection";
    selection.visible = false;
    root.add(selection);

    const runtime: AvatarRuntime = {
      id: worker.id,
      color: worker.color,
      xPercent: worker.xPercent,
      busy: worker.busy,
      selected: worker.selected,
      phase: worker.phase,
      root,
      slot,
      current: null,
      body: null,
      bodyRestY: 0,
      joints: [],
      accentMaterials: [],
      selection,
      selectionMaterial,
      height: 1.2,
    };
    installPlaceholder(runtime);
    scene.add(root);
    return runtime;
  }

  function installPlaceholder(runtime: AvatarRuntime) {
    const placeholder = buildPlaceholder(runtime.id, runtime.color);
    runtime.slot.add(placeholder.object);
    runtime.current = placeholder.object;
    runtime.body = placeholder.body;
    runtime.bodyRestY = placeholder.body.position.y;
    runtime.joints = bindJoints(placeholder.object);
    runtime.accentMaterials = placeholder.accentMaterials;
    runtime.height = placeholder.height;
    applyColor(runtime);
  }

  function installAsset(runtime: AvatarRuntime, gltfScene: Object3D, asset: FloorAvatarAsset) {
    const model = gltfScene.getObjectByName(`avatar_${asset.id}`) ?? gltfScene;
    const parent = model.parent;
    if (parent) {
      parent.updateWorldMatrix(true, false);
      model.applyMatrix4(parent.matrixWorld);
      model.removeFromParent();
    }
    const modelHeight = groundAvatar(model, asset.heightM);
    const previous = runtime.current;
    runtime.slot.clear();
    if (previous) disposeObject(previous, false);
    runtime.slot.add(model);
    runtime.current = model;
    runtime.height = modelHeight;
    runtime.body = model.getObjectByName("body") ?? null;
    runtime.bodyRestY = runtime.body?.position.y ?? 0;
    runtime.joints = bindJoints(model);
    runtime.accentMaterials = collectAccentMaterials(model);
    applyColor(runtime);
    layout();
  }

  async function loadAssets() {
    const assetBase = new URL(
      "floor/avatars/",
      new URL(import.meta.env.BASE_URL, window.location.href),
    );
    let entries: FloorAvatarAsset[] = [];
    try {
      const response = await fetch(new URL("manifest.json", assetBase), { cache: "no-store" });
      if (response.ok) {
        const manifest = parseFloorAvatarManifest(await response.json());
        entries = manifest?.avatars ?? [];
      }
    } catch {
      entries = [];
    }
    if (disposed) return;
    options.onAssets?.({ loaded: 0, total: entries.length });
    if (entries.length === 0) return;

    let loaded = 0;
    const loader = new GLTFLoader();
    await Promise.all(
      entries.map(async (asset) => {
        const runtime = avatars.get(asset.id);
        if (!runtime) return;
        try {
          const assetUrl = new URL(asset.file, assetBase);
          assetUrl.searchParams.set("v", asset.sha256.slice(0, 12));
          const gltf = await loader.loadAsync(assetUrl.href);
          if (disposed) {
            disposeObject(gltf.scene);
            return;
          }
          installAsset(runtime, gltf.scene, asset);
          loaded += 1;
          options.onAssets?.({ loaded, total: entries.length });
        } catch {
          // A missing or invalid file leaves that worker on its placeholder.
        }
      }),
    );
  }

  function setWorkers(workers: FloorAvatarWorker[]) {
    const keep = new Set(workers.map((worker) => worker.id));
    for (const [id, runtime] of avatars) {
      if (!keep.has(id)) {
        scene.remove(runtime.root);
        disposeObject(runtime.root, false);
        avatars.delete(id);
      }
    }
    for (const worker of workers) {
      let runtime = avatars.get(worker.id);
      if (!runtime) {
        runtime = createRuntime(worker);
        avatars.set(worker.id, runtime);
      }
      runtime.busy = worker.busy;
      runtime.selected = worker.selected;
      runtime.phase = worker.phase;
      runtime.xPercent = worker.xPercent;
      if (runtime.color !== worker.color) {
        runtime.color = worker.color;
        applyColor(runtime);
      }
    }
    layout();
    if (frame === 0) renderStill();
  }

  const observer = new ResizeObserver(resize);
  observer.observe(host);
  document.addEventListener("visibilitychange", onVisibility);
  media.addEventListener("change", onMotionPreference);
  renderer.domElement.addEventListener("webglcontextlost", onContextLost);

  setWorkers(initial);
  resize();
  if (width === 0 || height === 0) {
    // The stage can still be laying out; the ResizeObserver will finish the first frame.
    width = Math.max(1, host.clientWidth);
    height = Math.max(1, host.clientHeight);
    camera.left = -width / 2;
    camera.right = width / 2;
    camera.top = height / 2;
    camera.bottom = -height / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    layout();
  }
  renderStill();
  options.onReady?.();
  start();
  void loadAssets();

  return {
    setWorkers,
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      media.removeEventListener("change", onMotionPreference);
      renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
      disposeObject(scene);
      glowTexture?.dispose();
      environmentTexture.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      avatars.clear();
    },
  };
}

function buildPlaceholder(
  id: string,
  color: string,
): {
  object: Group;
  body: Group;
  accentMaterials: AccentMaterial[];
  height: number;
} {
  const root = new Group();
  root.name = `placeholder_${id}`;

  const accent = new MeshStandardMaterial({
    name: "accent",
    color,
    roughness: 0.58,
    metalness: 0.04,
  });
  const accentDark = new MeshStandardMaterial({
    name: "accent_dark",
    color: new Color(color).multiplyScalar(0.64),
    roughness: 0.66,
  });
  const trim = new MeshStandardMaterial({
    name: "trim",
    color: "#2c3542",
    roughness: 0.45,
    metalness: 0.2,
  });
  const sclera = new MeshStandardMaterial({ name: "sclera", color: "#f8f3e8", roughness: 0.35 });
  const pupil = new MeshStandardMaterial({ name: "pupil", color: "#111820", roughness: 0.25 });
  const mouth = new MeshStandardMaterial({ name: "mouth", color: "#7c4348", roughness: 0.6 });

  const body = new Group();
  body.name = "body";
  body.position.y = 0.18;
  root.add(body);

  const torso = new Mesh(new RoundedBoxGeometry(0.28, 0.4, 0.2, 4, 0.06), accent);
  torso.name = "body_shell";
  torso.position.y = 0.2;
  body.add(torso);
  const badge = new Mesh(new CircleGeometry(0.045, 20), trim);
  badge.position.set(0, 0.24, 0.101);
  body.add(badge);

  const headTurn = new Group();
  headTurn.name = "head_turn";
  headTurn.position.y = 0.42;
  headTurn.userData.s3d_joint = {
    name: "head_turn",
    type: "revolute",
    axis: [0, 1, 0],
    lower: -0.55,
    upper: 0.55,
  };
  body.add(headTurn);

  const head = new Group();
  head.name = "head";
  headTurn.add(head);
  const headShell = new Mesh(new SphereGeometry(0.29, 32, 24), accent);
  headShell.name = "head_shell";
  headShell.position.y = 0.3;
  headShell.scale.set(1, 0.98, 0.94);
  head.add(headShell);

  const face = [
    { name: "eye_l", x: 0.105, y: 0.35, z: 0.247 },
    { name: "eye_r", x: -0.105, y: 0.35, z: 0.247 },
  ] as const;
  for (const eye of face) {
    const node = new Group();
    node.name = eye.name;
    node.position.set(eye.x, eye.y, eye.z);
    const white = new Mesh(new SphereGeometry(0.072, 20, 16), sclera);
    white.scale.set(1, 1.12, 0.72);
    node.add(white);
    const iris = new Mesh(new SphereGeometry(0.032, 16, 12), pupil);
    iris.position.z = 0.055;
    node.add(iris);
    head.add(node);
  }

  const brows = [
    { name: "brow_l", x: 0.107, tilt: 0.12 },
    { name: "brow_r", x: -0.107, tilt: -0.12 },
  ] as const;
  for (const brow of brows) {
    const node = new Group();
    node.name = brow.name;
    node.position.set(brow.x, 0.465, 0.25);
    node.rotation.z = brow.tilt;
    const bar = new Mesh(new RoundedBoxGeometry(0.115, 0.026, 0.024, 2, 0.011), trim);
    node.add(bar);
    head.add(node);
  }

  const nose = new Mesh(new SphereGeometry(0.036, 16, 12), accentDark);
  nose.name = "nose";
  nose.position.set(0, 0.29, 0.285);
  head.add(nose);

  const mouthNode = new Mesh(new RoundedBoxGeometry(0.15, 0.026, 0.02, 2, 0.01), mouth);
  mouthNode.name = "mouth";
  mouthNode.position.set(0, 0.2, 0.272);
  head.add(mouthNode);

  const arms = [
    { name: "arm_l", x: 0.17, side: 1 },
    { name: "arm_r", x: -0.17, side: -1 },
  ] as const;
  for (const arm of arms) {
    const swing = new Group();
    swing.name = `${arm.name}_swing`;
    swing.position.set(arm.x, 0.37, 0);
    swing.userData.s3d_joint = {
      name: `${arm.name}_swing`,
      type: "revolute",
      axis: [1, 0, 0],
      lower: -0.9,
      upper: 0.9,
    };
    body.add(swing);
    const limb = new Group();
    limb.name = arm.name;
    swing.add(limb);
    const upper = new Mesh(new CapsuleGeometry(0.045, 0.12, 6, 12), accentDark);
    upper.name = `${arm.name}_mesh`;
    upper.position.y = -0.105;
    limb.add(upper);
    const hand = new Mesh(new SphereGeometry(0.055, 16, 12), trim);
    hand.name = `${arm.name}_hand`;
    hand.position.y = -0.23;
    limb.add(hand);
  }

  const legs = [
    { name: "leg_l", x: 0.075 },
    { name: "leg_r", x: -0.075 },
  ] as const;
  for (const leg of legs) {
    const swing = new Group();
    swing.name = `${leg.name}_swing`;
    swing.position.set(leg.x, 0.18, 0);
    swing.userData.s3d_joint = {
      name: `${leg.name}_swing`,
      type: "revolute",
      axis: [1, 0, 0],
      lower: -0.5,
      upper: 0.5,
    };
    root.add(swing);
    const limb = new Group();
    limb.name = leg.name;
    swing.add(limb);
    const shin = new Mesh(new CapsuleGeometry(0.05, 0.08, 6, 12), accentDark);
    shin.name = `${leg.name}_mesh`;
    shin.position.y = -0.09;
    limb.add(shin);
    const foot = new Mesh(new RoundedBoxGeometry(0.11, 0.05, 0.15, 3, 0.02), trim);
    foot.name = `${leg.name}_foot`;
    foot.position.set(0, -0.155, 0.025);
    limb.add(foot);
  }

  return {
    object: root,
    body,
    accentMaterials: [
      { color: accent.color, factor: 1 },
      { color: accentDark.color, factor: 0.64 },
    ],
    height: 1.2,
  };
}

function bindJoints(root: Object3D): JointRuntime[] {
  const joints: JointRuntime[] = [];
  root.traverse((node) => {
    const joint = parseSand3dJoint(node.userData);
    if (!joint || !isAnimatedFloorJoint(joint.name)) return;
    joints.push({
      node,
      rest: node.quaternion.clone(),
      axis: new Vector3(joint.axis[0], joint.axis[1], joint.axis[2]),
      joint,
    });
  });
  return joints;
}

function collectAccentMaterials(root: Object3D): AccentMaterial[] {
  const materials: AccentMaterial[] = [];
  const seen = new Set<string>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material.name !== "accent" || seen.has(material.uuid)) continue;
      if ("color" in material && material.color instanceof Color) {
        seen.add(material.uuid);
        materials.push({ color: material.color, factor: 1 });
      }
    }
  });
  return materials;
}

function groundAvatar(model: Object3D, fallbackHeight: number): number {
  model.updateWorldMatrix(true, true);
  // Precise mode walks vertices. The default corner-based box overshoots the rotated ear tips
  // on baashe and qasim by about 25 mm, which would scale the whole avatar down.
  const bounds = new Box3().setFromObject(model, true);
  if (bounds.isEmpty()) return fallbackHeight;
  const size = bounds.getSize(new Vector3());
  const center = bounds.getCenter(new Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= bounds.min.y;
  return size.y > 0.01 ? size.y : fallbackHeight;
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

function disposeObject(root: Object3D, disposeTextures = true) {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      if (disposeTextures) {
        for (const value of Object.values(material)) {
          if (value instanceof Texture) textures.add(value);
        }
      }
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
}
