import { stopServer } from './server';

module.exports = async () => {
  console.log('\nStopping Mock MCP Server...');
  await stopServer();
  console.log('Mock MCP Server stopped.');
};
