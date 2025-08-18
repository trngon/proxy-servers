# WebSocket Proxy Servers

A WebSocket-based proxy server architecture that enables cross-server deployment with tunnel-based communication. This solution allows a private proxy server to securely connect to a public proxy server through a WebSocket tunnel, enabling request forwarding even when the private proxy is behind firewalls or NAT.

## Architecture

```
Internet → Public Proxy (WebSocket Server) ←─ WebSocket Tunnel ←─ Private Proxy (WebSocket Client)
```

### Key Components

- **Public Proxy Server**: WebSocket server that accepts external requests and forwards them through established tunnels
- **Private Proxy Client**: WebSocket client that connects to the public proxy and processes forwarded requests
- **WebSocket Tunnel**: Persistent bidirectional communication channel for request/response forwarding

### Deployment Scenarios

#### Same-Server Deployment (Testing)
Both proxies run on the same server using Docker Compose for development and testing.

#### Cross-Server Deployment (Production)
- **Server 1**: Public proxy server (accessible from internet)
- **Server 2**: Private proxy client (behind firewall/NAT, initiates connection to Server 1)

## Features

- ✅ **Cross-Server Support**: Deploy proxies on different servers
- ✅ **WebSocket Tunneling**: Persistent tunnel for request forwarding
- ✅ **Request Preservation**: Complete HTTP method, header, and body preservation
- ✅ **Connection Resilience**: Automatic reconnection with configurable intervals
- ✅ **Backend Integration**: Configurable backend service forwarding
- ✅ **Health Monitoring**: Built-in health checks and status reporting
- ✅ **Security**: Private proxy initiates connection (firewall-friendly)

## Quick Start

### Same-Server Deployment (Testing)

1. **Clone and start services**:
```bash
git clone <repository-url>
cd proxy-servers
docker-compose up -d --build
```

2. **Test the setup**:
```bash
# Health check
curl http://localhost/health

# Test request forwarding
curl -X POST http://localhost/echo \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

### Cross-Server Deployment (Production)

#### Server 1 (Public Proxy)

1. **Deploy public proxy**:
```bash
# Copy public-proxy directory to Server 1
docker-compose -f docker-compose.public.yml up -d --build
```

2. **Verify public proxy is running**:
```bash
curl http://SERVER1_IP/health
```

#### Server 2 (Private Proxy)

1. **Configure connection**:
```bash
# Edit docker-compose.private.yml
# Update PUBLIC_PROXY_URL with Server 1's IP:
# PUBLIC_PROXY_URL=ws://SERVER1_IP:80/tunnel
```

2. **Deploy private proxy**:
```bash
# Copy private-proxy directory to Server 2
docker-compose -f docker-compose.private.yml up -d --build
```

3. **Verify connection**:
```bash
# Check private proxy health
curl http://localhost:8080/health

# Test tunnel through public proxy
curl http://SERVER1_IP/echo
```

## Configuration

### Environment Variables

#### Public Proxy Server
- `PORT`: Server port (default: 80)

#### Private Proxy Client
- `PUBLIC_PROXY_URL`: WebSocket URL of public proxy (required for cross-server)
- `BACKEND_SERVICE_URL`: URL of backend service to forward requests to
- `HEALTH_PORT`: Health check server port (default: 8080)
- `RECONNECT_INTERVAL`: Reconnection interval in milliseconds (default: 5000)

### Example Configuration

```yaml
# docker-compose.private.yml
environment:
  - PUBLIC_PROXY_URL=ws://10.0.1.100:80/tunnel  # Public proxy server IP
  - BACKEND_SERVICE_URL=http://api-server:3000   # Your backend service
  - HEALTH_PORT=8080
  - RECONNECT_INTERVAL=5000
```

## Backend Integration

### Default Demo Mode

The private proxy includes a demo mode that returns request information:

```bash
curl http://public-proxy-ip/echo
```

### Custom Backend Service

Configure the private proxy to forward requests to your actual backend:

```yaml
environment:
  - BACKEND_SERVICE_URL=http://your-api-server:3000
```

### Multiple Backend Routes

Modify `private-proxy/client.js` to handle different routes:

```javascript
// Example: Route /api/* to backend API
if (url.startsWith('/api/')) {
    await forwardToBackend(requestMessage);
} else {
    handleDemoRequest(requestMessage);
}
```

## Monitoring and Debugging

### Health Checks

```bash
# Public proxy health
curl http://public-proxy-ip/health

# Private proxy health  
curl http://private-proxy-ip:8080/health
```

### Connection Status

The private proxy health endpoint shows tunnel connection status:

```json
{
  "status": "healthy",
  "message": "Private proxy is healthy and connected",
  "connected": true,
  "publicProxyUrl": "ws://public-proxy:80/tunnel",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### Logs

```bash
# View real-time logs
docker-compose logs -f

# Specific service logs
docker-compose logs -f private-proxy
docker-compose logs -f public-proxy
```

## Testing

Run the comprehensive test suite:

```bash
# Make test script executable
chmod +x test-proxy.sh

# Run tests
./test-proxy.sh
```

The test suite verifies:
- WebSocket tunnel establishment
- Request/response forwarding
- HTTP method preservation
- Header and body preservation
- Connection persistence
- Error handling

## Security Considerations

### Network Security
- Private proxy initiates connection (firewall-friendly)
- WebSocket tunnel encrypted in production (use `wss://` with SSL)
- No direct access required to private proxy

### SSL/TLS Configuration

For production, configure SSL termination:

```yaml
# Public proxy with SSL
environment:
  - SSL_CERT_PATH=/certs/cert.pem
  - SSL_KEY_PATH=/certs/key.pem
```

## Troubleshooting

### Connection Issues

1. **Private proxy can't connect**:
```bash
# Check network connectivity
docker exec private-proxy ping public-proxy-ip

# Verify public proxy WebSocket endpoint
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
  http://public-proxy-ip/tunnel
```

2. **Requests timing out**:
```bash
# Check tunnel status in private proxy logs
docker logs private-proxy | grep -i tunnel
```

3. **Service not starting**:
```bash
# Check container logs
docker logs public-proxy
docker logs private-proxy
```

### Common Issues

- **Port conflicts**: Change ports in docker-compose files
- **Firewall blocking**: Ensure port 80 is open on public proxy server
- **DNS issues**: Use IP addresses instead of hostnames in cross-server setup

## Development

### Project Structure

```
proxy-servers/
├── docker-compose.yml                  # Same-server deployment
├── docker-compose.public.yml           # Public proxy only
├── docker-compose.private.yml          # Private proxy only
├── public-proxy/
│   ├── Dockerfile                      # Public proxy container
│   ├── package.json                    # Node.js dependencies
│   └── server.js                       # WebSocket server implementation
├── private-proxy/
│   ├── Dockerfile                      # Private proxy container
│   ├── package.json                    # Node.js dependencies
│   └── client.js                       # WebSocket client implementation
├── test-proxy.sh                       # Comprehensive test suite
└── README.md                           # This documentation
```

### WebSocket Protocol

The tunnel uses a simple JSON-based protocol:

#### Request Message (Public → Private)
```json
{
  "type": "request",
  "requestId": "uuid",
  "method": "POST",
  "url": "/api/data",
  "headers": {...},
  "body": "..."
}
```

#### Response Message (Private → Public)
```json
{
  "type": "response",
  "requestId": "uuid",
  "statusCode": 200,
  "headers": {...},
  "body": "..."
}
```

### Contributing

1. Fork the repository
2. Create a feature branch
3. Test your changes with both same-server and cross-server scenarios
4. Submit a pull request

## Use Cases

- **Microservices**: Connect public-facing API gateway to private services
- **Edge Computing**: Forward requests from edge servers to private cloud services
- **Development**: Access local development servers from public test environments
- **Legacy Systems**: Modernize legacy system access without network changes

## Performance

- **Latency**: ~10-50ms additional overhead for WebSocket tunnel
- **Throughput**: Suitable for most API workloads (not optimized for high-bandwidth file transfers)
- **Connections**: Supports multiple concurrent requests through single tunnel

## License

[Add your license information here]
