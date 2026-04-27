// @ts-check

import * as core from "@actions/core";
import * as pty from "node-pty";
import * as path from "path";
import * as http from "http";
import * as https from "https";

if (!process.env.GITHUB_REPOSITORY) {
  throw new Error("GITHUB_REPOSITORY missing, must be set to '<owner>/<repo>'");
}

if (!process.env.GITHUB_REPOSITORY_OWNER) {
  throw new Error("GITHUB_REPOSITORY_OWNER missing, must be set to '<owner>'");
}

const owner = core.getInput("owner");
const repositories = core
  .getInput("repositories")
  .split(/[\n,]+/)
  .map((s) => s.trim())
  .filter((x) => x !== "");

const skipTokenRevoke = core.getBooleanInput("skip-token-revoke");
const github_api_url = core.getInput("github-api-url").replace(/\/$/, "");
const github_token = core.getInput("github-token");

/**
 * @param {string} cmd
 * @param {string[]} args
 */
const exec = (cmd, args = [], options = {}) => new Promise((resolve, reject) => {
    const proc = pty.spawn(cmd, args, { name: 'xterm-256color', ...options });
    proc.onExit(({ exitCode: code }) => {
            if (code !== 0) {
                return reject(Object.assign(
                    new Error(`Invalid exit code: ${code}`),
                    { code }
                ));
            };
            return resolve(code);
        });
    proc.onData(data => process.stdout.write(data));
});

/**
 * @param {string} owner
 * @param {string[]} repositories
 * @param {import("@actions/core")} core
 * @param {boolean} skipTokenRevoke
 */
const main = async (
  owner,
  repositories,
  core,
  skipTokenRevoke) => {
  let parsedOwner = "";
  /**
   * @type {string[]}
   */
  let parsedRepositoryNames = [];

  // If neither owner nor repositories are set, default to current repository
  if (!owner && repositories.length === 0) {
    const [owner, repo] = String(process.env.GITHUB_REPOSITORY).split("/");
    parsedOwner = owner;
    parsedRepositoryNames = [repo];

    core.info(
      `Inputs 'owner' and 'repositories' are not set. Creating token for this repository (${owner}/${repo}).`
    );
  }

  // If only an owner is set, default to all repositories from that owner
  if (owner && repositories.length === 0) {
    parsedOwner = owner;

    core.info(
      `Input 'repositories' is not set. Creating token for all repositories owned by ${owner}.`
    );
  }

  // If repositories are set, but no owner, default to `GITHUB_REPOSITORY_OWNER`
  if (!owner && repositories.length > 0) {
    parsedOwner = String(process.env.GITHUB_REPOSITORY_OWNER);
    parsedRepositoryNames = repositories;

    core.info(
      `No 'owner' input provided. Using default owner '${parsedOwner}' to create token for the following repositories:${repositories
        .map((repo) => `\n- ${parsedOwner}/${repo}`)
        .join("")}`
    );
  }

  // If both owner and repositories are set, use those values
  if (owner && repositories.length > 0) {
    parsedOwner = owner;
    parsedRepositoryNames = repositories;

    core.info(
      `Inputs 'owner' and 'repositories' are set. Creating token for the following repositories:
      ${repositories.map((repo) => `\n- ${parsedOwner}/${repo}`).join("")}`
    );
  }

  if (parsedOwner != String(process.env.GITHUB_REPOSITORY_OWNER)) {
    throw new Error(
      `Input 'owner' must be empty or set to the current repository owner.
      For security reasons other owners than the current repository owner are not supported.
      Owner from input: ${parsedOwner}
      Owner of current repository:${String(process.env.GITHUB_REPOSITORY_OWNER)}`);
  }

  // __dirname only available in CJS not ESM and import.meta.dirname
  // is only available in ESM, so let esbuild replace
  // import.meta.dirname with path.join(__dirname, '..')
  // see:
  // https://nodejs.org/api/esm.html#differences-between-es-modules-and-commonjs
  // https://nodejs.org/api/esm.html#importmetadirname
  // https://github.com/evanw/esbuild/issues/1492
  let workingDir = process.env.GITHUB_ACTION_PATH || import.meta.dirname;

  await exec('bash', (core.isDebug() ? ['-x'] : []).concat(path.join(workingDir, './main.sh')), {
    env: {
      ...process.env,
      INPUT_OWNER: parsedOwner,
      INPUT_REPOSITORIES: parsedRepositoryNames.join(","),
      INPUT_GITHUB_API_URL: github_api_url,
      INPUT_GITHUB_TOKEN: github_token,
      GITHUB_ACTION_PATH: workingDir
    }
  });


  /**
   * @type { { default: { token: string, installid: string, appslug: string } } }
   */
  const { default: output } = await import(path.join(workingDir, './output.json'), {
    with: {
      type: "json"
    }    
  });

  core.setSecret(output.token);

  core.setOutput("token", output.token);
  core.setOutput("installation-id", output.installid);
  core.setOutput("app-slug", output.appslug);

  // Make token accessible to post function (so we can invalidate it)
  if (!skipTokenRevoke) {
    core.saveState("token", output.token);
    // currently its not possible to get/change state of different GitHub Actions step,
    // so expiresAt can't be retrieved from the output of other workflow
    //core.saveState("expiresAt", output.expiresAt);
  }
};

// Export promise for testing
export default main(
  owner,
  repositories,
  core,
  skipTokenRevoke,
).catch((error) => {
  /* c8 ignore next 3 */
  console.error(error);
  core.setFailed(error.message);
});
