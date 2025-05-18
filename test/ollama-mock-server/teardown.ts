import { stopServer } from './server';

module.exports = async () => {
  console.log('\nStopping Mock Ollama Server...');
  await stopServer();
  console.log('Mock Ollama Server stopped.');
};