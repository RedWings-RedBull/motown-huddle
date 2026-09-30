import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { beforeAll, describe, expect, it } from "vitest";

import { HuddleSiteStack } from "../lib/site-stack.js";

const REPO = "RedWings-RedBull/motown-huddle";

interface RoleResource {
  Properties: { AssumeRolePolicyDocument: { Statement: unknown[] } };
}

describe("HuddleSiteStack", () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new HuddleSiteStack(app, "Test", {
      env: { account: "123456789012", region: "us-east-1" },
      repo: REPO,
      budgetEmail: "owner@example.com",
    });
    template = Template.fromStack(stack);
  });

  it("keeps the bucket private, owner-enforced, encrypted and retained", () => {
    template.hasResourceProperties("AWS::S3::Bucket", {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
      OwnershipControls: { Rules: [{ ObjectOwnership: "BucketOwnerEnforced" }] },
    });
    template.hasResource("AWS::S3::Bucket", { DeletionPolicy: "Retain" });
    template.resourceCountIs("AWS::S3::Bucket", 1);
  });

  it("serves through CloudFront with OAC, HTTPS redirect, a root object and the clean-URL function", () => {
    template.resourceCountIs("AWS::CloudFront::OriginAccessControl", 1);
    template.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: Match.objectLike({
        DefaultRootObject: "index.html",
        DefaultCacheBehavior: Match.objectLike({
          ViewerProtocolPolicy: "redirect-to-https",
          FunctionAssociations: [Match.objectLike({ EventType: "viewer-request" })],
        }),
        CacheBehaviors: [Match.objectLike({ PathPattern: "data/*" })],
        CustomErrorResponses: Match.arrayWith([
          Match.objectLike({ ErrorCode: 403, ResponseCode: 404, ResponsePagePath: "/404.html" }),
        ]),
      }),
    });
    template.resourceCountIs("AWS::CloudFront::Function", 1);
  });

  it("trusts GitHub OIDC only for this repo's main branch, with both aud and sub conditions", () => {
    const roles = template.findResources("AWS::IAM::Role");
    const trusts = Object.values(roles).map(
      (r) => (r as RoleResource).Properties.AssumeRolePolicyDocument.Statement,
    );
    expect(trusts).toHaveLength(2);
    for (const statements of trusts) {
      expect(statements).toEqual([
        expect.objectContaining({
          Action: "sts:AssumeRoleWithWebIdentity",
          Condition: {
            StringEquals: { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
            StringLike: {
              "token.actions.githubusercontent.com:sub": `repo:${REPO}:ref:refs/heads/main`,
            },
          },
        }),
      ]);
    }
  });

  it("scopes the jobs role to data/* writes and one invalidation only", () => {
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: "s3:PutObject",
            Resource: Match.objectLike({
              "Fn::Join": Match.arrayWith([Match.arrayWith(["/data/*"])]),
            }),
          }),
          Match.objectLike({ Action: "cloudfront:CreateInvalidation" }),
        ]),
      },
      Roles: [{ Ref: Match.stringLikeRegexp("HuddleJobsRole") }],
    });
  });

  it("never creates long-lived credentials", () => {
    template.resourceCountIs("AWS::IAM::User", 0);
    template.resourceCountIs("AWS::IAM::AccessKey", 0);
  });

  it("sets a $1 monthly budget with an email alarm", () => {
    template.hasResourceProperties("AWS::Budgets::Budget", {
      Budget: Match.objectLike({ BudgetLimit: { Amount: 1, Unit: "USD" }, TimeUnit: "MONTHLY" }),
      NotificationsWithSubscribers: [
        Match.objectLike({
          Subscribers: [{ SubscriptionType: "EMAIL", Address: "owner@example.com" }],
        }),
      ],
    });
  });

  it("omits the budget notification when no email is configured", () => {
    const app = new cdk.App();
    const stack = new HuddleSiteStack(app, "NoEmail", {
      env: { account: "123456789012", region: "us-east-1" },
      repo: REPO,
    });
    const t = Template.fromStack(stack);
    t.hasResourceProperties("AWS::Budgets::Budget", {
      NotificationsWithSubscribers: Match.absent(),
    });
  });

  it("exports everything the workflows need", () => {
    for (const name of [
      "BucketName",
      "DistributionId",
      "DistributionDomain",
      "DeployRoleArn",
      "JobsRoleArn",
    ]) {
      template.hasOutput(name, {});
    }
  });
});
