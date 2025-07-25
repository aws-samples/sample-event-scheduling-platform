/**
 * This Lambda function queries DynamoDB for events scheduled to start within the next 24 hours
 * and sends those events to an SQS queue for further processing. It acts as a trigger for the
 * orchestration workflow, ensuring that events are processed in a timely manner.
 */
import { Handler } from 'aws-lambda';
import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const dynamoDbClient = new DynamoDBClient({});
const sqsClient = new SQSClient({});

const TABLE_NAME = process.env.TABLE_NAME!;
const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL!;

export const handler: Handler = async () => {
  const now = new Date().toISOString(); // Current timestamp as ISO string
  const next24Hours = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours from now as ISO string

  try {
    // Query DynamoDB for events starting in the next 24 hours
    const queryParams = {
      TableName: TABLE_NAME,
      IndexName: 'sk-pk-index', // Assuming this is the correct index name
      KeyConditionExpression: '#sk = :eventType',
      FilterExpression: '#eventStartsTs BETWEEN :now AND :next24Hours',
      ExpressionAttributeNames: {
        '#sk': 'sk',
        '#eventStartsTs': 'event_starts_ts'
      },
      ExpressionAttributeValues: marshall({
        ':eventType': 'Event', // Sort key (sk) is always 'Event'
        ':now': now, // Current timestamp
        ':next24Hours': next24Hours // Timestamp 24 hours from now
      })
    };

    const queryCommand = new QueryCommand(queryParams);
    const queryResult = await dynamoDbClient.send(queryCommand);

    if (queryResult.Items && queryResult.Items.length > 0) {
      for (const item of queryResult.Items) {
        const unmarshalledItem = unmarshall(item);

        // Send each item to SQS
        const sendMessageCommand = new SendMessageCommand({
          QueueUrl: SQS_QUEUE_URL,
          MessageBody: JSON.stringify(unmarshalledItem)
        });

        await sqsClient.send(sendMessageCommand);
        console.log(`Sent item to SQS: ${JSON.stringify(unmarshalledItem)}`);
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Events processed successfully' }),
    };
  } catch (error) {
    console.error('Error processing events:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Error processing events' }),
    };
  }
};
