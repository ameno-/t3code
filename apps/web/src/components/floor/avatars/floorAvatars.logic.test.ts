import { describe, expect, it } from "vite-plus/test";

import {
  bodyBob,
  isAnimatedFloorJoint,
  jointAngle,
  parseFloorAvatarManifest,
  parseSand3dJoint,
  type FloorJoint,
} from "./floorAvatars.logic";

const sha = "a".repeat(64);

describe("parseFloorAvatarManifest", () => {
  it("reads the media-pieces manifest shape", () => {
    const manifest = parseFloorAvatarManifest({
      schema: "floor-avatars/1",
      source_commit: "abc123",
      license: "Apache-2.0",
      avatars: [
        {
          id: "nasir",
          file: "nasir.glb",
          sha256: sha,
          bytes: 120_000,
          triangles: 9_000,
          height_m: 1.2,
          accent: "#45707e",
          joints: [],
        },
      ],
    });
    expect(manifest).toEqual({
      schema: "floor-avatars/1",
      sourceCommit: "abc123",
      license: "Apache-2.0",
      avatars: [{ id: "nasir", file: "nasir.glb", sha256: sha, bytes: 120_000, heightM: 1.2 }],
    });
  });

  it("accepts a later schema with skins, which the renderer does not apply yet", () => {
    const manifest = parseFloorAvatarManifest({
      schema: "floor-avatars/2",
      avatars: [
        {
          id: "nasir",
          file: "nasir.glb",
          sha256: sha,
          bytes: 1,
          skins: { default: { skin_base: { color: "#45707e", roughness: 0.8 } } },
        },
      ],
    });
    expect(manifest?.schema).toBe("floor-avatars/2");
    expect(manifest?.avatars.map((avatar) => avatar.id)).toEqual(["nasir"]);
  });

  it("keeps an empty manifest valid so the placeholder stays", () => {
    expect(parseFloorAvatarManifest({ schema: "floor-avatars/1", avatars: [] })).toMatchObject({
      avatars: [],
    });
  });

  it("rejects the wrong schema or a missing avatars array", () => {
    expect(parseFloorAvatarManifest({ schema: "floor-avatars/3", avatars: [] })).toBeNull();
    expect(parseFloorAvatarManifest({ schema: "floor-avatars/1" })).toBeNull();
    expect(parseFloorAvatarManifest(null)).toBeNull();
  });

  it("skips entries that are not safe, complete files", () => {
    const manifest = parseFloorAvatarManifest({
      schema: "floor-avatars/1",
      avatars: [
        { id: "nasir", file: "nasir.glb", sha256: sha, bytes: 1 },
        { id: "baashe", file: "../baashe.glb", sha256: sha, bytes: 1 },
        { id: "faris", file: "faris.glb", sha256: "nope", bytes: 1 },
        { id: "qasim", file: "qasim.glb", sha256: sha, bytes: 0 },
        { id: "unknown", file: "unknown.glb", sha256: sha, bytes: 1 },
        { id: "nasir", file: "nasir-again.glb", sha256: sha, bytes: 1 },
      ],
    });
    expect(manifest?.avatars.map((avatar) => avatar.id)).toEqual(["nasir"]);
  });

  it("falls back to 1.2 m when height_m is missing or implausible", () => {
    const manifest = parseFloorAvatarManifest({
      schema: "floor-avatars/1",
      avatars: [
        { id: "nasir", file: "nasir.glb", sha256: sha, bytes: 1 },
        { id: "baashe", file: "baashe.glb", sha256: sha, bytes: 1, height_m: 9 },
      ],
    });
    expect(manifest?.avatars.map((avatar) => avatar.heightM)).toEqual([1.2, 1.2]);
  });
});

describe("parseSand3dJoint", () => {
  it("reads sand3d's extras and normalizes the axis", () => {
    expect(
      parseSand3dJoint({
        s3d_joint: {
          name: "arm_r_swing",
          type: "revolute",
          axis: [0, 2, 0],
          lower: -0.4,
          upper: 1.1,
        },
      }),
    ).toEqual({ name: "arm_r_swing", kind: "revolute", axis: [0, 1, 0], lower: -0.4, upper: 1.1 });
  });

  it("accepts the direction strings a manifest may use", () => {
    expect(parseSand3dJoint({ s3d_joint: { name: "head_turn", axis: "-Z" } })).toMatchObject({
      axis: [0, 0, -1],
    });
  });

  it("gives a continuous joint a symmetric range when sand3d omits one", () => {
    const joint = parseSand3dJoint({
      s3d_joint: { name: "wheel", type: "continuous", axis: "+X" },
    });
    expect(joint?.lower).toBeCloseTo(-Math.PI);
    expect(joint?.upper).toBeCloseTo(Math.PI);
  });

  it("rejects joints the Floor cannot rotate", () => {
    expect(
      parseSand3dJoint({ s3d_joint: { name: "drawer", type: "prismatic", axis: "+X" } }),
    ).toBeNull();
    expect(parseSand3dJoint({ s3d_joint: { name: "arm", type: "revolute" } })).toBeNull();
    expect(parseSand3dJoint({})).toBeNull();
    expect(parseSand3dJoint({ s3d_joint: { axis: [1, 0, 0] } })).toBeNull();
  });

  it("clamps a stray range to the rotatable half-turn", () => {
    const joint = parseSand3dJoint({
      s3d_joint: { name: "arm_l_swing", type: "revolute", axis: [1, 0, 0], lower: -9, upper: 9 },
    });
    expect(joint?.lower).toBeCloseTo(-Math.PI);
    expect(joint?.upper).toBeCloseTo(Math.PI);
  });
});

describe("jointAngle", () => {
  const arm: FloorJoint = {
    name: "arm_r_swing",
    kind: "revolute",
    axis: [1, 0, 0],
    lower: -0.5,
    upper: 1.2,
  };

  it("uses the full asymmetric range on both sides", () => {
    const rate = 7.2;
    const forward = jointAngle(arm, true, Math.PI / (2 * rate), 0);
    const backward = jointAngle(arm, true, (3 * Math.PI) / (2 * rate), 0);
    expect(forward).toBeCloseTo(0.95 * 1.2);
    expect(backward).toBeCloseTo(-0.95 * 0.5);
  });

  it("never leaves the declared range", () => {
    for (let step = 0; step < 200; step += 1) {
      const angle = jointAngle(arm, step % 2 === 0, step / 7, step);
      expect(angle).toBeGreaterThanOrEqual(arm.lower);
      expect(angle).toBeLessThanOrEqual(arm.upper);
    }
  });

  it("respects a one-sided range", () => {
    const upOnly: FloorJoint = {
      name: "arm_r_swing",
      kind: "revolute",
      axis: [1, 0, 0],
      lower: 0,
      upper: 0.8,
    };
    const downOnly: FloorJoint = {
      name: "arm_r_swing",
      kind: "revolute",
      axis: [1, 0, 0],
      lower: -0.8,
      upper: 0,
    };
    expect(jointAngle(upOnly, true, (3 * Math.PI) / (2 * 7.2), 0)).toBe(0);
    expect(jointAngle(downOnly, true, Math.PI / (2 * 7.2), 0)).toBe(0);
  });
});

describe("isAnimatedFloorJoint", () => {
  it("drives the body and limbs but leaves the face joints at rest", () => {
    for (const name of ["head_turn", "arm_l_swing", "arm_r_swing", "leg_l_swing", "leg_r_swing"]) {
      expect(isAnimatedFloorJoint(name)).toBe(true);
    }
    for (const name of ["brow_l_tilt", "brow_r_tilt", "lid_l_blink", "lid_r_blink"]) {
      expect(isAnimatedFloorJoint(name)).toBe(false);
    }
  });
});

describe("bodyBob", () => {
  it("bobs harder while working than while idle", () => {
    const idle = Math.abs(bodyBob(false, Math.PI / (2 * 1.6), 0));
    const busy = Math.abs(bodyBob(true, Math.PI / (2 * 5.2), 0));
    expect(busy).toBeGreaterThan(idle);
  });
});
