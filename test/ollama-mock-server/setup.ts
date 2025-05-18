import { startServer } from './server';

module.exports = async () => {
  console.log('\nStarting Mock Ollama Server...');
  await startServer();
  console.log('Mock Ollama Server started.');
};