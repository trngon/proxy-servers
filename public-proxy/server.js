const http = require('http');
const crypto = require('crypto');
const url = require('url');

// Simple WebSocket implementation using built-in modules
class WebSocketServer {
  constructor(options = {}) {
    this.server = options.server;
    this.path = options.path || '/';
    this.connections = new Map();
    
    if (this.server) {
      this.server.on('upgrade', (request, socket, head) => {
        this.handleUpgrade(request, socket, head);
      });
    }
  }

  handleUpgrade(request, socket, head) {
    const pathname = url.parse(request.url).pathname;
    
    if (pathname !== this.path) {
      socket.end();
      return;
    }

    const key = request.headers['sec-websocket-key'];
    if (!key) {
      socket.end();
      return;
    }

    const acceptKey = this.generateAcceptKey(key);
    
    const responseHeaders = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey}`,
      '', ''
    ].join('\r\n');

    socket.write(responseHeaders);

    const connection = new WebSocketConnection(socket);
    const connectionId = crypto.randomUUID();
    this.connections.set(connectionId, connection);

    this.emit('connection', connection, request);

    connection.on('close', () => {
      this.connections.delete(connectionId);
    });
  }

  generateAcceptKey(key) {
    const websocketMagicString = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
    const hash = crypto.createHash('sha1');
    hash.update(key + websocketMagicString);
    return hash.digest('base64');
  }

  emit(event, ...args) {
    if (this.listeners && this.listeners[event]) {
      this.listeners[event].forEach(listener => listener(...args));
    }
  }

  on(event, listener) {
    if (!this.listeners) this.listeners = {};
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(listener);
  }
}

class WebSocketConnection {
  constructor(socket) {
    this.socket = socket;
    this.readyState = 1; // OPEN
    
    this.socket.on('data', (buffer) => {
      this.handleData(buffer);
    });
    
    this.socket.on('close', () => {
      this.readyState = 3; // CLOSED
      this.emit('close');
    });
    
    this.socket.on('error', (error) => {
      this.emit('error', error);
    });
  }

  handleData(buffer) {
    try {
      // Simple frame parsing - just handle text frames
      if (buffer.length < 2) return;
      
      const firstByte = buffer[0];
      const secondByte = buffer[1];
      
      const opcode = firstByte & 0x0F;
      const masked = (secondByte & 0x80) === 0x80;
      let payloadLength = secondByte & 0x7F;
      
      let offset = 2;
      
      if (payloadLength === 126) {
        payloadLength = buffer.readUInt16BE(offset);
        offset += 2;
      } else if (payloadLength === 127) {
        // For simplicity, we'll handle up to 32-bit lengths
        offset += 4; // skip high 32 bits
        payloadLength = buffer.readUInt32BE(offset);
        offset += 4;
      }
      
      let maskKey = null;
      if (masked) {
        maskKey = buffer.slice(offset, offset + 4);
        offset += 4;
      }
      
      let payload = buffer.slice(offset, offset + payloadLength);
      
      if (masked && maskKey) {
        for (let i = 0; i < payload.length; i++) {
          payload[i] ^= maskKey[i % 4];
        }
      }
      
      if (opcode === 1) { // Text frame
        const message = payload.toString('utf8');
        this.emit('message', message);
      } else if (opcode === 8) { // Close frame
        this.close();
      }
    } catch (error) {
      this.emit('error', error);
    }
  }

  send(data) {
    if (this.readyState !== 1) return;
    
    const payload = Buffer.from(data, 'utf8');
    const payloadLength = payload.length;
    
    let frame;
    if (payloadLength < 126) {
      frame = Buffer.allocUnsafe(2 + payloadLength);
      frame[0] = 0x81; // FIN + text frame
      frame[1] = payloadLength;
      payload.copy(frame, 2);
    } else if (payloadLength < 65536) {
      frame = Buffer.allocUnsafe(4 + payloadLength);
      frame[0] = 0x81;
      frame[1] = 126;
      frame.writeUInt16BE(payloadLength, 2);
      payload.copy(frame, 4);
    } else {
      frame = Buffer.allocUnsafe(10 + payloadLength);
      frame[0] = 0x81;
      frame[1] = 127;
      frame.writeUInt32BE(0, 2); // high 32 bits
      frame.writeUInt32BE(payloadLength, 6);
      payload.copy(frame, 10);
    }
    
    this.socket.write(frame);
  }

  close() {
    if (this.readyState === 1) {
      this.readyState = 2; // CLOSING
      const closeFrame = Buffer.from([0x88, 0x00]); // Close frame
      this.socket.write(closeFrame);
    }
    this.socket.end();
  }

  emit(event, ...args) {
    if (this.listeners && this.listeners[event]) {
      this.listeners[event].forEach(listener => listener(...args));
    }
  }

  on(event, listener) {
    if (!this.listeners) this.listeners = {};
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(listener);
  }
}

// Store active tunnel connections
const tunnelConnections = new Map();
const pendingRequests = new Map();

function generateRequestId() {
  return crypto.randomUUID();
}

// HTTP server for handling incoming requests
const server = http.createServer((req, res) => {
  // Health check endpoint
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Public proxy WebSocket server is healthy\n');
    return;
  }

  // Check if we have any active tunnel connections
  if (tunnelConnections.size === 0) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'No active tunnel connections',
      message: 'Private proxy is not connected'
    }));
    return;
  }

  // Get the first available tunnel connection
  const tunnelId = Array.from(tunnelConnections.keys())[0];
  const tunnel = tunnelConnections.get(tunnelId);

  if (!tunnel || tunnel.readyState !== 1) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Tunnel connection not available',
      message: 'Private proxy connection is closed'
    }));
    return;
  }

  // Generate unique request ID
  const requestId = generateRequestId();

  // Collect request body
  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });

  req.on('end', () => {
    // Create request object to send through tunnel
    const requestData = {
      type: 'request',
      requestId: requestId,
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: body
    };

    // Store pending request
    pendingRequests.set(requestId, { res, timestamp: Date.now() });

    // Send request through tunnel
    try {
      tunnel.send(JSON.stringify(requestData));
      console.log(`[${new Date().toISOString()}] Forwarded ${req.method} ${req.url} to private proxy (Request ID: ${requestId})`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error sending request through tunnel:`, error);
      pendingRequests.delete(requestId);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Failed to forward request',
        message: error.message
      }));
    }
  });

  // Handle request timeout (30 seconds)
  const timeout = setTimeout(() => {
    if (pendingRequests.has(requestId)) {
      pendingRequests.delete(requestId);
      if (!res.headersSent) {
        res.writeHead(504, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Request timeout',
          message: 'Private proxy did not respond within 30 seconds'
        }));
      }
    }
  }, 30000);

  // Store timeout reference
  const pendingRequest = pendingRequests.get(requestId);
  if (pendingRequest) {
    pendingRequest.timeout = timeout;
  }
});

// WebSocket server for tunnel connections
const wss = new WebSocketServer({ 
  server: server,
  path: '/tunnel'
});

wss.on('connection', (ws, req) => {
  const tunnelId = generateRequestId();
  const clientIP = req.socket.remoteAddress;
  
  console.log(`[${new Date().toISOString()}] New tunnel connection established from ${clientIP} (Tunnel ID: ${tunnelId})`);
  
  // Store tunnel connection
  tunnelConnections.set(tunnelId, ws);

  // Send connection confirmation
  ws.send(JSON.stringify({
    type: 'connected',
    tunnelId: tunnelId,
    message: 'Tunnel established successfully'
  }));

  // Handle messages from private proxy
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      
      if (message.type === 'response' && message.requestId) {
        const pendingRequest = pendingRequests.get(message.requestId);
        
        if (pendingRequest) {
          const { res, timeout } = pendingRequest;
          
          // Clear timeout
          if (timeout) {
            clearTimeout(timeout);
          }
          
          // Remove from pending requests
          pendingRequests.delete(message.requestId);
          
          // Send response back to client
          if (!res.headersSent) {
            res.writeHead(message.statusCode || 200, message.headers || {});
            res.end(message.body || '');
            
            console.log(`[${new Date().toISOString()}] Response sent for request ${message.requestId} (Status: ${message.statusCode || 200})`);
          }
        } else {
          console.warn(`[${new Date().toISOString()}] Received response for unknown request ID: ${message.requestId}`);
        }
      } else if (message.type === 'ping') {
        // Respond to ping with pong
        ws.send(JSON.stringify({ type: 'pong' }));
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error processing message from private proxy:`, error);
    }
  });

  // Handle tunnel connection close
  ws.on('close', () => {
    console.log(`[${new Date().toISOString()}] Tunnel connection closed (ID: ${tunnelId})`);
    tunnelConnections.delete(tunnelId);
    
    // Clean up any pending requests for this tunnel
    for (const [requestId, pendingRequest] of pendingRequests.entries()) {
      const { res, timeout } = pendingRequest;
      if (timeout) {
        clearTimeout(timeout);
      }
      pendingRequests.delete(requestId);
      
      if (!res.headersSent) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Tunnel connection lost',
          message: 'Private proxy disconnected'
        }));
      }
    }
  });

  // Handle tunnel connection error
  ws.on('error', (error) => {
    console.error(`[${new Date().toISOString()}] Tunnel connection error (ID: ${tunnelId}):`, error);
  });

  // Send periodic ping to keep connection alive
  const pingInterval = setInterval(() => {
    if (ws.readyState === 1) {
      try {
        ws.send(JSON.stringify({ type: 'ping' }));
      } catch (error) {
        clearInterval(pingInterval);
      }
    } else {
      clearInterval(pingInterval);
    }
  }, 30000); // Ping every 30 seconds
});

// Start server
const PORT = process.env.PORT || 80;
server.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] Public proxy WebSocket server started on port ${PORT}`);
  console.log(`[${new Date().toISOString()}] WebSocket tunnel endpoint: ws://localhost:${PORT}/tunnel`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log(`[${new Date().toISOString()}] Received SIGTERM, shutting down gracefully`);
  server.close(() => {
    console.log(`[${new Date().toISOString()}] Server closed`);
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log(`[${new Date().toISOString()}] Received SIGINT, shutting down gracefully`);
  server.close(() => {
    console.log(`[${new Date().toISOString()}] Server closed`);
    process.exit(0);
  });
});