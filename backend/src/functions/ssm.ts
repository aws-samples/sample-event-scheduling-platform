/**
 * This module contains two Lambda functions related to AWS Systems Manager (SSM) Documents:
 *
 * 1. The 'handler' function retrieves detailed information about a SPECIFIC SSM Document, including
 *    its description, parameters, required permissions, and other metadata.
 *
 * 2. The 'handlerSsm' function discovers ALL SSM Documents tagged with a specific key-value pair
 *    and returns a list of their names.
 *
 * Both functions interact with the AWS SSM API to retrieve and process document data.
 */
import { Handler } from 'aws-lambda';
import {
  SSMClient,
  DescribeDocumentCommand,
  DescribeDocumentCommandOutput,
  DocumentRequires,
  DocumentParameter,
} from '@aws-sdk/client-ssm';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { CONFIG } from '@utils/config';
import { discoverSSMDocuments } from '@utils/discovery';
import { ApplicationConfigManager } from 'shared-config';

const tracer = new Tracer({ serviceName: 'discovery' });

const ssmClient = tracer.captureAWSv3Client(
  new SSMClient({
    maxAttempts: CONFIG.SDK.MAX_ATTEMPTS,
    retryMode: CONFIG.SDK.RETRY_MODE,
  }),
);

interface SSMDocumentDetails {
  Description?: string;
  DisplayName?: string;
  Name?: string;
  Parameters?: DocumentParameter[];
  Requires?: DocumentRequires[];
  Status?: string;
  StatusInformation?: string;
  VersionName?: string;
}

async function getDocumentDetails(name: string): Promise<SSMDocumentDetails> {
  const input = {
    Name: name,
  };

  try {
    const command = new DescribeDocumentCommand(input);
    const response: DescribeDocumentCommandOutput = await ssmClient.send(command);

    if (response.Document) {
      const { Description, DisplayName, Name, Parameters, Requires, Status, StatusInformation, VersionName } =
        response.Document;

      return {
        Description,
        DisplayName,
        Name,
        Parameters,
        Requires,
        Status,
        StatusInformation,
        VersionName,
      };
    } else {
      throw new Error('Document not found');
    }
  } catch (error) {
    console.error('Error describing document:', error);
    throw error;
  }
}

export const handler: Handler = async (event) => {
  try {
    const documentName = event.documentName; // Assuming the documentName is passed in the event

    if (!documentName) {
      throw new Error('Document name is required');
    }

    const documentDetails = await getDocumentDetails(documentName);

    return {
      statusCode: 200,
      body: JSON.stringify(documentDetails),
    };
  } catch (error) {
    console.error('Error getting SSM document details:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: (error as Error).message }),
    };
  }
};

export const handlerSsm: Handler = async () => {
  try {
    const applicationConfig = ApplicationConfigManager.getConfig();
    const tagKey = applicationConfig.tagKey;
    const tagValue = applicationConfig.tagValue;

    const documents = (await discoverSSMDocuments(tagKey, tagValue)) || [] ;

    // Ensure documents is a plain array of strings
    console.log(`Discovered ${documents.length} SSM documents with tag ${tagKey}=${tagValue}`);
    console.log('Document data:', documents);
    console.log(JSON.stringify(documents))

    return documents; // Return the array of document names directly
  } catch (error) {
    console.error('Error discovering SSM documents:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: (error as Error).message }),
    };
  }
};
