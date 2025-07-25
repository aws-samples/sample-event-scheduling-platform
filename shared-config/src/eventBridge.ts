export interface EventBridgeConfig {
  sourceStepFunctions: string;
}

export class EventBridgeConfigManager {
  static getConfig(): EventBridgeConfig {
    return {
      sourceStepFunctions: 'com.aws.event-orchestrator.step-functions',
    };
  }
}
