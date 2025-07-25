import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';
import { IStepFunctions } from '@constructs/step-function-construct';

interface MonitoringStackProps extends cdk.StackProps {
  applicationName: string;
  stepFunctions: IStepFunctions;
  logGroups: IcloudwatchLogGroups;
}

class MonitoringStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);
    new StepFunctionsDashboard(this, 'StepFunctionsDashboard', {
      applicationName: props.applicationName,
      stepFunctions: props.stepFunctions,
    });
    new EventBridgeDashboard(this, 'EventBridgeDashboard', {
      applicationName: props.applicationName,
      logGroups: props.logGroups,
    }); // Add other dashboards as needed
  }
}

// ServiceDashboard
interface ServiceDashboardProps {
  applicationName: string;
}

abstract class ServiceDashboard extends Construct {
  protected dashboard: cloudwatch.Dashboard;
  protected applicationName: string;

  constructor(scope: Construct, id: string, props: ServiceDashboardProps) {
    super(scope, id);
    this.applicationName = props.applicationName;
    this.dashboard = new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName: `${props.applicationName}-${this.constructor.name}`,
    });
  }
}

interface IcloudwatchLogGroups {
  [key: string]: cdk.aws_logs.LogGroup;
}

// Event Bridge Dashboard
interface EventBridgeDashboardProps extends ServiceDashboardProps {
  logGroups: IcloudwatchLogGroups;
}

class EventBridgeDashboard extends ServiceDashboard {
  private logGroups: IcloudwatchLogGroups;
  constructor(scope: Construct, id: string, props: EventBridgeDashboardProps) {
    super(scope, id, props);
    this.logGroups = props.logGroups;
    this.createDashboardWidgets();
  }
  private createDashboardWidgets(): void {
    if (this.logGroups) {
      Object.entries(this.logGroups).forEach(([key, logGroup]) => {
        const logWidget = new cloudwatch.LogQueryWidget({
          title: `Latest Logs for ${key}`,
          logGroupNames: [logGroup.logGroupName],
          view: cloudwatch.LogQueryVisualizationType.TABLE,
          queryLines: ['fields @timestamp, @message', 'sort @timestamp desc', 'limit 20'],
          width: 24,
          height: 12,
        });
        this.dashboard.addWidgets(logWidget);
      });
    }
  }
}

// Step Functions Dashboard
interface StepFunctionsDashboardProps extends ServiceDashboardProps {
  stepFunctions: IStepFunctions;
}

class StepFunctionsDashboard extends ServiceDashboard {
  private stepFunctions: IStepFunctions;

  constructor(scope: Construct, id: string, props: StepFunctionsDashboardProps) {
    super(scope, id, props);
    this.stepFunctions = props.stepFunctions;
    this.createDashboardWidgets();
  }

  private createDashboardWidgets(): void {
    // Add a null check before using Object.entries
    if (this.stepFunctions) {
      Object.entries(this.stepFunctions).forEach(([key, stepFunction]) => {
        new StepFunctionMetrics(this, `StepFunctionMetrics-${key}`, {
          stepFunction: stepFunction,
          name: key,
          dashboard: this.dashboard,
        });
      });
    }
  }
}

interface StepFunctionMetricsProps {
  stepFunction: stepfunctions.IStateMachine;
  name: string;
  dashboard: cloudwatch.Dashboard;
}

class StepFunctionMetrics extends Construct {
  private WIDGET_WIDTH: number = 10;
  private WIDGET_HEIGHT: number = 12;

  constructor(scope: Construct, id: string, props: StepFunctionMetricsProps) {
    super(scope, id);

    const { stepFunction, name, dashboard } = props;

    // Extract the name from the ARN
    const failedExecutionsAlarm = new cloudwatch.Alarm(this, 'FailedExecutionsAlarm', {
      metric: stepFunction.metricFailed({
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      evaluationPeriods: 1,
      threshold: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      alarmDescription: `Alarm if any execution fails for ${name}`,
    });

    const widgets = [
      new cloudwatch.GraphWidget({
        title: `${name} - Executions`,
        width: this.WIDGET_WIDTH,
        height: this.WIDGET_HEIGHT,
        left: [
          stepFunction.metricStarted({ statistic: 'Sum', period: cdk.Duration.minutes(5) }),
          stepFunction.metricSucceeded({ statistic: 'Sum', period: cdk.Duration.minutes(5) }),
          stepFunction.metricFailed({ statistic: 'Sum', period: cdk.Duration.minutes(5) }),
        ],
      }),
      new cloudwatch.GraphWidget({
        title: `${name} - Execution Time`,
        width: this.WIDGET_WIDTH,
        height: this.WIDGET_HEIGHT,
        left: [stepFunction.metricTime({ statistic: 'Average', period: cdk.Duration.minutes(5) })],
      }),
      new cloudwatch.AlarmStatusWidget({
        title: `${name} - Failed Executions Alarm`,
        width: 2,
        height: this.WIDGET_HEIGHT,
        alarms: [failedExecutionsAlarm],
      }),
    ];

    dashboard.addWidgets(...widgets);
  }

  private extractNameFromArn(arn: string): string {
    const parts = arn.split(':');
    return parts[parts.length - 1];
  }
}

export { MonitoringStack, MonitoringStackProps };
