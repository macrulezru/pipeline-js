import { useEffect, useState } from "react";
import type { PipelineOrchestrator } from "./pipeline-orchestrator.js";
import type { PipelineProgress } from "./types.js";

/**
 * React hook for subscribing to pipeline progress
 * @param orchestrator PipelineOrchestrator instance
 * @returns PipelineProgress (reactive)
 */
export function usePipelineProgressReact(orchestrator: PipelineOrchestrator) {
  const [progress, setProgress] = useState<PipelineProgress>(
    orchestrator.getProgress()
  );

  useEffect(() => {
    const unsubscribe = orchestrator.subscribeProgress(setProgress);
    return () => unsubscribe();
  }, [orchestrator]);

  return progress;
}
