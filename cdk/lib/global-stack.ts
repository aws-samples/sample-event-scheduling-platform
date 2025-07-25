import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import { WafwebaclToCloudFront } from '@aws-solutions-constructs/aws-wafwebacl-cloudfront';

interface GlobalStackProps extends cdk.StackProps {
  distribution: cloudfront.Distribution;
}

export class GlobalStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: GlobalStackProps) {
    super(scope, id, props);

    // WAF for Website
    new WafwebaclToCloudFront(this, 'waf-cloudfront', {
      existingCloudFrontWebDistribution: props.distribution,
    });

    // @todo: add WAF for AppSync
  }
}
