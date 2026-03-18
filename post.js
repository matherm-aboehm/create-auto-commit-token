// @ts-check

import * as core from "@actions/core";

import { request } from "@octokit/request";
import { RequestError } from "@octokit/request-error";
import { ProxyAgent, fetch as undiciFetch } from "undici";

const baseUrl = core.getInput("github-api-url").replace(/\/$/, "");

// https://docs.github.com/actions/hosting-your-own-runners/managing-self-hosted-runners/using-a-proxy-server-with-self-hosted-runners
const proxyUrl =
  process.env.https_proxy ||
  process.env.HTTPS_PROXY ||
  process.env.http_proxy ||
  process.env.HTTP_PROXY;

/* c8 ignore start */
// Native support for proxies in Undici is under consideration: https://github.com/nodejs/undici/issues/1650
// Until then, we need to use a custom fetch function to add proxy support.
/**
 * @param {string | URL} url
 * @param {import("undici").RequestInit} options
 */
const proxyFetch = (url, options) => {
  const urlHost = new URL(url).hostname;
  const noProxy = (process.env.no_proxy || process.env.NO_PROXY || "").split(
    ",",
  );

  if (!noProxy.includes(urlHost)) {
    options = {
      ...options,
      dispatcher: new ProxyAgent(String(proxyUrl)),
    };
  }

  return undiciFetch(url, options);
};
/* c8 ignore stop */

const default_request = request.defaults({
  headers: {
    "user-agent": "actions/create-github-app-token",
  },
  baseUrl,
  /* c8 ignore next */
  request: proxyUrl ? { fetch: proxyFetch } : {},
});

/**
 * @param {unknown} error
 * @returns {error is Error}
 */
function isError(error) {
  if (error && typeof error === 'object' && error instanceof Error)
    return true;
  /* c8 ignore next */
  return false;
}

/**
 * @param {unknown} error
 * @returns {error is RequestError}
 */
function isRequestError(error) {
  if (error && typeof error === 'object' && error instanceof RequestError)
    return true;
  return false;
}

/**
 * @param {import("@actions/core")} core
 * @param {import("@octokit/request").request} request
 */
export async function post(core, request) {
  const skipTokenRevoke = core.getBooleanInput("skip-token-revoke");

  if (skipTokenRevoke) {
    core.info("Token revocation was skipped");
    return;
  }

  const token = core.getState("token");

  if (!token) {
    core.info("Token is not set");
    return;
  }

  const expiresAt = core.getState("expiresAt");
  if (expiresAt && tokenExpiresIn(expiresAt) < 0) {
    core.info("Token expired, skipping token revocation");
    return;
  }

  try {
    await request("DELETE /installation/token", {
      headers: {
        authorization: `token ${token}`,
      },
    });
    core.info("Token revoked");
  } catch (error) {
    if (isRequestError(error)) {
      core.warning(`Token revocation failed: ${error.name} ${error.status} "${error.message}"`);
    } else if(isError(error)) {
      core.warning(`Token revocation failed: ${error.message}`);
    } /* c8 ignore next 2 */ else {
      core.warning(`Token revocation failed: ${JSON.stringify(error)}`);
    }
  }
}

/**
 * @param {string} expiresAt
 */
function tokenExpiresIn(expiresAt) {
  const now = new Date();
  const expiresAtDate = new Date(expiresAt);

  return Math.round((expiresAtDate.getTime() - now.getTime()) / 1000);
}

post(core, default_request).catch((error) => {
  /* c8 ignore next 3 */
  console.error(error);
  core.setFailed(error.message);
});
