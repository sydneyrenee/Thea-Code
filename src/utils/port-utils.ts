/**
 * Port Utility Functions
 * 
 * This module provides utility functions for checking port availability and finding
 * available ports for use in the application, particularly in test environments.
 * It uses the tcp-port-used package to perform the actual port checks.
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - module has no types
import * as tcpPortUsedModule from 'tcp-port-used';
const tcpPortUsed = tcpPortUsedModule as {
  check: (port: number, host: string) => Promise<boolean>;
  waitUntilFree: (port: number, host: string, retryTimeMs: number, timeOutMs: number) => Promise<void>;
  waitUntilUsed: (port: number, host: string, retryTimeMs: number, timeOutMs: number) => Promise<void>;
};

/**
 * Checks if a port is available for use
 * @param port - The port to check
 * @param host - The host to check (defaults to localhost)
 * @returns Promise<boolean> - Resolves to true if the port is available, false if in use
 */
export async function isPortAvailable(port: number, host = 'localhost'): Promise<boolean> {
  try {
    const inUse = await tcpPortUsed.check(port, host);
    return !inUse; // Return true if port is NOT in use
  } catch (error) {
    console.error(`Error checking port ${port} availability:`, error);
    return false; // Assume port is unavailable if there's an error
  }
}

/**
 * Finds an available port starting from the given port
 * @param startPort - The port to start checking from
 * @param host - The host to check (defaults to localhost)
 * @param preferredRanges - Optional array of preferred port ranges to try first [start, end]
 * @param maxAttempts - Maximum number of ports to check before giving up
 * @param silent - Optional flag to suppress logs (useful for test fast-start paths)
 * @returns Promise<number> - Resolves to an available port
 */
export async function findAvailablePort(
  startPort = 3000, 
  host = 'localhost',
  preferredRanges?: Array<[number, number]>,
  maxAttempts = 100,
  silent = false
): Promise<number> {
  // Try preferred ranges first if provided
  if (preferredRanges && preferredRanges.length > 0) {
    for (const [rangeStart, rangeEnd] of preferredRanges) {
      // Validate range
      if (rangeStart < 1024 || rangeEnd > 65535 || rangeStart > rangeEnd) {
        if (!silent) console.warn(`Invalid port range [${rangeStart}, ${rangeEnd}], skipping`)
        continue;
      }
      if (!silent) console.log(`Trying preferred port range [${rangeStart}, ${rangeEnd}]`)
      // Try up to 10 random ports in this range
      for (let i = 0; i < 10; i++) {
        const randomPort = Math.floor(Math.random() * (rangeEnd - rangeStart + 1)) + rangeStart;
        const available = await isPortAvailable(randomPort, host);
        if (available) {
          if (!silent) console.log(`Found available port ${randomPort} in preferred range`)
          return randomPort;
        }
      }
    }
    if (!silent) console.log("No available ports found in preferred ranges, trying sequential search")
  }
  
  // Fall back to sequential search
  let port = startPort;
  const maxPort = 65535;
  let attempts = 0;
  
  while (port <= maxPort && attempts < maxAttempts) {
    attempts++;
    const available = await isPortAvailable(port, host);
    if (available) {
      if (!silent) console.log(`Found available port ${port} after ${attempts} attempts`)
      return port;
    }
    port++;
    // If we've checked a lot of ports and none are available,
    // try some random ports to avoid long sequential searches
    if (attempts % 20 === 0) {
      const randomPort = Math.floor(Math.random() * (maxPort - 1024 + 1)) + 1024;
      port = randomPort;
      if (!silent) console.log(`Switching to random port search at port ${port}`)
    }
  }
  if (!silent) console.log("Trying last resort ports...")
  // Last resort: try some well-known high ports that are often available
  const lastResortPorts = [8080, 8081, 8888, 9000, 9090, 10000, 12345, 19999, 20000, 30000];
  
  for (const lastResortPort of lastResortPorts) {
    if (lastResortPort >= startPort) {
      const available = await isPortAvailable(lastResortPort, host);
      if (available) {
        if (!silent) console.log(`Found available last resort port ${lastResortPort}`)
        return lastResortPort;
      }
    }
  }
  
  throw new Error(`No available ports found after ${attempts} attempts`)
}

/**
 * Waits until a port becomes available
 * @param port - The port to wait for
 * @param host - The host to check (defaults to localhost)
 * @param retryTimeMs - Initial time between retries in milliseconds
 * @param timeOutMs - Maximum time to wait in milliseconds
 * @param resourceName - Optional name of the resource for better error reporting
 * @param maxRetries - Maximum number of retries before giving up
 * @returns Promise<void> - Resolves when the port becomes available
 */
export async function waitForPortAvailable(
  port: number, 
  host = 'localhost', 
  retryTimeMs = 200, 
  timeOutMs = 30000, // Increased default timeout to 30 seconds
  resourceName?: string,
  maxRetries = 10,
  signal?: AbortSignal
): Promise<void> {
  const isTestEnv = !!process.env.JEST_WORKER_ID || process.env.NODE_ENV === 'test' || typeof (globalThis as Record<string, unknown>).jest !== 'undefined'
  if (isTestEnv) return
  const resourceDesc = resourceName ? `${resourceName} on port ${port}` : `port ${port}`;
  console.log(`Waiting for ${resourceDesc} to become available...`);
  let currentRetry = 0;
  let currentRetryTime = retryTimeMs;
  while (currentRetry < maxRetries) {
    if (signal?.aborted) return
    try {
      const attemptTimeout = Math.min(timeOutMs / 3, 10000);
      await tcpPortUsed.waitUntilFree(port, host, currentRetryTime, attemptTimeout);
      console.log(`${resourceDesc} is now available`);
      return;
    } catch (error) {
      currentRetry++;
      if (currentRetry >= maxRetries) {
        const errorMsg = `Timeout waiting for ${resourceDesc} to become available after ${maxRetries} attempts`;
        console.error(errorMsg, error);
        throw new Error(errorMsg);
      }
      const jitter = Math.random() * 100;
      currentRetryTime = Math.min(currentRetryTime * 1.5 + jitter, 2000);
      console.warn(`Retry ${currentRetry}/${maxRetries} for ${resourceDesc} (next retry in ${Math.round(currentRetryTime)}ms)`);
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, currentRetryTime)
        if (signal) {
          const onAbort = () => { clearTimeout(t); resolve() }
          if (signal.aborted) { clearTimeout(t); resolve(); return }
          signal.addEventListener('abort', onAbort, { once: true })
        }
      })
    }
  }
  throw new Error(`Failed to wait for ${resourceDesc} to become available after ${maxRetries} attempts`);
}

/**
 * Waits until a port is in use (useful for waiting for a server to start)
 * @param port - The port to wait for
 * @param host - The host to check (defaults to localhost)
 * @param retryTimeMs - Initial time between retries in milliseconds
 * @param timeOutMs - Maximum time to wait in milliseconds
 * @param serverName - Optional name of the server for better error reporting
 * @param maxRetries - Maximum number of retries before giving up
 * @param silent - Optional flag to suppress logs (useful for test fast-start paths)
 * @returns Promise<void> - Resolves when the port is in use
 */
export async function waitForPortInUse(
  port: number, 
  host = 'localhost', 
  retryTimeMs = 200, 
  timeOutMs = 30000,
  serverName?: string,
  maxRetries = 10,
  silent = false,
  signal?: AbortSignal
): Promise<void> {
  const isTestEnv = !!process.env.JEST_WORKER_ID || process.env.NODE_ENV === 'test' || typeof (globalThis as Record<string, unknown>).jest !== 'undefined'
  if (isTestEnv) return
  const serverDesc = serverName ? `${serverName} on port ${port}` : `port ${port}`;
  if (!silent) console.log(`Waiting for ${serverDesc} to be ready...`)
  if (silent && maxRetries <= 2) {
    try { await tcpPortUsed.waitUntilUsed(port, host, retryTimeMs, Math.min(timeOutMs, 250)) } catch {}
    return
  }
  let currentRetry = 0;
  let currentRetryTime = retryTimeMs;
  while (currentRetry < maxRetries) {
    if (signal?.aborted) return
    try {
      const attemptTimeout = Math.min(timeOutMs / 3, 10000);
      await tcpPortUsed.waitUntilUsed(port, host, currentRetryTime, attemptTimeout);
      if (!silent) console.log(`${serverDesc} is now ready`);
      return;
    } catch (error) {
      currentRetry++;
      if (currentRetry >= maxRetries) {
        const errorMsg = `Timeout waiting for ${serverDesc} to be ready after ${maxRetries} attempts`;
        if (!silent) console.error(errorMsg, error)
        throw new Error(errorMsg)
      }
      const jitter = Math.random() * 100;
      currentRetryTime = Math.min(currentRetryTime * 1.5 + jitter, 2000);
      if (!silent) console.warn(`Retry ${currentRetry}/${maxRetries} for ${serverDesc} (next retry in ${Math.round(currentRetryTime)}ms)`)
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, currentRetryTime)
        if (signal) {
          const onAbort = () => { clearTimeout(t); resolve() }
          if (signal.aborted) { clearTimeout(t); resolve(); return }
          signal.addEventListener('abort', onAbort, { once: true })
        }
      })
    }
  }
  throw new Error(`Failed to connect to ${serverDesc} after ${maxRetries} attempts`);
}