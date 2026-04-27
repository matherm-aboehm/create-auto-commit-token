import { DEFAULT_ENV, test } from "./main.js";
import { wrapInJest } from "./wrap-in-jest.js";

await wrapInJest(import.meta.filename,
  async () => {
    const { setupNodePtyMock, mockPtySpawn } = await import("./jest-mocks.js");
    setupNodePtyMock({ exitCode: 1 });

    // Verify that main throws when shell script exits with exit code 1
    await test(
      () => {
        process.env.INPUT_OWNER = process.env.GITHUB_REPOSITORY_OWNER;
        const currentRepoName = process.env.GITHUB_REPOSITORY.split("/")[1];
        process.env.INPUT_REPOSITORIES = currentRepoName;
      }
    );
  }, { expectFail: true });