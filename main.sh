#!/bin/bash
set -eo pipefail

OWNER=${INPUT_OWNER:-""}
REPOSITORIES=${INPUT_REPOSITORIES:-""}
INPUT_GITHUB_API_URL=${INPUT_GITHUB_API_URL:-$GITHUB_API_URL}
GITHUB_ACTION_REF=${GITHUB_ACTION_REF:-$GITHUB_HEAD_REF}
GITHUB_ACTION_REF=${GITHUB_ACTION_REF:-$GITHUB_REF_NAME}
export GH_REPO=${GITHUB_ACTION_REPOSITORY:-$GITHUB_REPOSITORY}
export GH_TOKEN=$INPUT_GITHUB_TOKEN

if [ -z "$GH_TOKEN" ]; then
  echo "Missing input 'github-token: ${{ secrets.GITHUB_TOKEN }}'.";
  exit 1
fi

if [ -z "$GH_REPO" ]; then
  echo "The GitHub environment vars for the repository the action is running from were not set.";
  exit 1;
fi

if [ -z "$GITHUB_ACTION_REF" ]; then
  echo "The GitHub environment vars for the branch the action is running from were not set.";
  exit 1;
fi

if [ -n "${GITHUB_ACTION_PATH}" ]; then
  cd "${GITHUB_ACTION_PATH}"
fi

echo "Generate key pair for encrypting workflow output";

KEYPASS=$(echo "$RANDOM" | base64)
gpg --batch --passphrase "$KEYPASS" --quick-gen-key root rsa4096 encr
PUBKEY=$(gpg --armor --export root)
KEYFP=$(gpg --with-fingerprint --with-colons --list-keys root | awk -F: '/^pub:.*/ { getline; print $10}')
if [ -z "$KEYFP" ]; then
  echo "Generation of public/private key pair failed."
  exit 1
fi

removekeypair() {
  gpg --batch --yes --delete-secret-key "$KEYFP"
  gpg --batch --yes --delete-key "$KEYFP"
  echo "Key pair has been removed from global keyring."
}
trap 'removekeypair' EXIT

gh_version=$(gh --version | awk -F' '  '/^gh version.*/ { print $3 }')
IFS='.' read -r -a gh_version_parts <<< "$gh_version"
if [ ${gh_version_parts[0]} -lt 2 ] || [ ${gh_version_parts[1]} -lt 87 ]; then
  echo "Version of gh ($gh_version) is not compatible with this script. It should be at least 2.87.0"
  exit 1
fi

echo "Starting create-token.yml workflow"
# returns the run URL since version 2.87.0:
# https://github.com/cli/cli/issues/4001
# https://github.blog/changelog/2026-02-19-workflow-dispatch-api-now-returns-run-ids/
RUN_URL=$(gh workflow run create-token.yml -r "$GITHUB_ACTION_REF" \
  -f "owner=$OWNER" \
  -f "repositories=$REPOSITORIES" \
  -f "github-api-url=$INPUT_GITHUB_API_URL" \
  -f "public-key=$PUBKEY" 2>&1)
RUN_ID=$(echo "$RUN_URL" | awk -F'/' '/^https?:\/\/github\.com(\/[^\/]*)+\/runs\/[0-9]+/ { print $NF }')
if [ -z "$RUN_ID" ]; then
  echo "Run ID of workflow run not found."
  exit 1;
fi

echo "Waiting for workflow run $RUN_ID to complete..."
gh run watch $RUN_ID --exit-status > /dev/null 2>&1

echo "Downloading encrypted output artifact"
gh run download $RUN_ID -n output

echo "Decrypt workflow output"
gpg --passphrase "$KEYPASS" --output output.json --decrypt output.json.gpg

[ -e output.json ] || {
  echo "Decryption of workflow run output failed."
  exit 1;
};