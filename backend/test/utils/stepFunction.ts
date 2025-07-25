import {
  SFNClient,
  ListStateMachinesCommand,
  ListTagsForResourceCommand,
  TagResourceCommand,
  UntagResourceCommand,
} from '@aws-sdk/client-sfn';

import { TEST_CONFIG } from '@test/config';

export const sfnClient = new SFNClient({
  maxAttempts: 3,
  retryMode: 'adaptive',
});

export interface StateMachine {
  arn: string;
  tags: Record<string, string>;
}

export const listAllStateMachines = async (limit: number = TEST_CONFIG.MAX_STATE_MACHINES): Promise<StateMachine[]> => {
  const stateMachines: StateMachine[] = [];
  let nextToken: string | undefined;

  try {
    do {
      const command = new ListStateMachinesCommand({
        maxResults: Math.min(100, limit - stateMachines.length),
        nextToken,
      });
      const response = await sfnClient.send(command);

      stateMachines.push(...(response.stateMachines || []).map((sm) => ({ arn: sm.stateMachineArn!, tags: {} })));
      nextToken = response.nextToken;
    } while (nextToken && stateMachines.length < limit);
  } catch (error) {
    console.error('Error listing state machines:', error);
    throw error;
  }

  return stateMachines.slice(0, limit);
};

export const getStateMachineTags = async (stateMachines: StateMachine[]): Promise<void> => {
  try {
    const batchSize = 20;
    for (let i = 0; i < stateMachines.length; i += batchSize) {
      const batch = stateMachines.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (sm) => {
          const command = new ListTagsForResourceCommand({ resourceArn: sm.arn });
          const response = await sfnClient.send(command);
          sm.tags = Object.fromEntries(response.tags?.map((t) => [t.key!, t.value!]) || []);
        }),
      );
    }
  } catch (error) {
    console.error('Error getting state machine tags:', error);
    throw error;
  }
};

export const tagStateMachines = async (
  stateMachines: StateMachine[],
  tag: { key: string; value: string },
): Promise<string[]> => {
  const taggedArns: string[] = [];
  try {
    const batchSize = 20;
    for (let i = 0; i < stateMachines.length; i += batchSize) {
      const batch = stateMachines.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (sm) => {
          if (!sm.tags[tag.key]) {
            await sfnClient.send(
              new TagResourceCommand({
                resourceArn: sm.arn,
                tags: [tag],
              }),
            );
            taggedArns.push(sm.arn);
            sm.tags[tag.key] = tag.value;
          }
        }),
      );
    }
  } catch (error) {
    console.error('Error tagging state machines:', error);
    throw error;
  }
  return taggedArns;
};

export const untagStateMachines = async (arns: string[], tagKey: string): Promise<void> => {
  try {
    const batchSize = 20;
    for (let i = 0; i < arns.length; i += batchSize) {
      const batch = arns.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (arn) => {
          await sfnClient.send(
            new UntagResourceCommand({
              resourceArn: arn,
              tagKeys: [tagKey],
            }),
          );
        }),
      );
    }
  } catch (error) {
    console.error('Error untagging state machines:', error);
    throw error;
  }
};
