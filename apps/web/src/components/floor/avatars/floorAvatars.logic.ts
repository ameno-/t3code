// Contract with the Media desk's floor-avatars piece. The r6 shader is the Floor default;
// the r3 GLBs are the compile/link fallback. Both are vendored from ameno-/media-pieces.

export const FLOOR_AVATAR_IDS = ["nasir", "baashe", "faris", "qasim"] as const;
export type FloorAvatarId = (typeof FLOOR_AVATAR_IDS)[number];

export type FloorAvatarWorker = {
  id: string;
  color: string;
  xPercent: number;
  busy: boolean;
  selected: boolean;
  phase: number;
};

export type FloorAvatarAssetsState = { loaded: number; total: number };

export type FloorAvatarSkin = {
  base: string;
  belly: string;
  mark: string;
};

export type FloorAvatarAsset = {
  id: FloorAvatarId;
  file: string;
  sha256: string;
  bytes: number;
  heightM: number;
  defaultSkin: string | null;
  skins: Record<string, FloorAvatarSkin>;
};

export type FloorAvatarSchema = "floor-avatars/1" | "floor-avatars/2";

export type FloorAvatarManifest = {
  schema: FloorAvatarSchema;
  avatars: FloorAvatarAsset[];
  sourceCommit: string | null;
  license: string | null;
};

export type FloorJoint = {
  name: string;
  kind: string;
  axis: readonly [number, number, number];
  lower: number;
  upper: number;
};

// The GLBs also carry brow and eyelid joints. They stay at rest until there is a face plan.
const ANIMATED_FLOOR_JOINTS = new Set([
  "head_turn",
  "arm_l_swing",
  "arm_r_swing",
  "leg_l_swing",
  "leg_r_swing",
]);

export function isAnimatedFloorJoint(name: string): boolean {
  return ANIMATED_FLOOR_JOINTS.has(name);
}

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clamp(value: number, lower: number, upper: number): number {
  return Math.min(upper, Math.max(lower, value));
}

function parseSkinColor(value: unknown): string | null {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null;
}

function parseSkin(value: unknown): FloorAvatarSkin | null {
  if (!isObject(value)) return null;
  const base = isObject(value.skin_base) ? parseSkinColor(value.skin_base.color) : null;
  const belly = isObject(value.skin_belly) ? parseSkinColor(value.skin_belly.color) : null;
  const mark = isObject(value.skin_mark) ? parseSkinColor(value.skin_mark.color) : null;
  return base && belly && mark ? { base, belly, mark } : null;
}

function parseSkins(value: unknown): Record<string, FloorAvatarSkin> {
  if (!isObject(value)) return {};
  const skins: Record<string, FloorAvatarSkin> = {};
  for (const [name, candidate] of Object.entries(value)) {
    const skin = parseSkin(candidate);
    if (skin) skins[name] = skin;
  }
  return skins;
}

function parseAxis(value: unknown): readonly [number, number, number] | null {
  if (Array.isArray(value) && value.length === 3) {
    const x = finite(value[0]);
    const y = finite(value[1]);
    const z = finite(value[2]);
    if (x === null || y === null || z === null) return null;
    const length = Math.hypot(x, y, z);
    return length > 0 ? [x / length, y / length, z / length] : null;
  }
  if (typeof value === "string") {
    const match = /^([+-]?)([xyz])$/i.exec(value.trim());
    if (!match) return null;
    const sign = match[1] === "-" ? -1 : 1;
    const axis = match[2]!.toLowerCase();
    return axis === "x" ? [sign, 0, 0] : axis === "y" ? [0, sign, 0] : [0, 0, sign];
  }
  return null;
}

/** Reads the joint sand3d writes into a moving node's glTF extras. */
export function parseSand3dJoint(userData: unknown): FloorJoint | null {
  if (!isObject(userData) || !isObject(userData.s3d_joint)) return null;
  const raw = userData.s3d_joint;
  const name = typeof raw.name === "string" && raw.name.length > 0 ? raw.name : null;
  const kind = typeof raw.type === "string" ? raw.type : "revolute";
  const axis = parseAxis(raw.axis);
  const lower = finite(raw.lower);
  const upper = finite(raw.upper);
  if (!name || !axis || (kind !== "revolute" && kind !== "continuous")) return null;
  if (lower === null || upper === null) {
    const span = kind === "continuous" ? Math.PI : Math.PI / 2;
    return { name, kind, axis, lower: -span, upper: span };
  }
  return {
    name,
    kind,
    axis,
    lower: clamp(Math.min(lower, upper), -Math.PI, 0),
    upper: clamp(Math.max(lower, upper), 0, Math.PI),
  };
}

export function parseFloorAvatarManifest(value: unknown): FloorAvatarManifest | null {
  if (
    !isObject(value) ||
    (value.schema !== "floor-avatars/1" && value.schema !== "floor-avatars/2") ||
    !Array.isArray(value.avatars)
  ) {
    return null;
  }
  const schema = value.schema;
  const avatars: FloorAvatarAsset[] = [];
  const seen = new Set<string>();
  for (const candidate of value.avatars) {
    if (!isObject(candidate)) continue;
    const id = candidate.id;
    if (typeof id !== "string" || !FLOOR_AVATAR_IDS.includes(id as FloorAvatarId) || seen.has(id))
      continue;
    const file = candidate.file;
    if (typeof file !== "string" || !/^[a-z0-9][a-z0-9._-]*\.glb$/i.test(file)) continue;
    const sha256 =
      typeof candidate.sha256 === "string" && /^[0-9a-f]{64}$/i.test(candidate.sha256)
        ? candidate.sha256.toLowerCase()
        : null;
    const bytes = finite(candidate.bytes);
    if (!sha256 || bytes === null || bytes <= 0) continue;
    const heightM = finite(candidate.height_m);
    const skins = parseSkins(candidate.skins);
    const requestedSkin =
      typeof candidate.default_skin === "string" ? candidate.default_skin : null;
    seen.add(id);
    avatars.push({
      id: id as FloorAvatarId,
      file,
      sha256,
      bytes,
      heightM: heightM !== null && heightM >= 0.5 && heightM <= 3 ? heightM : 1.2,
      defaultSkin:
        requestedSkin && requestedSkin in skins ? requestedSkin : (Object.keys(skins)[0] ?? null),
      skins,
    });
  }
  return {
    schema,
    avatars,
    sourceCommit: typeof value.source_commit === "string" ? value.source_commit : null,
    license: typeof value.license === "string" ? value.license : null,
  };
}

const JOINT_PHASE: Record<string, number> = {
  head_turn: 0.4,
  arm_l_swing: 1.7,
  arm_r_swing: 0,
  leg_l_swing: Math.PI,
  leg_r_swing: Math.PI + 1.1,
};

function motionAmount(name: string, busy: boolean): number {
  if (busy) {
    if (name === "arm_r_swing") return 0.95;
    if (name === "arm_l_swing") return 0.35;
    if (name === "head_turn") return 0.3;
    if (name.startsWith("leg_")) return 0.22;
    return 0.2;
  }
  if (name === "head_turn") return 0.25;
  if (name.startsWith("arm_")) return 0.12;
  if (name.startsWith("leg_")) return 0;
  return 0.06;
}

/** A joint angle for the current state, mapped into the range sand3d declared. */
export function jointAngle(
  joint: FloorJoint,
  busy: boolean,
  seconds: number,
  phase: number,
): number {
  const rate = busy ? 7.2 : 1.25;
  const offset = JOINT_PHASE[joint.name] ?? 0;
  const wave = clamp(
    Math.sin(seconds * rate + phase + offset) * motionAmount(joint.name, busy),
    -1,
    1,
  );
  return wave >= 0
    ? clamp(wave * joint.upper, joint.lower, joint.upper)
    : clamp(-wave * joint.lower, joint.lower, joint.upper);
}

/** A tiny vertical bob for the body. Legs stay planted; this is not a walk cycle. */
export function bodyBob(busy: boolean, seconds: number, phase: number): number {
  return (busy ? 0.03 : 0.014) * Math.sin(seconds * (busy ? 5.2 : 1.6) + phase);
}
