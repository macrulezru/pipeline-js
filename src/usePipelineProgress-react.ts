import { useEffect, useState } from "react";
import type { PipelineOrchestrator } from "./pipeline-orchestrator";
import type { PipelineProgress } from "./types";

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
