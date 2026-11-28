export type FloorAvatarState = "idle" | "talking" | "listening" | "working" | "blink" | "cycle";

export type FloorAvatarRig = {
  gaze: [number, number];
  lid: [number, number, number, number];
  brow: [number, number, number, number, number];
  mouth: [number, number, number, number];
  smirk: number;
  head: [number, number, number, number];
  body: [number, number, number, number];
  pupil: number;
  tail: number;
  arm: number;
};

export function rigAt(state: FloorAvatarState, t: number): FloorAvatarRig;
