import { startServer } from './server';

module.exports = async () => {
  console.log('\nStarting Mock MCP Server...');
  await startServer();
  console.log('Mock MCP Server started.');
};
