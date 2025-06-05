import ollamaSetup from './ollama-mock-server/setup.ts';
import mcpSetup from './mcp-mock-server/setup.ts';
import openaiSetup from './openai-mock/setup.ts';

module.exports = async () => {
  await ollamaSetup();
  await mcpSetup();
  await openaiSetup();
};
