# Proxy Servers

A Docker-based proxy server setup with public and private network architecture. This project implements a two-tier proxy system where a public-facing proxy forwards requests to a private proxy server.

## Architecture

```
Internet → Public Proxy (port 80) → Private Proxy (port 8080, internal only)
```

- **Public Proxy**: Accessible from the internet, runs on port 80
- **Private Proxy**: Internal-only, accessible only through the public proxy on port 8080
- **Networks**: 
  - `public-network`: Bridge network accessible from outside
  - `proxy-internal`: Internal-only network for proxy communication

## Features

- ✅ Request forwarding from public to private proxy
- ✅ Complete preservation of request/response data
- ✅ Support for all HTTP methods (GET, POST, PUT, DELETE, etc.)
- ✅ WebSocket connection support
- ✅ Health check endpoints
- ✅ Proper Docker networking with public/private separation
- ✅ Request logging and monitoring
- ✅ Gzip compression
- ✅ Security headers preservation

## Quick Start

### Prerequisites

- Docker
- Docker Compose

### Running the Proxy Servers

1. Clone the repository:
```bash
git clone <repository-url>
cd proxy-servers
```

2. Build and start the services:
```bash
docker-compose up -d --build
```

3. Verify the services are running:
```bash
docker-compose ps
```

### Testing the Setup

1. **Health Check (Public Proxy)**:
```bash
curl http://localhost/health
```

2. **Health Check (Private Proxy via Public)**:
```bash
curl http://localhost/echo
```

3. **Test Request Forwarding**:
```bash
curl -X POST http://localhost/ \
  -H "Content-Type: application/json" \
  -H "Custom-Header: test-value" \
  -d '{"test": "data"}'
```

4. **Test with Query Parameters**:
```bash
curl "http://localhost/echo?param1=value1&param2=value2"
```

## Configuration

### Public Proxy

- **Location**: `./public-proxy/`
- **Port**: 80 (exposed to host)
- **Configuration**: `./public-proxy/nginx.conf`
- **Function**: Receives external requests and forwards to private proxy

### Private Proxy

- **Location**: `./private-proxy/`
- **Port**: 8080 (internal only)
- **Configuration**: `./private-proxy/nginx.conf`
- **Function**: Processes forwarded requests and returns responses

### Customization

To modify the proxy behavior:

1. **Update nginx configurations** in `public-proxy/nginx.conf` or `private-proxy/nginx.conf`
2. **Rebuild containers**:
```bash
docker-compose down
docker-compose up -d --build
```

### Adding Backend Services

To integrate with actual backend services, modify the private proxy configuration:

```nginx
# In private-proxy/nginx.conf
location /api/ {
    proxy_pass http://your-backend-service:3000/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

## Monitoring

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f public-proxy
docker-compose logs -f private-proxy
```

### Service Status

```bash
# Check container health
docker-compose ps

# Detailed health information
docker inspect public-proxy | grep Health -A 10
docker inspect private-proxy | grep Health -A 10
```

## Network Security

- The private proxy runs on an **internal-only network** (`proxy-internal`)
- External access to the private proxy is **blocked by Docker networking**
- All external traffic **must** go through the public proxy
- Request/response data is **preserved** during forwarding

## Stopping the Services

```bash
# Stop services
docker-compose down

# Stop and remove volumes
docker-compose down -v

# Complete cleanup
docker-compose down -v --rmi all
```

## Troubleshooting

### Common Issues

1. **Port already in use**:
```bash
# Check what's using port 80
sudo lsof -i :80
# Stop conflicting services or change port in docker-compose.yml
```

2. **Services not starting**:
```bash
# Check logs for errors
docker-compose logs

# Verify Docker is running
docker version
```

3. **Network connectivity issues**:
```bash
# Test internal connectivity
docker exec public-proxy ping private-proxy
```

### Debugging

1. **Access container shells**:
```bash
docker exec -it public-proxy sh
docker exec -it private-proxy sh
```

2. **Test internal connectivity**:
```bash
docker exec public-proxy curl http://private-proxy:8080/health
```

## Development

### Project Structure

```
proxy-servers/
├── docker-compose.yml          # Orchestration configuration
├── public-proxy/
│   ├── Dockerfile              # Public proxy container
│   └── nginx.conf              # Public proxy nginx config
├── private-proxy/
│   ├── Dockerfile              # Private proxy container
│   └── nginx.conf              # Private proxy nginx config
└── README.md                   # Documentation
```

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

[Add your license information here]
