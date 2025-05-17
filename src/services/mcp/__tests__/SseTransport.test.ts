import { EmbeddedMcpServer } from '../EmbeddedMcpServer';
import { SseClientFactory } from '../client/SseClientFactory';
import { SseTransportConfig } from '../config/SseTransportConfig';

describe('SSE Transport', () => {
  let server: EmbeddedMcpServer;
  
  beforeEach(() => {
    // Create a new server with a random port for each test
    server = new EmbeddedMcpServer({
      port: 0, // Use random port for tests
      hostname: 'localhost'
    });
  });
  
  afterEach(async () => {
    // Clean up after each test
    await server.stop();
  });
  
  test('should start server and get URL', async () => {
    // Start the server
    await server.start();
    
    // Get the server URL
    const url = server.getServerUrl();
    
    // Verify that the URL is defined
    expect(url).toBeDefined();
    expect(url?.protocol).toBe('http:');
    expect(url?.hostname).toBe('localhost');
    expect(url?.port).toBeTruthy(); // Should have a port assigned
  });
  
  test('should connect client to server', async () => {
    // Start the server
    await server.start();
    
    // Get the server URL
    const url = server.getServerUrl();
    expect(url).toBeDefined();
    
    // Register a test tool
    server.registerTool(
      'test_tool',
      'A test tool',
      {
        message: { type: 'string' }
      },
      async (args) => ({
        content: [{ type: 'text', text: `Received: ${args.message}` }]
      })
    );
    
    // Create a client and connect to the server
    const client = await SseClientFactory.createClient(url!);
    
    try {
      // List available tools
      const toolsResult = await client.listTools();
      expect(toolsResult.tools).toHaveLength(1);
      expect(toolsResult.tools[0].name).toBe('test_tool');
      
      // Call the tool
      const result = await client.callTool({
        name: 'test_tool',
        arguments: { message: 'Hello, world!' }
      });
      
      // Verify the result
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toBe('Received: Hello, world!');
    } finally {
      // Close the client
      await client.close();
    }
  });
  
  test('should handle multiple clients', async () => {
    // Start the server
    await server.start();
    
    // Get the server URL
    const url = server.getServerUrl();
    expect(url).toBeDefined();
    
    // Register a test tool
    server.registerTool(
      'test_tool',
      'A test tool',
      {
        message: { type: 'string' }
      },
      async (args) => ({
        content: [{ type: 'text', text: `Received: ${args.message}` }]
      })
    );
    
    // Create multiple clients
    const client1 = await SseClientFactory.createClient(url!);
    const client2 = await SseClientFactory.createClient(url!);
    const client3 = await SseClientFactory.createClient(url!);
    
    try {
      // Call the tool from each client
      const [result1, result2, result3] = await Promise.all([
        client1.callTool({
          name: 'test_tool',
          arguments: { message: 'Client 1' }
        }),
        client2.callTool({
          name: 'test_tool',
          arguments: { message: 'Client 2' }
        }),
        client3.callTool({
          name: 'test_tool',
          arguments: { message: 'Client 3' }
        })
      ]);
      
      // Verify the results
      expect(result1.content[0].text).toBe('Received: Client 1');
      expect(result2.content[0].text).toBe('Received: Client 2');
      expect(result3.content[0].text).toBe('Received: Client 3');
    } finally {
      // Close all clients
      await Promise.all([
        client1.close(),
        client2.close(),
        client3.close()
      ]);
    }
  });
  
  test('should use custom configuration', async () => {
    // Create a server with custom configuration
    const customConfig: SseTransportConfig = {
      port: 8080,
      hostname: '127.0.0.1',
      allowExternalConnections: true,
      eventsPath: '/custom/events',
      apiPath: '/custom/api'
    };
    
    const customServer = new EmbeddedMcpServer(customConfig);
    
    try {
      // Start the server
      await customServer.start();
      
      // Get the server URL
      const url = customServer.getServerUrl();
      
      // Verify that the URL uses the custom configuration
      expect(url).toBeDefined();
      expect(url?.hostname).toBe('127.0.0.1');
      
      // Note: We can't verify the port is exactly 8080 because it might be changed
      // if the port is already in use, but we can verify it's a valid port
      expect(url?.port).toBeTruthy();
    } finally {
      // Clean up
      await customServer.stop();
    }
  });
  
  test('should handle server restart', async () => {
    // Start the server
    await server.start();
    
    // Get the server URL
    const url1 = server.getServerUrl();
    expect(url1).toBeDefined();
    
    // Stop the server
    await server.stop();
    
    // Verify that the URL is no longer available
    expect(server.getServerUrl()).toBeUndefined();
    
    // Restart the server
    await server.start();
    
    // Get the new server URL
    const url2 = server.getServerUrl();
    expect(url2).toBeDefined();
    
    // The new URL should be different from the old one (different port)
    expect(url2?.toString()).not.toBe(url1?.toString());
  });
});