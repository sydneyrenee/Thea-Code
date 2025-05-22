import { startServer } from './server';

export default async () => {
  console.log('\nStarting Mock Ollama Server...');
  await startServer();
  console.log('Mock Ollama Server started.');
};