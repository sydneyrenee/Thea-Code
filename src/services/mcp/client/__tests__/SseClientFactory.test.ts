/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
import { SseClientFactory } from '../SseClientFactory';
import { McpClient } from '../McpClient';

// Mock the MCP SDK
jest.mock('@modelcontextprotocol/sdk/client', () => ({
  Client: jest.fn().mockImplementation((info) => ({
    connect: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    listTools: jest.fn().mockResolvedValue({ tools: [] }),
    callTool: jest.fn().mockResolvedValue({ content: [] }),
  }))
}));

jest.mock('@modelcontextprotocol/sdk/client/sse', () => ({
  SSEClientTransport: jest.fn().mockImplementation((url) => ({
    url: url.toString()
  }))
}));

describe('SseClientFactory', () => {
  const testUrl = new URL('http://localhost:3000');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createClient', () => {
    it('should create an SDK client when SDK is available', async () => {
      const client = await SseClientFactory.createClient(testUrl);

      expect(client).toBeInstanceOf(McpClient);
    });

    it('should fall back to mock client when SDK is not available', async () => {
      // Mock require to throw an error
      const originalRequire = require;
      (global as any).require = jest.fn().mockImplementation((module) => {
        if (module.includes('@modelcontextprotocol/sdk')) {
          throw new Error('Module not found');
        }
        return originalRequire(module);
      });

      const client = await SseClientFactory.createClient(testUrl);

      expect(client).toBeInstanceOf(McpClient);

      // Restore original require
      (global as any).require = originalRequire;
    });

    it('should create SDK client with correct client info', async () => {
      const MockClient = require('@modelcontextprotocol/sdk/client').Client;
      
      await SseClientFactory.createClient(testUrl);

      expect(MockClient).toHaveBeenCalledWith({
        name: 'TheaCodeMcpClient',
        version: '1.0.0'
      });
    });
  });

  describe('SDK client wrapper', () => {
    let client: McpClient;

    beforeEach(async () => {
      client = await SseClientFactory.createClient(testUrl);
    });

    it('should connect using transport', async () => {
      const transport = { url: testUrl.toString() };
      
      await client.connect(transport);

      const MockClient = require('@modelcontextprotocol/sdk/client').Client;
      const mockInstance = MockClient.mock.results[0].value;
      expect(mockInstance.connect).toHaveBeenCalledWith(transport);
    });

    it('should close connection', async () => {
      await client.close();

      const MockClient = require('@modelcontextprotocol/sdk/client').Client;
      const mockInstance = MockClient.mock.results[0].value;
      expect(mockInstance.close).toHaveBeenCalled();
    });

    it('should list tools', async () => {
      const result = await client.listTools();

      expect(result).toEqual({ tools: [] });
      
      const MockClient = require('@modelcontextprotocol/sdk/client').Client;
      const mockInstance = MockClient.mock.results[0].value;
      expect(mockInstance.listTools).toHaveBeenCalled();
    });

    it('should call tool', async () => {
      const params = { name: 'test_tool', arguments: {} };
      const result = await client.callTool(params);

      expect(result).toEqual({ content: [] });
      
      const MockClient = require('@modelcontextprotocol/sdk/client').Client;
      const mockInstance = MockClient.mock.results[0].value;
      expect(mockInstance.callTool).toHaveBeenCalledWith(params);
    });
  });

  describe('mock client fallback', () => {
    let client: McpClient;

    beforeEach(async () => {
      // Mock require to throw an error to trigger fallback
      const originalRequire = require;
      (global as any).require = jest.fn().mockImplementation((module) => {
        if (module.includes('@modelcontextprotocol/sdk')) {
          throw new Error('Module not found');
        }
        return originalRequire(module);
      });

      client = await SseClientFactory.createClient(testUrl);

      // Restore original require
      (global as any).require = originalRequire;
    });

    it('should connect without error', async () => {
      await expect(client.connect({})).resolves.toBeUndefined();
    });

    it('should close without error', async () => {
      await expect(client.close()).resolves.toBeUndefined();
    });

    it('should list tools returning empty array', async () => {
      const result = await client.listTools();
      expect(result).toEqual({ tools: [] });
    });

    it('should call tool returning empty content', async () => {
      const result = await client.callTool({ name: 'test' });
      expect(result).toEqual({ content: [] });
    });
  });
});