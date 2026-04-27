import { readdirSync } from "node:fs";
import { stripVTControlCharacters } from "node:util";

import test from "ava";
import { execa } from "execa";

// Get all files in tests directory
const files = readdirSync("tests");

// Files to ignore
const ignore = ["index.js", "main.js", "jest-mocks.js", "wrap-in-jest.js", "README.md", "snapshots"];

const testFiles = files.filter((file) => !ignore.includes(file));

// Throw an error if there is a file that does not end with test.js in the tests directory
for (const file of testFiles) {
  if (!file.endsWith(".test.js")) {
    throw new Error(`File ${file} does not end with .test.js`);
  }
  test(file, async (t) => {
    // Override Actions environment variables that change `core`’s behavior
    const env = {
      GITHUB_OUTPUT: undefined,
      GITHUB_STATE: undefined,
    };
    // jest needs `--experimental-vm-modules` for ESM support, but this outputs
    // a runtime specific warning (process id is included) and snapshotting this
    // would result in failing tests. So, to resolve this all experimental warnings
    // are disabled for now.
    const { stderr, stdout } = await execa("node", ['--experimental-vm-modules', '--disable-warning=ExperimentalWarning', `tests/${file}`], { env });
    // jest can output with ANSI escape codes for colorized console output, but
    // markdown of the snapshot doesn't support this, so remove these characters here.
    t.snapshot(stripVTControlCharacters(stderr), "stderr");
    t.snapshot(stripVTControlCharacters(stdout), "stdout");
  });
}
