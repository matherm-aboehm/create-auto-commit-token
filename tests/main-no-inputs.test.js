import { DEFAULT_ENV, test } from "./main.js";
import { wrapInJest } from "./wrap-in-jest.js";

await wrapInJest(import.meta.filename,
  async () => {
    const { setupNodePtyMock, mockPtySpawn } = await import("./jest-mocks.js");
    setupNodePtyMock({ exitCode: 0 });

    // Verify that main just works without any inputs passed
    await test();
  });