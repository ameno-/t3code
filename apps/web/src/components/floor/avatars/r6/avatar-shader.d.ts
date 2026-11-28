import type { FloorAvatarId } from "../floorAvatars.logic";
import type { FloorAvatarRig } from "./rig";

export const KINDS: Record<FloorAvatarId, number>;
export const FRAGMENT: string;
export const VERTEX_THREE: string;

export type FloorAvatarLayout = {
  width: number;
  height: number;
  px: [number, number];
  R: number;
  ctr: [number, number];
  small: number;
};

export function layout(h: number, dpr: number): FloorAvatarLayout;

export type FloorAvatarUniformInput = {
  id: FloorAvatarId;
  skin: [string, string, string];
  accent: string;
  h: number;
  dpr: number;
};

export function uniformValues(
  input: FloorAvatarUniformInput,
  rig: FloorAvatarRig,
): Record<string, number | number[]>;
