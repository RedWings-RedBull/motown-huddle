import * as cdk from "aws-cdk-lib";

import { loadDotEnv, readDomain, requireAccountId } from "../lib/env.js";
import { HuddleSiteStack } from "../lib/site-stack.js";

loadDotEnv();
const account = requireAccountId();
const domain = readDomain();

const app = new cdk.App();
new HuddleSiteStack(app, "HuddleSite", {
  env: { account, region: "us-east-1" },
  repo: process.env.HUDDLE_GITHUB_REPO ?? "RedWings-RedBull/the-den-report",
  ...(process.env.HUDDLE_BUDGET_EMAIL ? { budgetEmail: process.env.HUDDLE_BUDGET_EMAIL } : {}),
  ...(domain ? { domain } : {}),
  ...(process.env.HUDDLE_GITHUB_OIDC_PROVIDER_ARN
    ? { githubOidcProviderArn: process.env.HUDDLE_GITHUB_OIDC_PROVIDER_ARN }
    : {}),
  description: "The Den Report static site (S3 + CloudFront + GitHub OIDC roles)",
});
