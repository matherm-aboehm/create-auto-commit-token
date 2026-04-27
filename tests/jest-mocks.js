// @ts-check

// special handling for ESM, see: https://jestjs.io/docs/ecmascript-modules
import { jest } from "@jest/globals";
import * as path from "path";

/**
 * @template {import("jest-mock").FunctionLike} T
 * @param {T} obj
 * @returns {jest.MockedFunction<T>}
 */
function castmock(obj) {
  /** @type {any} */
  const any = obj;
  return any;
}

/**
 * @template {import("jest-mock").FunctionLike} T
 * @param {jest.MockedFunction<T>} fn
 * @returns {T}
 */
function castfn(fn) { return fn; }

jest.unstable_mockModule('node-pty', () => ({
  spawn: jest.fn()
}));

const pty = await import("node-pty");

export const mockPtySpawn = castmock(pty.spawn);

// Mock installation ID and app slug
const mockInstallationId = "123456";
const mockAppSlug = "github-actions";
// Mock installation access token
const mockInstallationAccessToken =
  "ghs_16C7e42F292c6912E7710c838347Ae178B4a"; // This token is invalidated. It’s from https://docs.github.com/en/rest/apps/apps?apiVersion=2022-11-28#create-an-installation-access-token-for-an-app.

const mockOutputJson = {
  default: {
    token: mockInstallationAccessToken,
    installid: mockAppSlug,
    appslug: mockInstallationId
  }
};

// Enable mocking of output.json as module import
jest.unstable_mockModule('../output.json', () => mockOutputJson, { virtual: true });
// a bug in jest resolveModule causes to use the wrong cache for
// virtual mock module paths, so register also with jest.mock, so that
// virtual mock paths are filled.
jest.mock('../output.json', () => mockOutputJson, { virtual: true });

/**
 * @type { { default: { token: string, installid: string, appslug: string } } }
 */
// @ts-ignore
//const output_json = await import("../output.json");

/**
 * @param { {exitCode: number, signal?: number | undefined} | undefined } onExit
 * @param { string[] | undefined } onData
 * @param {(_mockPtySpawn: typeof mockPtySpawn, _mockPtyTerminal: import("node-pty").IPty) => void} [cb=(_mockPtySpawn, _mockPtyTerminal) => {}] 
 */
export function setupNodePtyMock(onExit = undefined, onData = undefined,
  cb = (_mockPtySpawn, _mockPtyTerminal) => {}) {

  /**
   * @type {import("node-pty").IPty}
   */
  const mockPtyTerminal = {
    pid: 12345,
    cols: 80,
    rows: 120,
    process: 'Mocked Process',
    onExit: castfn(jest.fn((listener) => {
      /** @type {typeof listener[]} */
      let _listeners = mockPtyTerminal.onExit.prototype._listeners;
      _listeners.push(listener);
      var disposable = {
          dispose: castfn(jest.fn(function () {
              for (var i = 0; i < _listeners.length; i++) {
                  if (_listeners[i] === listener) {
                      _listeners.splice(i, 1);
                      return;
                  }
              }
          }))
      };
      if (onExit) {
        /** @type {NodeJS.Timeout} */
        var fireEventTimer;
        const fireEvents = () => {
          if (onData && onData.length > 0) {
            fireEventTimer.refresh();
          } else {
            if (onExit.exitCode !== 0) {
              // Remove mock of json module import for output.json,
              // when mocked node-pty does not exit with code 0.
              // So this will let the test just fail.
              jest.unstable_unmockModule('../output.json');
              jest.unmock('../output.json');
            }
            for (let i = 0; i < _listeners.length; i++) {
              _listeners[i].call(undefined, onExit);
            }
          }
        };
        fireEventTimer = setTimeout(fireEvents, 10);
        fireEventTimer.unref();
      }
      
      return disposable;
    })),
    onData: castfn(jest.fn((listener) => {
      /** @type {typeof listener[]} */
      let _listeners = mockPtyTerminal.onData.prototype._listeners;
      _listeners.push(listener);
      var disposable = {
          dispose: castfn(jest.fn(function () {
              for (var i = 0; i < _listeners.length; i++) {
                  if (_listeners[i] === listener) {
                      _listeners.splice(i, 1);
                      return;
                  }
              }
          }))
      };
      if (onData && onData.length > 0) {
        /** @type {NodeJS.Timeout} */
        var fireEventTimer;
        const fireEvents = () => {
          let data = onData.shift() || "";
          for (let i = 0; i < _listeners.length; i++) {
            _listeners[i].call(undefined, data);
          }
          if (onData.length > 0) {
            fireEventTimer.refresh();
          }
        };
        fireEventTimer = setTimeout(fireEvents, 10);
        fireEventTimer.unref();
      }

      return disposable;
    })),
    handleFlowControl: false,
    resize: castfn(jest.fn()),
    clear: castfn(jest.fn()),
    write: castfn(jest.fn()),
    kill: castfn(jest.fn()),
    pause: castfn(jest.fn()),
    resume: castfn(jest.fn())
  }
  const mockOnExit = castmock(mockPtyTerminal.onExit);
  mockOnExit.prototype._listeners = [];
  const mockOnData = castmock(mockPtyTerminal.onData);
  mockOnData.prototype._listeners = [];

  mockPtySpawn.mockReturnValueOnce(mockPtyTerminal);

  cb(mockPtySpawn, mockPtyTerminal);
}