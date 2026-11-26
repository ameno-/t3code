import { useEffect, useRef } from "react";

import type { FloorAvatarAssetsState, FloorAvatarWorker } from "./floorAvatars.logic";
import type { FloorAvatarsHandle } from "./floorAvatars.scene";

type FloorAvatarsProps = {
  workers: FloorAvatarWorker[];
  onReady?: () => void;
  onFailure?: () => void;
  onAssets?: (state: FloorAvatarAssetsState) => void;
};

/**
 * The three.js scene lives behind a dynamic import so only the Floor route downloads it.
 * If WebGL or the chunk fails, the caller keeps the flat SVG workers.
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
  workersRef.current = props.workers;
  callbacksRef.current = {
    onReady: props.onReady,
    onFailure: props.onFailure,
    onAssets: props.onAssets,
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let handle: FloorAvatarsHandle | null = null;
    void import("./floorAvatars.scene")
      .then((module) => {
        if (disposed) return;
        try {
          handle = module.mountFloorAvatars(host, workersRef.current, {
            onReady: () => callbacksRef.current.onReady?.(),
            onFailure: () => callbacksRef.current.onFailure?.(),
            onAssets: (state) => callbacksRef.current.onAssets?.(state),
          });
          handleRef.current = handle;
        } catch {
          callbacksRef.current.onFailure?.();
        }
      })
      .catch(() => {
        if (!disposed) callbacksRef.current.onFailure?.();
      });
    return () => {
      disposed = true;
      handle?.dispose();
      handleRef.current = null;
    };
  }, []);

  useEffect(() => {
    handleRef.current?.setWorkers(props.workers);
  }, [props.workers]);

  return <div ref={hostRef} className="nasir-floor-avatar-host" />;
}
