import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import {
  ChatbotClient,
  DescribeSlackChannelConfigurationsCommand,
  UpdateSlackChannelConfigurationCommand,
  DescribeChimeWebhookConfigurationsCommand,
  UpdateChimeWebhookConfigurationCommand,
  SlackChannelConfiguration,
  ChimeWebhookConfiguration,
} from '@aws-sdk/client-chatbot';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

async function getSnsTopic(stackName: string): Promise<string> {
  const cfClient = new CloudFormationClient({});
  const command = new DescribeStacksCommand({ StackName: stackName });

  try {
    const response = await cfClient.send(command);
    const output = response.Stacks?.[0].Outputs?.find((o) => o.OutputKey === 'BotSNStopicArn');
    if (!output?.OutputValue) {
      throw new Error('SNS Topic ARN not found in CloudFormation stack outputs');
    }
    return output.OutputValue;
  } catch (error) {
    console.error('Error fetching SNS Topic ARN:', error);
    throw error;
  }
}

async function updateSlackConfig(configName: string, snsTopicArn: string): Promise<void> {
  const chatbotClient = new ChatbotClient({
    region: 'eu-west-1', // Global service with endpoint only available in eu-west-1
  });

  try {
    const describeCommand = new DescribeSlackChannelConfigurationsCommand({});
    const describeResponse = await chatbotClient.send(describeCommand);

    const config = describeResponse.SlackChannelConfigurations?.find(
      (c: SlackChannelConfiguration) => c.ConfigurationName === configName,
    );
    if (!config) {
      throw new Error(`No Slack configuration found with name ${configName}`);
    }

    const updateCommand = new UpdateSlackChannelConfigurationCommand({
      ChatConfigurationArn: config.ChatConfigurationArn,
      SlackChannelId: config.SlackChannelId,
      SnsTopicArns: [snsTopicArn],
    });

    await chatbotClient.send(updateCommand);
    console.log(`Successfully updated Slack configuration ${configName} with SNS topic ${snsTopicArn}`);
  } catch (error) {
    console.error('Error updating Slack configuration:', error);
    throw error;
  }
}

async function updateChimeConfig(configName: string, snsTopicArn: string): Promise<void> {
  const chatbotClient = new ChatbotClient({
    region: 'eu-west-1', // Global service with endpoint only available in eu-west-1
  });

  try {
    const describeCommand = new DescribeChimeWebhookConfigurationsCommand({});
    const describeResponse = await chatbotClient.send(describeCommand);

    const config = describeResponse.WebhookConfigurations?.find(
      (c: ChimeWebhookConfiguration) => c.ConfigurationName === configName,
    );
    if (!config) {
      throw new Error(`No Chime configuration found with name ${configName}`);
    }

    const updateCommand = new UpdateChimeWebhookConfigurationCommand({
      ChatConfigurationArn: config.ChatConfigurationArn,
      SnsTopicArns: [snsTopicArn],
    });

    await chatbotClient.send(updateCommand);
    console.log(`Successfully updated Chime configuration ${configName} with SNS topic ${snsTopicArn}`);
  } catch (error) {
    console.error('Error updating Chime configuration:', error);
    throw error;
  }
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option('config-name', {
      alias: 'c',
      type: 'string',
      description: 'Name of the configuration to update',
      demandOption: true,
    })
    .option('stack-name', {
      alias: 's',
      type: 'string',
      description: 'Name of the CloudFormation stack containing the SNS topic',
      default: 'EventOrchestrator-EventBusStack',
    })
    .option('type', {
      alias: 't',
      type: 'string',
      choices: ['slack', 'chime'],
      description: 'Type of configuration to update',
      demandOption: true,
    })
    .parse();

  try {
    const snsTopicArn = await getSnsTopic(argv.stackName);
    if (argv.type === 'slack') {
      await updateSlackConfig(argv.configName, snsTopicArn);
    } else if (argv.type === 'chime') {
      await updateChimeConfig(argv.configName, snsTopicArn);
    }
  } catch (error) {
    console.error('An error occurred:', error);
    process.exit(1);
  }
}

main();
