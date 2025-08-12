# Cross-Server Deployment Guide

This guide demonstrates how to deploy the WebSocket-based proxy architecture across different servers.

## Scenario

- **Server 1 (Public)**: `10.0.1.100` - Accessible from internet
- **Server 2 (Private)**: `10.0.1.200` - Behind firewall/NAT, can reach Server 1

## Server 1 (Public Proxy)

### 1. Copy Files
```bash
# Copy only the public proxy files
scp -r public-proxy/ user@10.0.1.100:~/proxy-setup/
scp docker-compose.public.yml user@10.0.1.100:~/proxy-setup/
```

### 2. Deploy Public Proxy
```bash
# On Server 1
cd ~/proxy-setup
docker-compose -f docker-compose.public.yml up -d --build

# Verify deployment
curl http://localhost/health
```

### 3. Firewall Configuration
```bash
# Allow incoming connections on port 80
sudo ufw allow 80/tcp
```

## Server 2 (Private Proxy)

### 1. Copy Files
```bash
# Copy only the private proxy files
scp -r private-proxy/ user@10.0.1.200:~/proxy-setup/
scp docker-compose.private.yml user@10.0.1.200:~/proxy-setup/
```

### 2. Configure Connection
```bash
# Edit docker-compose.private.yml
nano docker-compose.private.yml
```

Update the environment variables:
```yaml
environment:
  # Point to Server 1's IP address
  - PUBLIC_PROXY_URL=ws://10.0.1.100:80/tunnel
  # Configure your actual backend service
  - BACKEND_SERVICE_URL=http://your-api-server:3000
  - HEALTH_PORT=8080
  - RECONNECT_INTERVAL=5000
```

### 3. Deploy Private Proxy
```bash
# On Server 2
cd ~/proxy-setup
docker-compose -f docker-compose.private.yml up -d --build

# Check connection status
curl http://localhost:8080/health
```

## Testing Cross-Server Setup

### 1. Test Public Proxy
```bash
# From anywhere with internet access
curl http://10.0.1.100/health
```

### 2. Test WebSocket Tunnel
```bash
# This should go through the tunnel to private proxy
curl http://10.0.1.100/echo
```

### 3. Test Request Forwarding
```bash
# POST request with data
curl -X POST http://10.0.1.100/echo \
  -H "Content-Type: application/json" \
  -d '{"message": "Cross-server tunnel test"}'
```

## Monitoring

### Connection Status
```bash
# On Server 2 - Check if connected to public proxy
curl http://localhost:8080/health | jq '.connected'
```

### Logs
```bash
# Server 1 - Public proxy logs
docker logs public-proxy

# Server 2 - Private proxy logs  
docker logs private-proxy
```

## Security Considerations

### SSL/TLS (Production)
For production deployments, use SSL termination:

1. **Public Proxy** with SSL proxy (nginx/traefik)
2. **WebSocket over TLS**: `wss://` instead of `ws://`

### Network Security
- Private proxy initiates all connections (firewall-friendly)
- No incoming connections required to private server
- WebSocket tunnel provides secure communication channel

## Troubleshooting

### Connection Issues
```bash
# Test network connectivity from Server 2 to Server 1
telnet 10.0.1.100 80

# Check Docker logs for connection errors
docker logs private-proxy | grep -i error
```

### Firewall Issues
```bash
# On Server 1, ensure port 80 is accessible
ss -tlnp | grep :80
sudo ufw status
```

### DNS Resolution
If using hostnames instead of IP addresses, ensure proper DNS resolution:
```bash
# Test DNS resolution from Server 2
nslookup your-public-server.com
```

## Example Backend Integration

### API Server Configuration
```yaml
# docker-compose.private.yml on Server 2
environment:
  - PUBLIC_PROXY_URL=ws://10.0.1.100:80/tunnel
  - BACKEND_SERVICE_URL=http://api-server:3000  # Your actual API
```

### Multiple Backend Routes
Modify `private-proxy/client.js` for routing:
```javascript
// Route different paths to different backends
if (url.startsWith('/api/')) {
    // Forward to API server
    await forwardToBackend(requestMessage, 'http://api-server:3000');
} else if (url.startsWith('/files/')) {
    // Forward to file server
    await forwardToBackend(requestMessage, 'http://file-server:8080');
} else {
    // Default handler
    handleDemoRequest(requestMessage);
}
```

## Performance Tuning

### Connection Settings
```yaml
environment:
  - RECONNECT_INTERVAL=3000  # Faster reconnection
  - HEALTH_PORT=8080
  - REQUEST_TIMEOUT=30000    # 30 second timeout
```

### Resource Limits
```yaml
deploy:
  resources:
    limits:
      memory: 512M
      cpus: '0.5'
```

This architecture provides a robust solution for cross-server proxy deployment with automatic reconnection and complete request/response preservation.