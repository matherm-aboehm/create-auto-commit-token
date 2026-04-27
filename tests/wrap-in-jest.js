// @ts-check
import { runCLI } from "jest";
import * as path from "path";

const DEFAULT_WRAPPING_OPTIONS = {
  expectFail: false
};

/**
 * @param {unknown} error
 * @returns {error is Error}
 */
function isError(error) {
  if (error && typeof error === 'object' &&
    // @ts-ignore Error.isError available since Node 24.3
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/isError
    (error instanceof Error || Error.isError(error) ))
    return true;
  return false;
}

/**
 * @param {string} text
 * @param {string} rootDir
 * @returns {string}
 */
function replaceRootDir(text, rootDir)
{
  return text.replaceAll(`${rootDir}${path.sep}`, '');
}

/**
 * @param {string} testScript 
 * @param {() => Promise<void>} [cb=async () => {}]
 */
export async function wrapInJest(testScript, cb = async () => {}, wrapOptions = DEFAULT_WRAPPING_OPTIONS) {

  if(import.meta.jest === undefined) {
    /** @type {import('jest').Config} */
    const config = {
      // Config type defines that 2nd item on reporter array
      // should be options object, but to disable summary reporters,
      // actually null is required as 2nd item, so type check is
      // disabled for that line
      // @ts-expect-error
      reporters: [['default', null]],
      transform: {},
    };
    /** @type {import("@jest/types").Config.Argv} */
    const options = {
      _: [testScript],
      $0: process.argv0,
      config: JSON.stringify(config),
      runTestsByPath: true,
      runInBand: true,
      workerThreads: true,
      clearMocks: true,
      verbose: false,
      //noStackTrace: true,
      //silent: true,
    };

    await runCLI(options, [path.join(import.meta.dirname, '..')])
    .then((result) => {
      if (result.results.success) {
        var successMessage = result.results.testResults[0].testResults[0].title;
        successMessage += " ... " + result.results.testResults[0].testResults[0].status;
        console.log(successMessage);
      } else {
        console.error(result.results.testResults[0].failureMessage);
        if(!wrapOptions.expectFail && process.exitCode === undefined) {
          process.exitCode = 1;
        }
      }
    })
    .catch((failure) => {
      console.error(failure);
    });
  } else {
    const { mockPtySpawn } = await import("./jest-mocks.js");
    const rootDir = path.join(import.meta.dirname, '..');

    describe("wrap-in-jest", () => {
      beforeAll(() => {
        // Strip rootDir from the full stack trace, because the stack
        // trace contains environment-specific paths and ANSI codes that differ
        // between local and CI environments.
        const _error = console.error;
        console.error = (err) => {
          var message = err;
          if (isError(err)) {
            message = replaceRootDir(err.message, rootDir);
            if (err.stack) {
              message = (err.stack.includes(err.message) ? '' : message + "\n")
                + replaceRootDir(err.stack, rootDir);
            }
          }
          _error(message);
        };
      });

      it(`Wrapped jest test for ${path.basename(testScript)}`, async () => {
        await cb();

        const shellScriptPath = path.join(import.meta.dirname, '../main.sh');
        
        expect(mockPtySpawn).toHaveBeenCalledWith("bash",
          expect.arrayContaining([shellScriptPath]),
          expect.objectContaining({ name: 'xterm-256color' }));

        if (wrapOptions.expectFail) {
          expect(process.exitCode).toBeDefined();
          expect(process.exitCode).not.toBe(0);
        } else {
          if(process.exitCode !== undefined) {
            expect(process.exitCode).toBe(0);
          }
        }
      });

      afterAll(() => {
        if (wrapOptions.expectFail) {
          process.exitCode = 0;
        }
      });
    });
  }
}