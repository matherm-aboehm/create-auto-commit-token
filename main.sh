#!/bin/bash
set -eo pipefail

OWNER=${INPUT_OWNER:-""}
REPOSITORIES=${INPUT_REPOSITORIES:-""}
INPUT_GITHUB_API_URL=${INPUT_GITHUB_API_URL:-$GITHUB_API_URL}

echo "Generate token for $OWNER/{$REPOSITORIES}";

if [ -n "${GITHUB_ACTION_PATH}" ]; then
  cd "${GITHUB_ACTION_PATH}"
fi

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

export GH_REPO=$GITHUB_ACTION_REPOSITORY
export GH_TOKEN=$GITHUB_TOKEN
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

# wait for the workflow run to complete
gh run watch $RUN_ID --exit-status > /dev/null 2>&1

gh run download $RUN_ID -n output

gpg --passphrase "$KEYPASS" --output output.json --decrypt output.json.gpg

[ -e output.json ] || {
  echo "Decryption of workflow run output failed."
  exit 1;
};