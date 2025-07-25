import {
  SSMClient,
  ListDocumentsCommand,
  CreateDocumentCommand,
  DeleteDocumentCommand,
  AddTagsToResourceCommand,
  RemoveTagsFromResourceCommand,
} from '@aws-sdk/client-ssm';

import { TEST_CONFIG } from '@test/config';

export const ssmClient = new SSMClient({
  maxAttempts: 3,
  retryMode: 'adaptive',
});

export interface SSMDocument {
  name: string;
  tags: Record<string, string>;
}

export const listAllSSMDocuments = async (limit: number = TEST_CONFIG.MAX_SSM_DOCUMENTS): Promise<SSMDocument[]> => {
  const documents: SSMDocument[] = [];
  let nextToken: string | undefined;

  try {
    do {
      const command = new ListDocumentsCommand({
        MaxResults: Math.min(50, limit - documents.length),
        NextToken: nextToken,
        Filters: [{ Key: 'DocumentType', Values: ['Automation'] }],
      });
      const response = await ssmClient.send(command);

      documents.push(...(response.DocumentIdentifiers || []).map((doc) => ({ name: doc.Name!, tags: {} })));
      nextToken = response.NextToken;
    } while (nextToken && documents.length < limit);
  } catch (error) {
    console.error('Error listing SSM documents:', error);
    throw error;
  }

  return documents.slice(0, limit);
};

export const createSSMDocument = async (name: string): Promise<void> => {
  try {
    await ssmClient.send(
      new CreateDocumentCommand({
        Name: name,
        Content: JSON.stringify({
          schemaVersion: '0.3',
          description: 'Test Automation Document',
          assumeRole: '{{AutomationAssumeRole}}',
          parameters: {},
          mainSteps: [
            {
              name: 'testStep',
              action: 'aws:executeAwsApi',
              inputs: {
                Service: 'ssm',
                Api: 'DescribeDocument',
                Name: '{{DOCUMENT_NAME}}',
              },
            },
          ],
        }),
        DocumentType: 'Automation',
        DocumentFormat: 'JSON',
      }),
    );
  } catch (error) {
    console.error('Error creating SSM document:', error);
    throw error;
  }
};

export const tagSSMDocuments = async (
  documents: SSMDocument[],
  tag: { key: string; value: string },
): Promise<string[]> => {
  const taggedNames: string[] = [];
  try {
    for (const doc of documents) {
      if (!doc.tags[tag.key]) {
        await ssmClient.send(
          new AddTagsToResourceCommand({
            ResourceType: 'Document',
            ResourceId: doc.name,
            Tags: [{ Key: tag.key, Value: tag.value }],
          }),
        );
        taggedNames.push(doc.name);
        doc.tags[tag.key] = tag.value;
      }
    }
  } catch (error) {
    console.error('Error tagging SSM documents:', error);
    throw error;
  }
  return taggedNames;
};

export const untagSSMDocuments = async (names: string[], tagKey: string): Promise<void> => {
  try {
    for (const name of names) {
      await ssmClient.send(
        new RemoveTagsFromResourceCommand({
          ResourceType: 'Document',
          ResourceId: name,
          TagKeys: [tagKey],
        }),
      );
    }
  } catch (error) {
    console.error('Error untagging SSM documents:', error);
    throw error;
  }
};

export const deleteSSMDocuments = async (names: string[]): Promise<void> => {
  const failedDeletions: string[] = [];
  for (const name of names) {
    try {
      await ssmClient.send(new DeleteDocumentCommand({ Name: name }));
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.name === 'InvalidDocument' && error.message.includes('Cannot delete Amazon-owned document')) {
          console.warn(`Skipping deletion of Amazon-owned document: ${name}`);
        } else {
          console.error(`Error deleting SSM document ${name}:`, error);
          failedDeletions.push(name);
        }
      } else {
        console.error(`Unknown error deleting SSM document ${name}:`, error);
        failedDeletions.push(name);
      }
    }
  }
  if (failedDeletions.length > 0) {
    console.error(`Failed to delete the following SSM documents: ${failedDeletions.join(', ')}`);
  }
};
