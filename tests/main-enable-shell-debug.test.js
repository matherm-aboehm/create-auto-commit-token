import { DEFAULT_ENV, test } from "./main.js";
import { wrapInJest } from "./wrap-in-jest.js";

await wrapInJest(import.meta.filename,
  async () => {
    const { setupNodePtyMock, mockPtySpawn } = await import("./jest-mocks.js");
    setupNodePtyMock({ exitCode: 0 });

    // Verify that main enables debug output for bash shell
    await test(undefined, {
        ...DEFAULT_ENV,
        RUNNER_DEBUG: '1',
      });
      
    expect(mockPtySpawn).toHaveBeenCalledWith("bash",
      expect.arrayContaining(['-x', expect.any(String)]),
      expect.anything());
  });