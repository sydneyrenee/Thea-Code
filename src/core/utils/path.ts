/**
 * Path Utility Functions and Extensions
 * 
 * This module provides utility functions and extensions for working with file paths,
 * particularly for normalizing paths across different operating systems.
 */

// Extend the String prototype with a toPosix method
declare global {
  interface String {
    /**
     * Converts a path string to use forward slashes (POSIX style) regardless of platform
     * This is useful for consistent path handling in tests and cross-platform code
     */
    toPosix(): string;
  }
}

// Implement the toPosix method on the String prototype
String.prototype.toPosix = function(): string {
  // Replace all backslashes with forward slashes
  return this.replace(/\\/g, '/');
};

/**
 * Converts a path to use forward slashes (POSIX style) regardless of platform
 * @param path The path to convert
 * @returns The path with forward slashes
 */
export function toPosixPath(path: string): string {
  return path.replace(/\\/g, '/');
}

/**
 * Normalizes a path by converting backslashes to forward slashes and removing trailing slashes
 * @param path The path to normalize
 * @returns The normalized path
 */
export function normalizePath(path: string): string {
  // Convert to POSIX style and remove trailing slashes
  return path.replace(/\\/g, '/').replace(/\/+$/, '');
}

// Export the module to ensure it's not tree-shaken
export default {};