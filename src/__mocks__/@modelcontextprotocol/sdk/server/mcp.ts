module.exports = {
  McpServer: class {
    constructor() {
      this.httpServer = {
        address: () => ({ port: 10000 }),
      };
      this.port = 10000;
    }
    start() {}
    async connect(transport) {
      if (transport && typeof transport.start === 'function') {
        await transport.start();
      }
    }
    stop() {}
  },
  ResourceTemplate: class {},
};
