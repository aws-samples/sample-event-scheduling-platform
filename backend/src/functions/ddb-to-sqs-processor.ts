/**
 * This Lambda function processes events from a DynamoDB stream and sends them to an SQS queue.
 * It filters events that are scheduled to start within the next 24 hours, formats the data as needed,
 * and sends the processed event data to the specified SQS queue for further processing.
 */
import { Handler, DynamoDBStreamEvent } from 'aws-lambda';
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

// Initialize SQS client
const client = new SQSClient({});

export const handler: Handler<DynamoDBStreamEvent, void> = async (event) => {
  const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL!;

  for (const record of event.Records) {
    if (record.eventName === 'INSERT') {
      const item = record.dynamodb?.NewImage;

      if (item) {
        console.log(item.event_starts_ts?.S);

        let startTs: number | undefined;

        if (item.event_starts_ts?.S) {
          startTs = new Date(item.event_starts_ts.S).getTime();
        } else {
          console.log("Event start timestamp is missing or invalid");
          continue; // Skip to the next record if the timestamp is missing
        }

        const currentTimestamp = Date.now();

        // Check if the event is planned for less than 24 hours from now
        const timeDiff = startTs - currentTimestamp;
        const hoursDiff = timeDiff / (60 * 60 * 1000);
        console.log(`Hours difference: ${hoursDiff}`);

        if (hoursDiff < 24 && hoursDiff >= 0) {
          try {
            // Convert the DynamoDB item to a plain JavaScript object
            const baseProcessedItem = {
              pk: item.pk.S,
              sk: item.sk.S,
              id: item.id?.S,
              name: item.name?.S,
              additional_notes: item.additional_notes?.S,
              event_starts_ts: item.event_starts_ts?.S,
              event_ends_ts: item.event_ends_ts?.S,
              orchestration_type: item.orchestration_type?.S,
              document_name: item.document_name?.S,
              version_id: item.version_id?.S,
              event_status: item.event_status?.S,
              created: item.created?.S,
              updated: item.updated?.S,
            };

            let processedItem;

            if (item.orchestration_type?.S === 'SSM') {
              // For SSM, format parameters as required by SSM StartAutomationExecution
              const ssmParameters = item.provisioning_parameters?.L?.reduce((acc, param) => {
                if (param.M?.ParameterKey?.S && param.M?.DefaultValue?.S) {
                  acc[param.M.ParameterKey.S] = [param.M.DefaultValue.S];
                }
                return acc;
              }, {} as Record<string, string[]>);

              processedItem = {
                ...baseProcessedItem,
                provisioning_parameters: ssmParameters
              };
            } else {
              // For other types, keep the existing format
              processedItem = {
                ...baseProcessedItem,
                provisioning_parameters: item.provisioning_parameters?.L?.map(param => ({
                  Key: param.M?.ParameterKey.S,
                  Value: param.M?.DefaultValue?.S,
                }))
              };
            }

            const command = new SendMessageCommand({
              QueueUrl: SQS_QUEUE_URL,
              MessageBody: JSON.stringify(processedItem)
            });

            // Send the processed item to SQS
            const response = await client.send(command);

            console.log(`Successfully sent item to SQS: ${JSON.stringify(processedItem)}`, response);
          } catch (error) {
            console.error(`Error sending item to SQS: ${error}`);
          }
        } else {
          console.log(`Event not processed: More than 24 hours until start or event has already started`);
        }
      }
    }
  }
};
