// Base for all `main` tests.
import { MockAgent, setGlobalDispatcher } from "undici";

export const DEFAULT_ENV = {
  GITHUB_REPOSITORY_OWNER: "matherm-aboehm",
  GITHUB_REPOSITORY: "matherm-aboehm/create-auto-commit-token",
  // inputs are set as environment variables with the prefix INPUT_
  // https://docs.github.com/actions/creating-actions/metadata-syntax-for-github-actions#example-specifying-inputs
  "INPUT_GITHUB-API-URL": "https://api.github.com",
  "INPUT_SKIP-TOKEN-REVOKE": "false",
  // The Actions runner sets all inputs to empty strings if not set.
  "INPUT_OWNER": "",
  "INPUT_REPOSITORIES": "",
};

/**
 * @param {(_mockPool: import("undici").Interceptable) => void} cb
 * @param {typeof DEFAULT_ENV} env
 */
export async function test(cb = (_mockPool) => {}, env = DEFAULT_ENV) {
  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value;
  }

  // Set up mocking
  const baseUrl = new URL(env["INPUT_GITHUB-API-URL"]);
  const basePath = baseUrl.pathname === "/" ? "" : baseUrl.pathname;
  const mockAgent = new MockAgent({ enableCallHistory: true });
  mockAgent.disableNetConnect();
  setGlobalDispatcher(mockAgent);
  const mockPool = mockAgent.get(baseUrl.origin);


  // Calling `auth({ type: "app" })` to obtain a JWT doesn’t make network requests, so no need to intercept.

  // Mock installation ID and app slug request
  const mockInstallationId = "123456";
  const mockAppSlug = "github-actions";
  const owner = env.INPUT_OWNER ?? env.GITHUB_REPOSITORY_OWNER;
  const currentRepoName = env.GITHUB_REPOSITORY.split("/")[1];
  const repo = encodeURIComponent(
    (env.INPUT_REPOSITORIES ?? currentRepoName).split(",")[0]
  );

  mockPool
    .intercept({
      path: `${basePath}/repos/${owner}/${repo}/installation`,
      method: "GET",
      headers: {
        accept: "application/vnd.github.v3+json",
        "user-agent": "actions/create-github-app-token",
        // Intentionally omitting the `authorization` header, since JWT creation is not idempotent.
      },
    })
    .reply(
      200,
      { id: mockInstallationId, app_slug: mockAppSlug },
      { headers: { "content-type": "application/json" } }
    );

  // Mock installation access token request
  const mockInstallationAccessToken =
    "ghs_16C7e42F292c6912E7710c838347Ae178B4a"; // This token is invalidated. It’s from https://docs.github.com/en/rest/apps/apps?apiVersion=2022-11-28#create-an-installation-access-token-for-an-app.
  const mockExpiresAt = "2016-07-11T22:14:10Z";

  mockPool
    .intercept({
      path: `${basePath}/app/installations/${mockInstallationId}/access_tokens`,
      method: "POST",
      headers: {
        accept: "application/vnd.github.v3+json",
        "user-agent": "actions/create-github-app-token",
        // Note: Intentionally omitting the `authorization` header, since JWT creation is not idempotent.
      },
    })
    .reply(
      201,
      { token: mockInstallationAccessToken, expires_at: mockExpiresAt },
      { headers: { "content-type": "application/json" } }
    );

  // Run the callback
  cb(mockPool);

  // Run the main script
  const { default: promise } = await import("../main.js");
  await promise;

  console.log("--- REQUESTS ---");
  const calls = mockAgent
    .getCallHistory()
    ?.calls()
    .map((call) => {
      const route = `${call.method} ${call.path}`;
      if (call.method === "GET") return route;

      return `${route}\n${call.body}`;
    });

  console.log(calls?.join("\n") ?? "");
}
