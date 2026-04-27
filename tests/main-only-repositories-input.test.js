import { DEFAULT_ENV, test } from "./main.js";
import { wrapInJest } from "./wrap-in-jest.js";

await wrapInJest(import.meta.filename,
  async () => {
    const { setupNodePtyMock, mockPtySpawn } = await import("./jest-mocks.js");
    setupNodePtyMock({ exitCode: 0 });

    var currentRepoName;
    // Verify that main works with only `repositories` input passed
    await test(
      () => {
        currentRepoName = process.env.GITHUB_REPOSITORY.split("/")[1];
        process.env.INPUT_REPOSITORIES = currentRepoName;
      },
    );

    expect(mockPtySpawn).toHaveBeenCalledWith("bash",
      expect.arrayOf(expect.any(String)),
      expect.objectContaining({
        env: expect.objectContaining({ INPUT_REPOSITORIES: currentRepoName })
      }));
  });