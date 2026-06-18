/**
 * apiClient.js — Centralized fetch wrapper.
 *
 * Responsibilities:
 *  - Automatically attaches the JWT Bearer token from localStorage.
 *  - Parses JSON error bodies and surfaces the real backend message.
 *  - Throws a standardized Error so callers never see raw "Failed to fetch".
 *  - Provides typed GET / POST / PUT / DELETE helpers.
 */

const getToken = () => localStorage.getItem('token');

/**
 * Core request function.
 * @param {string} url
 * @param {RequestInit} options
 * @returns {Promise<any>} Parsed JSON response
 */
async function request(url, options = {}) {
  const token = getToken();

  const headers = {
    ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  let response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch (networkError) {
    // Network-level failure (service down, DNS issue, CORS, etc.)
    throw new Error(
      'Cannot reach the server. Please check your connection or try again later.'
    );
  }

  // Parse JSON body regardless of status so we can extract error messages
  let body;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    // Prefer the backend's own error message, fall back to HTTP status
    const message =
      (body && (body.error || body.message)) ||
      `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return body;
}

export const get  = (url)        => request(url, { method: 'GET' });
export const post = (url, body)  => request(url, { method: 'POST',   body: body instanceof FormData ? body : JSON.stringify(body) });
export const put  = (url, body)  => request(url, { method: 'PUT',    body: body instanceof FormData ? body : (body ? JSON.stringify(body) : undefined) });
export const del  = (url)        => request(url, { method: 'DELETE' });
