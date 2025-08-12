const http = require('http');
const crypto = require('crypto');

// Simple WebSocket client implementation
class WebSocketClient {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.readyState = 0; // CONNECTING
    
    const urlParts = new URL(url);
    this.host = urlParts.hostname;
    this.port = urlParts.port || (urlParts.protocol === 'wss:' ? 443 : 80);
    this.path = urlParts.pathname;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const key = crypto.randomBytes(16).toString('base64');
      
      const options = {
        hostname: this.host,
        port: this.port,
        path: this.path,
        method: 'GET',
        headers: {
          'Upgrade': 'websocket',
          'Connection': 'Upgrade',
          'Sec-WebSocket-Key': key,
          'Sec-WebSocket-Version': '13'
        }
      };

      const req = http.request(options);
      
      req.on('upgrade', (res, socket, head) => {
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
        
        this.emit('open');
        resolve();
      });
      
      req.on('error', (error) => {
        this.readyState = 3; // CLOSED
        reject(error);
      });
      
      req.end();
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
    if (this.readyState !== 1 || !this.socket) return;
    
    const payload = Buffer.from(data, 'utf8');
    const payloadLength = payload.length;
    
    // Generate mask
    const maskKey = crypto.randomBytes(4);
    
    // Apply mask
    const maskedPayload = Buffer.allocUnsafe(payloadLength);
    for (let i = 0; i < payloadLength; i++) {
      maskedPayload[i] = payload[i] ^ maskKey[i % 4];
    }
    
    let frame;
    if (payloadLength < 126) {
      frame = Buffer.allocUnsafe(6 + payloadLength);
      frame[0] = 0x81; // FIN + text frame
      frame[1] = 0x80 | payloadLength; // MASK + length
      maskKey.copy(frame, 2);
      maskedPayload.copy(frame, 6);
    } else if (payloadLength < 65536) {
      frame = Buffer.allocUnsafe(8 + payloadLength);
      frame[0] = 0x81;
      frame[1] = 0x80 | 126; // MASK + extended length
      frame.writeUInt16BE(payloadLength, 2);
      maskKey.copy(frame, 4);
      maskedPayload.copy(frame, 8);
    } else {
      frame = Buffer.allocUnsafe(14 + payloadLength);
      frame[0] = 0x81;
      frame[1] = 0x80 | 127; // MASK + extended length
      frame.writeUInt32BE(0, 2); // high 32 bits
      frame.writeUInt32BE(payloadLength, 6);
      maskKey.copy(frame, 10);
      maskedPayload.copy(frame, 14);
    }
    
    this.socket.write(frame);
  }

  close() {
    if (this.readyState === 1 && this.socket) {
      this.readyState = 2; // CLOSING
      const maskKey = crypto.randomBytes(4);
      const closeFrame = Buffer.from([0x88, 0x80, ...maskKey]); // Close frame with mask
      this.socket.write(closeFrame);
    }
    if (this.socket) {
      this.socket.end();
    }
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

// Configuration
const PUBLIC_PROXY_URL = process.env.PUBLIC_PROXY_URL || 'ws://public-proxy:80/tunnel';
const BACKEND_SERVICE_URL = process.env.BACKEND_SERVICE_URL || 'http://httpbin.org';
const HEALTH_PORT = process.env.HEALTH_PORT || 8080;
const RECONNECT_INTERVAL = parseInt(process.env.RECONNECT_INTERVAL) || 5000;

let ws = null;
let reconnectTimeout = null;

// Health check server
const healthServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    const isConnected = ws && ws.readyState === 1;
    const status = isConnected ? 200 : 503;
    const message = isConnected ? 'Private proxy is healthy and connected' : 'Private proxy is not connected to public proxy';
    
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: isConnected ? 'healthy' : 'unhealthy',
      message: message,
      connected: isConnected,
      publicProxyUrl: PUBLIC_PROXY_URL,
      backendServiceUrl: BACKEND_SERVICE_URL,
      timestamp: new Date().toISOString()
    }));
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

healthServer.listen(HEALTH_PORT, () => {
  console.log(`[${new Date().toISOString()}] Health check server listening on port ${HEALTH_PORT}`);
});

function connectToPublicProxy() {
  console.log(`[${new Date().toISOString()}] Connecting to public proxy at ${PUBLIC_PROXY_URL}`);
  
  try {
    ws = new WebSocketClient(PUBLIC_PROXY_URL);
    
    ws.on('open', () => {
      console.log(`[${new Date().toISOString()}] Connected to public proxy successfully`);
      
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
    });
    
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data);
        
        if (message.type === 'connected') {
          console.log(`[${new Date().toISOString()}] Tunnel established: ${message.message}`);
        } else if (message.type === 'request') {
          await handleProxiedRequest(message);
        } else if (message.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Error processing message:`, error);
      }
    });
    
    ws.on('close', () => {
      console.log(`[${new Date().toISOString()}] Connection to public proxy closed`);
      scheduleReconnect();
    });
    
    ws.on('error', (error) => {
      console.error(`[${new Date().toISOString()}] WebSocket error:`, error);
      scheduleReconnect();
    });
    
    ws.connect().catch((error) => {
      console.error(`[${new Date().toISOString()}] Failed to connect:`, error);
      scheduleReconnect();
    });
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Failed to create WebSocket connection:`, error);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimeout) {
    return;
  }
  
  console.log(`[${new Date().toISOString()}] Scheduling reconnection in ${RECONNECT_INTERVAL}ms`);
  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    connectToPublicProxy();
  }, RECONNECT_INTERVAL);
}

async function handleProxiedRequest(requestMessage) {
  const { requestId, method, url, headers, body } = requestMessage;
  
  console.log(`[${new Date().toISOString()}] Processing ${method} ${url} (Request ID: ${requestId})`);
  
  try {
    if (url === '/echo' || url.startsWith('/echo?')) {
      handleEchoRequest(requestMessage);
      return;
    }
    
    if (BACKEND_SERVICE_URL === 'http://httpbin.org' || !BACKEND_SERVICE_URL) {
      handleDemoRequest(requestMessage);
      return;
    }
    
    await forwardToBackend(requestMessage);
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error handling request ${requestId}:`, error);
    
    sendResponse(requestId, {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message,
        requestId: requestId
      })
    });
  }
}

function handleEchoRequest(requestMessage) {
  const { requestId, method, url, headers, body } = requestMessage;
  
  const response = {
    echo: 'Request received by private proxy via WebSocket tunnel',
    method: method,
    url: url,
    headers: headers,
    body: body ? (function() {
      try { return JSON.parse(body); } catch { return body; }
    })() : null,
    timestamp: new Date().toISOString(),
    requestId: requestId
  };
  
  sendResponse(requestId, {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(response, null, 2)
  });
}

function handleDemoRequest(requestMessage) {
  const { requestId, method, url, headers, body } = requestMessage;
  
  const response = {
    message: 'Request processed by private proxy via WebSocket tunnel',
    method: method,
    url: url,
    headers: headers,
    hasBody: !!body,
    bodyLength: body ? body.length : 0,
    timestamp: new Date().toISOString(),
    backendService: 'demo-mode',
    requestId: requestId
  };
  
  sendResponse(requestId, {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(response, null, 2)
  });
}

async function forwardToBackend(requestMessage) {
  const { requestId, method, url, headers, body } = requestMessage;
  
  return new Promise((resolve, reject) => {
    const backendUrl = new URL(url, BACKEND_SERVICE_URL);
    
    const options = {
      hostname: backendUrl.hostname,
      port: backendUrl.port || (backendUrl.protocol === 'https:' ? 443 : 80),
      path: backendUrl.pathname + backendUrl.search,
      method: method,
      headers: headers
    };
    
    const req = http.request(options, (res) => {
      let responseBody = '';
      
      res.on('data', (chunk) => {
        responseBody += chunk;
      });
      
      res.on('end', () => {
        sendResponse(requestId, {
          statusCode: res.statusCode,
          headers: res.headers,
          body: responseBody
        });
        resolve();
      });
    });
    
    req.on('error', (error) => {
      console.error(`[${new Date().toISOString()}] Backend request error for ${requestId}:`, error);
      sendResponse(requestId, {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Bad gateway',
          message: 'Failed to forward request to backend service',
          target: BACKEND_SERVICE_URL,
          requestId: requestId
        })
      });
      reject(error);
    });
    
    if (body) {
      req.write(body);
    }
    
    req.end();
  });
}

function sendResponse(requestId, response) {
  if (ws && ws.readyState === 1) {
    const responseMessage = {
      type: 'response',
      requestId: requestId,
      statusCode: response.statusCode,
      headers: response.headers,
      body: response.body
    };
    
    try {
      ws.send(JSON.stringify(responseMessage));
      console.log(`[${new Date().toISOString()}] Response sent for request ${requestId} (Status: ${response.statusCode})`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error sending response for request ${requestId}:`, error);
    }
  } else {
    console.error(`[${new Date().toISOString()}] Cannot send response for request ${requestId}: WebSocket not connected`);
  }
}

// Start the connection
console.log(`[${new Date().toISOString()}] Starting private proxy WebSocket client`);
console.log(`[${new Date().toISOString()}] Public proxy URL: ${PUBLIC_PROXY_URL}`);
console.log(`[${new Date().toISOString()}] Backend service URL: ${BACKEND_SERVICE_URL}`);

connectToPublicProxy();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log(`[${new Date().toISOString()}] Received SIGTERM, shutting down gracefully`);
  if (ws) {
    ws.close();
  }
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
  }
  healthServer.close(() => {
    console.log(`[${new Date().toISOString()}] Health server closed`);
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log(`[${new Date().toISOString()}] Received SIGINT, shutting down gracefully`);
  if (ws) {
    ws.close();
  }
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
  }
  healthServer.close(() => {
    console.log(`[${new Date().toISOString()}] Health server closed`);
    process.exit(0);
  });
});