import { ollamaTeardown } from './ollama-mock-server/teardown';
import { mcpTeardown } from './mcp-mock-server/teardown';
import { openaiTeardown } from './openai-mock/teardown';
import { McpToolExecutor } from '../src/services/mcp/core/McpToolExecutor';

module.exports = async () => {
  await McpToolExecutor.getInstance().shutdown();
  await mcpTeardown();
  await ollamaTeardown();
  await openaiTeardown();
};
