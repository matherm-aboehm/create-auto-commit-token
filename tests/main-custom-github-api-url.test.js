import { DEFAULT_ENV, test } from "./main.js";
import { wrapInJest } from "./wrap-in-jest.js";

await wrapInJest(import.meta.filename,
  async () => {
    const { setupNodePtyMock, mockPtySpawn } = await import("./jest-mocks.js");
    setupNodePtyMock({ exitCode: 0 });

    const api_url = "https://github.acme-inc.com/api/v3";
    // Verify that main works with a custom GitHub API URL passed as `github-api-url` input
    await test(
      () => {
        process.env.INPUT_OWNER = process.env.GITHUB_REPOSITORY_OWNER;
        const currentRepoName = process.env.GITHUB_REPOSITORY.split("/")[1];
        process.env.INPUT_REPOSITORIES = currentRepoName;
      },
      {
        ...DEFAULT_ENV,
        "INPUT_GITHUB-API-URL": api_url,
      }
    );

    expect(mockPtySpawn).toHaveBeenCalledWith("bash",
      expect.arrayOf(expect.any(String)),
      expect.objectContaining({
        env: expect.objectContaining({ INPUT_GITHUB_API_URL: api_url })
      }));
  });