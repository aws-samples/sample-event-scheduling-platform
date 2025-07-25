export interface ApplicationConfig {
  name: string;
  camelCase: string;
  kebakCase: string;
  cwLogGroupeNamePrefix: string;
  tagValue: string;
  tagKey: string;
}

export class ApplicationConfigManager {
  static getConfig(): ApplicationConfig {
    return {
      name: 'Event Scheduling Platform',
      camelCase: 'EventScheduling',
      kebakCase: 'event-scheduling',
      cwLogGroupeNamePrefix: '/aws/event-scheduling',
      tagValue: 'event-scheduling-platform',
      tagKey: 'application',
    };
  }
}
