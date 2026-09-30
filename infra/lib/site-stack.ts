import path from "node:path";
import { fileURLToPath } from "node:url";

import * as cdk from "aws-cdk-lib";
import * as budgets from "aws-cdk-lib/aws-budgets";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import type { Construct } from "constructs";

export interface HuddleSiteStackProps extends cdk.StackProps {
  /** GitHub repository (owner/name) allowed to assume the deploy roles from main. */
  readonly repo: string;
  /** Optional email for the monthly budget alarm. */
  readonly budgetEmail?: string;
}

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Static site: private S3 bucket behind CloudFront with Origin Access Control, a clean-URL
 * viewer-request function, security headers, a short-TTL behaviour for job-written `data/*`,
 * two least-privilege GitHub OIDC roles (site deploy, jobs) and a $1/month budget alarm.
 */
export class HuddleSiteStack extends cdk.Stack {
  public readonly bucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;
  public readonly deployRole: iam.Role;
  public readonly jobsRole: iam.Role;

  constructor(scope: Construct, id: string, props: HuddleSiteStackProps) {
    super(scope, id, props);

    this.bucket = new s3.Bucket(this, "SiteBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const cleanUrls = new cloudfront.Function(this, "CleanUrls", {
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromFile({
        filePath: path.join(here, "../functions/clean-urls.js"),
      }),
      comment: "Rewrite directory routes to index.html and canonicalise trailing slashes",
    });

    const headers = new cloudfront.ResponseHeadersPolicy(this, "SecurityHeaders", {
      securityHeadersBehavior: {
        strictTransportSecurity: {
          accessControlMaxAge: cdk.Duration.days(365),
          includeSubdomains: true,
          preload: true,
          override: true,
        },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
      },
    });

    const origin = origins.S3BucketOrigin.withOriginAccessControl(this.bucket);

    const dataCache = new cloudfront.CachePolicy(this, "DataCache", {
      comment: "Job-written JSON under data/*: short TTLs so settlements show quickly",
      minTtl: cdk.Duration.seconds(0),
      defaultTtl: cdk.Duration.seconds(60),
      maxTtl: cdk.Duration.seconds(300),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });

    this.distribution = new cloudfront.Distribution(this, "Distribution", {
      comment: "Motown Huddle static site",
      defaultRootObject: "index.html",
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      defaultBehavior: {
        origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: headers,
        functionAssociations: [
          { function: cleanUrls, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST },
        ],
      },
      additionalBehaviors: {
        "data/*": {
          origin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: dataCache,
          responseHeadersPolicy: headers,
        },
      },
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 404,
          responsePagePath: "/404.html",
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 404,
          responsePagePath: "/404.html",
          ttl: cdk.Duration.minutes(5),
        },
      ],
    });

    const oidc = new iam.OidcProviderNative(this, "GithubOidc", {
      url: "https://token.actions.githubusercontent.com",
      clientIds: ["sts.amazonaws.com"],
    });

    const mainBranchOnly = new iam.WebIdentityPrincipal(oidc.oidcProviderArn, {
      StringEquals: { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
      StringLike: {
        "token.actions.githubusercontent.com:sub": `repo:${props.repo}:ref:refs/heads/main`,
      },
    });

    this.deployRole = new iam.Role(this, "HuddleDeployRole", {
      assumedBy: mainBranchOnly,
      description: "GitHub Actions site deploy: sync the bucket and invalidate the distribution",
      maxSessionDuration: cdk.Duration.hours(1),
    });
    this.deployRole.addToPolicy(
      new iam.PolicyStatement({ actions: ["s3:ListBucket"], resources: [this.bucket.bucketArn] }),
    );
    this.deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["s3:PutObject", "s3:DeleteObject"],
        resources: [this.bucket.arnForObjects("*")],
      }),
    );
    this.deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["cloudfront:CreateInvalidation"],
        resources: [this.distribution.distributionArn],
      }),
    );

    this.jobsRole = new iam.Role(this, "HuddleJobsRole", {
      assumedBy: mainBranchOnly,
      description: "GitHub Actions jobs: write data/* only and invalidate the distribution",
      maxSessionDuration: cdk.Duration.hours(1),
    });
    this.jobsRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["s3:PutObject"],
        resources: [this.bucket.arnForObjects("data/*")],
      }),
    );
    this.jobsRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["cloudfront:CreateInvalidation"],
        resources: [this.distribution.distributionArn],
      }),
    );

    new budgets.CfnBudget(this, "MonthlyBudget", {
      budget: {
        budgetType: "COST",
        timeUnit: "MONTHLY",
        budgetLimit: { amount: 1, unit: "USD" },
      },
      ...(props.budgetEmail
        ? {
            notificationsWithSubscribers: [
              {
                notification: {
                  notificationType: "ACTUAL",
                  comparisonOperator: "GREATER_THAN",
                  threshold: 80,
                  thresholdType: "PERCENTAGE",
                },
                subscribers: [{ subscriptionType: "EMAIL", address: props.budgetEmail }],
              },
            ],
          }
        : {}),
    });

    new cdk.CfnOutput(this, "BucketName", { value: this.bucket.bucketName });
    new cdk.CfnOutput(this, "DistributionId", { value: this.distribution.distributionId });
    new cdk.CfnOutput(this, "DistributionDomain", {
      value: this.distribution.distributionDomainName,
    });
    new cdk.CfnOutput(this, "DeployRoleArn", { value: this.deployRole.roleArn });
    new cdk.CfnOutput(this, "JobsRoleArn", { value: this.jobsRole.roleArn });
  }
}
