import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { SNSClient, PublishCommand, PublishCommandOutput } from '@aws-sdk/client-sns';
import { EventBridgeConfigManager } from 'shared-config';
import { TEST_CONFIG } from '@test/config';

const eventBridgeConfig = EventBridgeConfigManager.getConfig();

function getCurrentDateTime(): string {
  const now = new Date();
  return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
}

describe('Status message Integration Test', () => {
  it('should send a message to the chatbot SNS Topic that route to AWS Chatbot', async () => {
    const snsTopicArn = process.env.SNS_ARN;
    expect(snsTopicArn).toBeDefined();
    const message = {
      version: '1.0',
      source: 'custom',
      content: {
        title: 'Integration test',
        description: `Message sends from the SNS Topic at ${getCurrentDateTime()}`,
      },
    };

    const params = {
      Message: JSON.stringify(message),
      TopicArn: snsTopicArn,
    };

    const client = new SNSClient();

    const command = new PublishCommand(params);

    try {
      const result: PublishCommandOutput = await client.send(command);

      expect(result.MessageId).toBeDefined();
      console.log('Message sent successfully:', result.MessageId);
    } catch (error) {
      console.error('Failed to send message:', error);
      throw error;
    }
  }, 10000); // Increase timeout to 10 seconds for network request

  it(
    'should send a status message to EventBridge which route to AWS Chatbot',
    async () => {
      const eventBusName = process.env.EVENT_BUS_NAME;
      expect(eventBusName).toBeDefined();
      console.log(`Event Bus name: ${eventBusName}`);
      const message = {
        status: 'ERROR',
        title: 'Integration Test',
        description: `Message sends from Event Bridge at ${getCurrentDateTime()}`,
        source: 'Step Functions : Create Live Workflow',
      };

      const params = {
        Entries: [
          {
            Source: eventBridgeConfig.sourceStepFunctions,
            DetailType: 'Status Notification',
            Detail: JSON.stringify(message),
            EventBusName: eventBusName,
          },
        ],
      };

      const client = new EventBridgeClient();

      const command = new PutEventsCommand(params);

      try {
        const result = await client.send(command);
        if (result.Entries && result.Entries.length > 0) {
          expect(result.Entries).toHaveLength(1);
          expect(result.Entries[0]?.EventId).toBeDefined();
          console.log('Event Bridge event sent successfully:', result.Entries[0].EventId);
        } else {
          throw new Error('No entries returned in the result');
        }
      } catch (error) {
        console.error('Failed to send event:', error);
        throw error;
      }
    },
    TEST_CONFIG.TIMEOUT.EVENT_BRIDGE,
  );
});
