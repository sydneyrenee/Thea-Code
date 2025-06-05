import { stopServer } from './server';

export const ollamaTeardown = async (): Promise<void> => {
  console.log('\nStopping Mock Ollama Server...');
  await stopServer();
  console.log('Mock Ollama Server stopped.');
};