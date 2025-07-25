import { Construct } from 'constructs';
import { Names } from 'aws-cdk-lib';
import { ApplicationConfigManager } from 'shared-config';
const applicationConfig = ApplicationConfigManager.getConfig();

export function suffix(construct: Construct, maxLength: number = 5): string {
  const uniqueName = Names.uniqueResourceName(construct, {
    maxLength: maxLength,
    separator: '-',
  });

  return uniqueName.split('-').pop() || '';
}

export function logGroupName(construct: Construct, name: string): string {
  return `${applicationConfig.cwLogGroupeNamePrefix}/${name}-${suffix(construct)}`;
}

export function sfnLogGroupName(construct: Construct, name: string): string {
  return `/aws/vendedlogs/states/${applicationConfig.kebakCase}-${name}-${suffix(construct)}`;
}
