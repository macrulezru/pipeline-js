/**
 * Plugin for PipelineOrchestrator.
 * `install()` receives the orchestrator instance and can subscribe to events,
 * add middleware logic, etc. If it returns a function — it is called on cleanup.
 */
export type PipelinePlugin = {
    /** Unique plugin name */
    name: string;
    /** Installs the plugin. Receives the orchestrator, returns an optional cleanup function. */
    install(orchestrator: any): void | (() => void);
};
