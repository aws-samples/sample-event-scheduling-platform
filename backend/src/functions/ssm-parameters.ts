/**
 * This Lambda function retrieves the parameters for a given AWS Systems Manager (SSM) Document.
 * It interacts with the AWS SSM API to fetch details about each parameter, such as its name, type,
 * description, and default value. This information is essential for properly configuring and executing
 * the SSM Document during provisioning or automation workflows.
 */
import { Handler } from 'aws-lambda';
import { 
  SSMClient, 
  DescribeDocumentCommand,
  DescribeDocumentCommandInput
} from '@aws-sdk/client-ssm';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { CONFIG } from '@utils/config';

const tracer = new Tracer({ serviceName: 'ssm-document-parameters' });

const ssmClient = tracer.captureAWSv3Client(
  new SSMClient({
    maxAttempts: CONFIG.SDK.MAX_ATTEMPTS,
    retryMode: CONFIG.SDK.RETRY_MODE,
  })
);

interface SSMDocumentParameter {
  Name: string;
  Type: string;
  Description?: string;
  DefaultValue?: string;
}

async function getSSMDocumentParameters(documentName: string): Promise<SSMDocumentParameter[]> {
  const input: DescribeDocumentCommandInput = {
    Name: documentName,
  };

  try {
    const command = new DescribeDocumentCommand(input);
    const response = await ssmClient.send(command);

    if (response.Document && response.Document.Parameters) {
      return response.Document.Parameters.map(param => ({
        Name: param.Name || '',
        Type: param.Type || '',
        Description: param.Description,
        DefaultValue: param.DefaultValue,
      }));
    } else {
      return [];
    }
  } catch (error) {
    console.error('Error describing document parameters:', error);
    throw error;
  }
}

export const handler: Handler = async (event) => {
  try {
    const { documentName } = event;

    if (!documentName) {
      throw new Error('Document Name is required');
    }

    const parameters = await getSSMDocumentParameters(documentName);

    return parameters;
  } catch (error) {
    console.error('Error in Lambda handler:', error);
    throw error;
  }
}
