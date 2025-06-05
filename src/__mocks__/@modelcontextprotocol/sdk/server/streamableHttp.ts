class StreamableHTTPServerTransport {
  constructor() {}
  async start() {}
  async close() {}
  async handleRequest(req, res) {
    res.end();
  }
}
module.exports = { StreamableHTTPServerTransport };
