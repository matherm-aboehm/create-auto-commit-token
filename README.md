# `create-auto-commit-token`

[![test](https://github.com/matherm-aboehm/create-auto-commit-token/actions/workflows/test.yml/badge.svg)](https://github.com/matherm-aboehm/create-auto-commit-token/actions/workflows/test.yml)

GitHub Action for creating a GitHub App installation access token for the `Auto Commit (Action)` App.

> [!NOTE]
> With this action no input of secret variables are required to create the GitHub App installation access token. So, nobody can gain full access to the GitHub App and do other things on behalf of the GitHub App.
>
> To make that possible the action runs another workflow on this repository, which has access to the secret variables that are used to authenticate the GitHub App and will never expose them. This closes the gap, that actions normally don't have access to their own repository environments where they live in. See this [discussion](https://github.com/orgs/community/discussions/147339) for more Information.

## Usage

In order to use this action, you need to:

1. [Install the Auto Commit (Action) App to your repository](https://github.com/apps/auto-commit-action).
2. Add a `uses` step referencing this action to your workflow file.
3. Use the `token` output wherever you need it.

> [!IMPORTANT]  
> An installation access token expires after 1 hour. Please [see this comment](https://github.com/actions/create-github-app-token/issues/121#issuecomment-2043214796) for alternative approaches if you have long-running processes.

### Create a token for the current repository

```yaml
name: Run tests on staging
on:
  push:
    branches:
      - main

jobs:
  hello-world:
    runs-on: ubuntu-latest
    steps:
      - uses: matherm-aboehm/create-auto-commit-token@main
        id: app-token
      - uses: ./actions/staging-tests
        with:
          token: ${{ steps.app-token.outputs.token }}
```

### Use app token with `actions/checkout`

```yaml
on: [pull_request]

jobs:
  auto-format:
    runs-on: ubuntu-latest
    steps:
      - uses: matherm-aboehm/create-auto-commit-token@main
        id: app-token
      - uses: actions/checkout@v6
        with:
          token: ${{ steps.app-token.outputs.token }}
          ref: ${{ github.head_ref }}
          # Make sure the value of GITHUB_TOKEN will not be persisted in repo's config
          persist-credentials: false
      - uses: creyD/prettier_action@v6
        with:
          github_token: ${{ steps.app-token.outputs.token }}
```

### Create a git committer string for an app installation

```yaml
on: [pull_request]

jobs:
  auto-format:
    runs-on: ubuntu-latest
    steps:
      - uses: matherm-aboehm/create-auto-commit-token@main
        id: app-token
      - name: Get GitHub App User ID
        id: get-user-id
        run: echo "user-id=$(gh api "/users/${{ steps.app-token.outputs.app-slug }}[bot]" --jq .id)" >> "$GITHUB_OUTPUT"
        env:
          GH_TOKEN: ${{ steps.app-token.outputs.token }}
      - id: committer
        run: echo "string=${{ steps.app-token.outputs.app-slug }}[bot] <${{ steps.get-user-id.outputs.user-id }}+${{ steps.app-token.outputs.app-slug }}[bot]@users.noreply.github.com>"  >> "$GITHUB_OUTPUT"
      - run: echo "committer string is ${{ steps.committer.outputs.string }}"
```

### Configure git CLI for an app's bot user

```yaml
on: [pull_request]

jobs:
  auto-format:
    runs-on: ubuntu-latest
    steps:
      - uses: matherm-aboehm/create-auto-commit-token@main
        id: app-token
      - name: Get GitHub App User ID
        id: get-user-id
        run: echo "user-id=$(gh api "/users/${{ steps.app-token.outputs.app-slug }}[bot]" --jq .id)" >> "$GITHUB_OUTPUT"
        env:
          GH_TOKEN: ${{ steps.app-token.outputs.token }}
      - run: |
          git config --global user.name '${{ steps.app-token.outputs.app-slug }}[bot]'
          git config --global user.email '${{ steps.get-user-id.outputs.user-id }}+${{ steps.app-token.outputs.app-slug }}[bot]@users.noreply.github.com'
      # git commands like commit work using the bot user
      - run: |
          git add .
          git commit -m "Auto-generated changes"
          git push
```

> [!TIP]
> The `<BOT USER ID>` is the numeric user ID of the app's bot user, which can be found under `https://api.github.com/users/<app-slug>%5Bbot%5D`.
>
> For example, we can check at `https://api.github.com/users/dependabot[bot]` to see the user ID of Dependabot is 49699333.
>
> Alternatively, you can use the [octokit/request-action](https://github.com/octokit/request-action) to get the ID.

### Create a token for all repositories in the current owner's installation

```yaml
on: [workflow_dispatch]

jobs:
  hello-world:
    runs-on: ubuntu-latest
    steps:
      - uses: matherm-aboehm/create-auto-commit-token@main
        id: app-token
        with:
          owner: ${{ github.repository_owner }}
      - uses: peter-evans/create-or-update-comment@v4
        with:
          token: ${{ steps.app-token.outputs.token }}
          issue-number: ${{ github.event.issue.number }}
          body: "Hello, World!"
```

### Create a token for multiple repositories in the current owner's installation

```yaml
on: [issues]

jobs:
  hello-world:
    runs-on: ubuntu-latest
    steps:
      - uses: matherm-aboehm/create-auto-commit-token@main
        id: app-token
        with:
          owner: ${{ github.repository_owner }}
          repositories: |
            repo1
            repo2
      - uses: peter-evans/create-or-update-comment@v4
        with:
          token: ${{ steps.app-token.outputs.token }}
          issue-number: ${{ github.event.issue.number }}
          body: "Hello, World!"
```

### Proxy support

Proxy support is only available in the `post` step of the action, because the actual work for the `main` step of the action will not run in the same context of the workflow which uses this action.

This action relies on Node.js native proxy support.

If you set `HTTP_PROXY` or `HTTPS_PROXY`, also set `NODE_USE_ENV_PROXY: "1"` on the action step so Node.js honors those variables. If you need proxy bypass rules, set `NO_PROXY` alongside them.

```yaml
- uses: matherm-aboehm/create-auto-commit-token@main
  id: app-token
  env:
    HTTPS_PROXY: http://proxy.example.com:8080
    NO_PROXY: github.example.com
    NODE_USE_ENV_PROXY: "1"
```

## Inputs

### `owner`

**Optional:** The owner of the GitHub App installation. If empty, defaults to the current repository owner.

> [!NOTE]
> For security reasons, the `owner` can't be set to any other value than the current repository owner. However, it can be used to indicate that access to all repositories of that `owner` should be granted without explicitly specifying them. See notes on `repositories` for that matter.

### `repositories`

**Optional:** Comma or newline-separated list of repositories to grant access to.

> [!NOTE]
> If `owner` is set and `repositories` is empty, access will be scoped to all repositories in the provided repository owner's installation. If `owner` and `repositories` are empty, access will be scoped to only the current repository.

### `skip-token-revoke`

**Optional:** If true, the token will not be revoked when the current job is complete.

### `github-api-url`

**Optional:** The URL of the GitHub REST API. Defaults to the URL of the GitHub Rest API where the workflow is run from.

## Outputs

### `token`

GitHub App installation access token.

### `installation-id`

GitHub App installation ID.

### `app-slug`

GitHub App slug.

## How it works

The action creates an installation access token using [the `POST /app/installations/{installation_id}/access_tokens` endpoint](https://docs.github.com/rest/apps/apps?apiVersion=2022-11-28#create-an-installation-access-token-for-an-app). By default,

1. The token is scoped to the current repository or `repositories` if set.
2. The token is scoped to the current repository owner which can't be changed by setting the `owner` input.
3. The token inherits all the installation's permissions.
4. The token is set as output `token` which can be used in subsequent steps.
5. Unless the `skip-token-revoke` input is set to true, the token is revoked in the `post` step of the action, which means it cannot be passed to another job.
6. The token is masked, it cannot be logged accidentally.

> [!NOTE]
> Installation permissions can differ from the app's permissions they belong to. Installation permissions are set when an app is installed on an account. When the app adds more permissions after the installation, an account administrator will have to approve the new permissions before they are set on the installation.

## License

[MIT](LICENSE)
