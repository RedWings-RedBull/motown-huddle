#!/usr/bin/env bash
# CI-only deploy: hashed assets immutable, HTML short-lived, job-written data/* left alone.
# Runs under the GitHub OIDC deploy role; never with local credentials.
set -euo pipefail

: "${HUDDLE_AWS_ACCOUNT_ID:?missing}" "${SITE_BUCKET:?missing}" "${CF_DISTRIBUTION_ID:?missing}"

actual="$(aws sts get-caller-identity --query Account --output text)"
if [[ "$actual" != "$HUDDLE_AWS_ACCOUNT_ID" ]]; then
  echo "Refusing to deploy: credentials belong to account $actual, expected $HUDDLE_AWS_ACCOUNT_ID" >&2
  exit 1
fi

dist="apps/web/dist"
aws s3 sync "$dist/_astro" "s3://$SITE_BUCKET/_astro" --delete \
  --cache-control "public,max-age=31536000,immutable"
aws s3 sync "$dist" "s3://$SITE_BUCKET" --delete \
  --exclude "_astro/*" --exclude "data/*" \
  --cache-control "public,max-age=0,s-maxage=300,must-revalidate"
aws cloudfront create-invalidation --distribution-id "$CF_DISTRIBUTION_ID" --paths "/*" >/dev/null
echo "deployed to s3://$SITE_BUCKET and invalidated $CF_DISTRIBUTION_ID"
