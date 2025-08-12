#!/bin/bash

echo "🚀 Testing WebSocket Proxy Architecture"
echo "========================================"

# Wait for services to start
echo "⏳ Waiting for services to start..."
sleep 15

echo ""
echo "📋 Test 1: Public Proxy Health Check"
echo "------------------------------------"
if timeout 5 wget -qO- http://172.20.0.2/health 2>/dev/null; then
    echo "✅ Public proxy is healthy"
else
    echo "❌ Public proxy health check failed"
    echo "Checking with docker exec..."
    docker exec public-proxy wget -qO- http://localhost:80/health 2>/dev/null || echo "Failed"
fi

echo ""
echo "📋 Test 2: Private Proxy Health Check"
echo "--------------------------------------"
if timeout 5 docker exec private-proxy wget -qO- http://localhost:8080/health 2>/dev/null; then
    echo "✅ Private proxy health check accessible"
else
    echo "❌ Private proxy health check failed"
fi

echo ""
echo "📋 Test 3: Container Network Info"
echo "----------------------------------"
echo "Public proxy IP: $(docker inspect public-proxy | grep '"IPAddress"' | head -1 | cut -d'"' -f4)"
echo "Private proxy IP: $(docker inspect private-proxy | grep '"IPAddress"' | head -1 | cut -d'"' -f4)"

echo ""
echo "📋 Test 4: WebSocket Connection Test"
echo "------------------------------------"
# Try to test WebSocket tunnel by making a simple request
echo "Testing tunnel through public proxy..."
if timeout 10 docker exec public-proxy wget -qO- http://localhost:80/ 2>/dev/null; then
    echo "✅ Tunnel request successful"
else
    echo "❌ Tunnel request failed (expected if private proxy not connected)"
fi

echo ""
echo "📋 Test 5: Container Logs"
echo "-------------------------"
echo "=== Public Proxy Logs ==="
docker compose logs public-proxy --tail=5

echo ""
echo "=== Private Proxy Logs ==="
docker compose logs private-proxy --tail=5

echo ""
echo "✅ WebSocket Proxy Test Complete!"
echo ""
echo "🔍 Architecture:"
echo "Internet → Public Proxy (WebSocket Server) ←─ WebSocket Tunnel ←─ Private Proxy (WebSocket Client)"
echo ""
echo "📝 For cross-server deployment:"
echo "1. Deploy public proxy on Server 1: docker-compose -f docker-compose.public.yml up -d"
echo "2. Update PUBLIC_PROXY_URL in docker-compose.private.yml with Server 1's IP"
echo "3. Deploy private proxy on Server 2: docker-compose -f docker-compose.private.yml up -d"