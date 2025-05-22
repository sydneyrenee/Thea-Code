import { startServer } from './server';

export default async () => {
  console.log('\nStarting Mock MCP Server...');
  await startServer();
  console.log('Mock MCP Server started.');
};
