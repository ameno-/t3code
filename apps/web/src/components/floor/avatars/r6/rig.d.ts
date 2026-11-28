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

export const CYCLE_LEN: number;
export function rigAt(state: FloorAvatarState, t: number): FloorAvatarRig;
export function stateAt(state: FloorAvatarState, t: number): FloorAvatarState;
export function seat(k: number): number;
