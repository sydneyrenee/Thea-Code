import { ollamaTeardown } from './ollama-mock-server/teardown.ts';
import { mcpTeardown } from './mcp-mock-server/teardown.ts';

module.exports = async () => {
  await mcpTeardown();
  await ollamaTeardown();
};
