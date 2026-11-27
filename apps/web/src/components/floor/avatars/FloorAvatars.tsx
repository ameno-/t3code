import { useEffect, useLayoutEffect, useRef } from "react";

import { mountFloorAvatarLayer } from "./floorAvatars.mount";
import type { FloorAvatarAssetsState, FloorAvatarWorker } from "./floorAvatars.logic";
import type { FloorAvatarsHandle } from "./floorAvatars.scene";

type FloorAvatarsProps = {
  workers: FloorAvatarWorker[];
  onReady?: () => void;
  onFailure?: () => void;
  onAssets?: (state: FloorAvatarAssetsState) => void;
};

/**
 * The r6 shader is the default and lives behind a dynamic import so only the Floor route
 * downloads it. The r3 GLBs cover a shader compile/link failure; without WebGL2 the caller
 * keeps the flat SVG workers.
 */
export function FloorAvatars(props: FloorAvatarsProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<FloorAvatarsHandle | null>(null);
  const workersRef = useRef(props.workers);
  const callbacksRef = useRef({
    onReady: props.onReady,
    onFailure: props.onFailure,
    onAssets: props.onAssets,
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- keeps callback and worker refs current for the imperative scene.
  useLayoutEffect(() => {
    workersRef.current = props.workers;
    callbacksRef.current = {
      onReady: props.onReady,
      onFailure: props.onFailure,
      onAssets: props.onAssets,
    };
  });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- the three.js scene is an imperative resource mounted for the host's lifetime.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let handle: FloorAvatarsHandle | null = null;
    void mountFloorAvatarLayer({
      host,
      workers: workersRef.current,
      options: {
        onReady: () => callbacksRef.current.onReady?.(),
        onFailure: () => callbacksRef.current.onFailure?.(),
        onAssets: (state) => callbacksRef.current.onAssets?.(state),
      },
      loadShader: () => import("./floorAvatars.shader"),
      loadGlb: () => import("./floorAvatars.scene"),
      hasWebGL2,
      isDisposed: () => disposed,
    }).then((mounted) => {
      if (!mounted) return;
      handle = mounted;
      handleRef.current = mounted;
      mounted.setWorkers(workersRef.current);
    });
    return () => {
      disposed = true;
      handle?.dispose();
      handleRef.current = null;
    };
  }, []);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- pushes worker props into the mounted three.js scene.
  useEffect(() => {
    handleRef.current?.setWorkers(props.workers);
  }, [props.workers]);

  return <div ref={hostRef} style={{ position: "absolute", inset: 0 }} />;
}

function hasWebGL2(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return canvas.getContext("webgl2") !== null;
  } catch {
    return false;
  }
}
