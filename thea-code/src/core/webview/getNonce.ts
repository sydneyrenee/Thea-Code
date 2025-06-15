/**
 * Generates a nonce string for use in content security policy.
 * A nonce is a random value that can be used only once.
 * 
 * @returns A random string to be used as a nonce
 */
export function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}