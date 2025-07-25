/**
 * This Lambda function retrieves a list of versions for a given AWS Systems Manager (SSM) Document.
 * It interacts with the AWS SSM API to fetch details about each version, such as the version number,
 * creation date, and whether it is the default version. This information can be useful for managing
 * and deploying SSM Documents.
 */
import { Handler } from 'aws-lambda';
import { 
  SSMClient, 
  ListDocumentVersionsCommand,
  ListDocumentVersionsCommandInput
} from '@aws-sdk/client-ssm';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { CONFIG } from '@utils/config';

const tracer = new Tracer({ serviceName: 'ssm-document-versions' });

const ssmClient = tracer.captureAWSv3Client(
  new SSMClient({
    maxAttempts: CONFIG.SDK.MAX_ATTEMPTS,
    retryMode: CONFIG.SDK.RETRY_MODE,
  })
);

interface SSMDocumentVersion {
  Name: string;
  DocumentVersion: string;
  CreatedDate: Date;
  IsDefaultVersion: boolean;
}

async function getSSMDocumentVersions(documentName: string): Promise<SSMDocumentVersion[]> {
  const input: ListDocumentVersionsCommandInput = {
    Name: documentName,
  };

  try {
    const command = new ListDocumentVersionsCommand(input);
    const response = await ssmClient.send(command);

    if (response.DocumentVersions) {
      return response.DocumentVersions.map(version => ({
        Name: version.Name || '',
        DocumentVersion: version.DocumentVersion || '',
        CreatedDate: version.CreatedDate || new Date(),
        IsDefaultVersion: version.IsDefaultVersion || false,
      }));
    } else {
      return [];
    }
  } catch (error) {
    console.error('Error listing document versions:', error);
    throw error;
  }
}

export const handler: Handler = async (event) => {
  try {
    const { documentName } = event;

    if (!documentName) {
      throw new Error('Document Name is required');
    }

    const versions = await getSSMDocumentVersions(documentName);

    return versions;
  } catch (error) {
    console.error('Error in Lambda handler:', error);
    throw error;
  }
}
