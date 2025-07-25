import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { NagSuppressions } from 'cdk-nag';
/**
 * Properties for the UserInterfaceStack.
 */
interface UserInterfaceStackProps extends cdk.StackProps {
  /** Optional. The domain name for the website. */
  domainName?: string;
  /** Optional. The hosted zone ID for the domain. */
  hostedZoneId?: string;
}

/**
 * A CDK stack that sets up the infrastructure for the web application user interface.
 * This includes S3 for hosting, CloudFront for content delivery, S3 bucket to host the code
 * and optionally Route53 for custom domain management.
 * Inspired by https://aws.amazon.com/graphql/guide111112/
 * and https://aws.amazon.com/graphql/guide11111/
 */
export class UserInterfaceStack extends cdk.Stack {
  public readonly distribution: cloudfront.Distribution;

  public readonly websiteBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: UserInterfaceStackProps) {
    super(scope, id, props);

    const { websiteBucket, distribution } = this.createWebsiteInfrastructure(props);
    this.distribution = distribution;
    this.websiteBucket = websiteBucket;

    this.deployWebsiteContent(websiteBucket);

    this.addOutputs();
  }

  private createWebsiteInfrastructure(props: UserInterfaceStackProps) {
    const logBucket = new s3.Bucket(this, 'LogBucket', {
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
  
    const websiteBucket = new s3.Bucket(this, 'WebsiteBucket', {
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      serverAccessLogsBucket: logBucket,
      serverAccessLogsPrefix: 'website-logs/',
    });
    const oac = new cloudfront.S3OriginAccessControl(this, 'OAC', {
      description: 'OAC for S3 bucket access',
    });
    
    websiteBucket.addToResourcePolicy(new cdk.aws_iam.PolicyStatement({
      effect: cdk.aws_iam.Effect.ALLOW,
      principals: [new cdk.aws_iam.ServicePrincipal('cloudfront.amazonaws.com')],
      actions: ['s3:GetObject'],
      resources: [`${websiteBucket.bucketArn}/*`],
      conditions: {
        StringEquals: {
          'AWS:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/*`,
        },
      },
    }));

    const cloudfrontLogBucket = new s3.Bucket(this, 'CloudFrontLogBucket', {
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      serverAccessLogsBucket: logBucket,
      serverAccessLogsPrefix: 'cloudfront-logs/',
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
    });

    let distributionProps: cloudfront.DistributionProps = {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(websiteBucket, {
          originAccessControl: oac,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      logBucket: cloudfrontLogBucket,
      logFilePrefix: 'cloudfront-logs/',
    };

    let hostedZone: route53.IHostedZone | undefined;

    // Set up custom domain if domainName and hostedZoneId are provided
    if (props.domainName && props.hostedZoneId) {
      const { certificate, zone } = this.createCertificateAndHostedZone(props);
      distributionProps = {
        ...distributionProps,
        domainNames: [props.domainName],
        certificate: certificate,
      };
      hostedZone = zone;
    }

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      ...distributionProps,
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(30),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(30),
        },
      ],
    });

    NagSuppressions.addResourceSuppressions(distribution, [
      { id: 'AwsSolutions-CFR2', reason: 'WAF is deployed on the GlobalStack us-east-1 per default' },
    ]);

    // Create Route53 record for custom domain
    if (hostedZone && props.domainName) {
      new route53.ARecord(this, 'SiteAliasRecord', {
        recordName: props.domainName,
        target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.distribution)),
        zone: hostedZone,
      });
    }

    return { websiteBucket, distribution };
  }

  private createCertificateAndHostedZone(props: UserInterfaceStackProps) {
    const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId: props.hostedZoneId!,
      zoneName: props.domainName!,
    });

    const certificate = new acm.Certificate(this, 'SiteCertificate', {
      domainName: props.domainName!,
      validation: acm.CertificateValidation.fromDns(zone),
    });

    return { certificate, zone };
  }

  private deployWebsiteContent(websiteBucket: s3.Bucket) {
    new s3deploy.BucketDeployment(this, 'DeployWebsite', {
      sources: [s3deploy.Source.asset('../frontend/dist/')],
      destinationBucket: websiteBucket,
      distribution: this.distribution,
      distributionPaths: ['/*'],
    });
  }


  private addOutputs() {
    new cdk.CfnOutput(this, 'DistributionUrl', {
      value: `https://${this.distribution.distributionDomainName}`,
      description: 'Website URL',
    });
    new cdk.CfnOutput(this, 'DistributionId', {
      value: this.distribution.distributionId,
      description: 'Cloudfront Distribution Id',
    });
    new cdk.CfnOutput(this, 'S3BucketName', {
      value: this.websiteBucket.bucketName,
      description: 'S3 Bucket Name',
    });
  }
}
