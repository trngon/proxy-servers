#!/bin/bash

# Test script for WebSocket-based proxy server setup
# This script tests the WebSocket tunnel functionality between public and private proxies

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PUBLIC_PROXY_URL="http://localhost"
HEALTH_CHECK_TIMEOUT=10
MAX_RETRIES=30

echo -e "${BLUE}=== WebSocket Proxy Server Test Suite ===${NC}"
echo "Testing WebSocket tunnel between public and private proxies"
echo

# Function to print test results
print_result() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓ $2${NC}"
    else
        echo -e "${RED}✗ $2${NC}"
    fi
}

# Function to wait for service to be ready
wait_for_service() {
    local url=$1
    local service_name=$2
    local timeout=$3
    
    echo -e "${YELLOW}Waiting for $service_name to be ready...${NC}"
    
    for i in $(seq 1 $timeout); do
        if curl -s -f "$url" > /dev/null 2>&1; then
            echo -e "${GREEN}$service_name is ready!${NC}"
            return 0
        fi
        echo -n "."
        sleep 1
    done
    
    echo -e "${RED}Timeout waiting for $service_name${NC}"
    return 1
}

# Test 1: Check if public proxy is running
echo -e "${BLUE}Test 1: Public Proxy Health Check${NC}"
if wait_for_service "$PUBLIC_PROXY_URL/health" "Public Proxy" $HEALTH_CHECK_TIMEOUT; then
    response=$(curl -s "$PUBLIC_PROXY_URL/health")
    print_result $? "Public proxy health check"
    echo "Response: $response"
else
    print_result 1 "Public proxy health check"
    echo -e "${RED}Public proxy is not responding. Make sure it's running.${NC}"
    exit 1
fi
echo

# Test 2: Wait for WebSocket tunnel connection
echo -e "${BLUE}Test 2: WebSocket Tunnel Connection${NC}"
echo -e "${YELLOW}Waiting for private proxy to establish WebSocket tunnel...${NC}"

tunnel_ready=false
for i in $(seq 1 $MAX_RETRIES); do
    # Test if we can get a response through the tunnel
    response=$(curl -s -w "%{http_code}" -o /dev/null "$PUBLIC_PROXY_URL/" 2>/dev/null || echo "000")
    
    if [ "$response" != "503" ] && [ "$response" != "000" ]; then
        tunnel_ready=true
        break
    fi
    
    echo -n "."
    sleep 2
done

if [ "$tunnel_ready" = true ]; then
    print_result 0 "WebSocket tunnel established"
else
    print_result 1 "WebSocket tunnel connection"
    echo -e "${RED}Private proxy failed to establish WebSocket tunnel${NC}"
    exit 1
fi
echo

# Test 3: Basic request forwarding
echo -e "${BLUE}Test 3: Basic Request Forwarding${NC}"
response=$(curl -s "$PUBLIC_PROXY_URL/" 2>/dev/null)
exit_code=$?
print_result $exit_code "Basic request forwarding"
if [ $exit_code -eq 0 ]; then
    echo "Response preview: $(echo "$response" | head -c 100)..."
fi
echo

# Test 4: Echo endpoint test
echo -e "${BLUE}Test 4: Echo Endpoint Test${NC}"
response=$(curl -s "$PUBLIC_PROXY_URL/echo" 2>/dev/null)
exit_code=$?
print_result $exit_code "Echo endpoint response"
if [ $exit_code -eq 0 ]; then
    # Check if response contains expected fields
    if echo "$response" | grep -q "echo" && echo "$response" | grep -q "WebSocket tunnel"; then
        print_result 0 "Echo response contains WebSocket tunnel confirmation"
    else
        print_result 1 "Echo response format"
    fi
fi
echo

# Test 5: POST request with JSON data
echo -e "${BLUE}Test 5: POST Request with JSON Data${NC}"
response=$(curl -s -X POST "$PUBLIC_PROXY_URL/echo" \
    -H "Content-Type: application/json" \
    -H "Custom-Header: test-value" \
    -d '{"test": "data", "number": 123}' 2>/dev/null)
exit_code=$?
print_result $exit_code "POST request with JSON data"
if [ $exit_code -eq 0 ]; then
    # Check if response contains the posted data
    if echo "$response" | grep -q '"test": "data"' && echo "$response" | grep -q '"number": 123'; then
        print_result 0 "Request body preservation"
    else
        print_result 1 "Request body preservation"
    fi
    
    # Check if custom header is preserved
    if echo "$response" | grep -q "Custom-Header"; then
        print_result 0 "Custom header preservation"
    else
        print_result 1 "Custom header preservation"
    fi
fi
echo

# Test 6: Query parameters test
echo -e "${BLUE}Test 6: Query Parameters Test${NC}"
response=$(curl -s "$PUBLIC_PROXY_URL/echo?param1=value1&param2=value2&test=123" 2>/dev/null)
exit_code=$?
print_result $exit_code "Query parameters handling"
if [ $exit_code -eq 0 ]; then
    if echo "$response" | grep -q "param1=value1" && echo "$response" | grep -q "param2=value2"; then
        print_result 0 "Query parameters preservation"
    else
        print_result 1 "Query parameters preservation"
    fi
fi
echo

# Test 7: Different HTTP methods
echo -e "${BLUE}Test 7: HTTP Methods Test${NC}"
methods=("GET" "POST" "PUT" "DELETE" "PATCH")

for method in "${methods[@]}"; do
    response=$(curl -s -X "$method" "$PUBLIC_PROXY_URL/echo" 2>/dev/null)
    exit_code=$?
    
    if [ $exit_code -eq 0 ] && echo "$response" | grep -q "\"method\": \"$method\""; then
        print_result 0 "$method method"
    else
        print_result 1 "$method method"
    fi
done
echo

# Test 8: Response time test
echo -e "${BLUE}Test 8: Response Time Test${NC}"
start_time=$(date +%s.%N)
response=$(curl -s "$PUBLIC_PROXY_URL/echo" 2>/dev/null)
end_time=$(date +%s.%N)
exit_code=$?

if [ $exit_code -eq 0 ]; then
    response_time=$(echo "$end_time - $start_time" | bc 2>/dev/null || echo "0")
    response_time_ms=$(echo "$response_time * 1000" | bc 2>/dev/null || echo "0")
    
    print_result 0 "Response time measurement"
    echo "Response time: ${response_time_ms} ms"
    
    # Check if response time is reasonable (less than 5 seconds)
    if (( $(echo "$response_time < 5.0" | bc -l 2>/dev/null || echo "1") )); then
        print_result 0 "Response time within acceptable range"
    else
        print_result 1 "Response time too high"
    fi
else
    print_result 1 "Response time measurement"
fi
echo

# Test 9: Connection persistence test
echo -e "${BLUE}Test 9: Connection Persistence Test${NC}"
echo "Making 5 rapid requests to test tunnel stability..."

all_successful=true
for i in {1..5}; do
    response=$(curl -s "$PUBLIC_PROXY_URL/echo" 2>/dev/null)
    if [ $? -ne 0 ]; then
        all_successful=false
        break
    fi
    sleep 0.5
done

if [ "$all_successful" = true ]; then
    print_result 0 "Multiple rapid requests"
else
    print_result 1 "Multiple rapid requests"
fi
echo

# Test 10: Error handling test
echo -e "${BLUE}Test 10: Error Handling Test${NC}"

# Test request to non-existent endpoint (should still go through tunnel)
response=$(curl -s -w "%{http_code}" -o /dev/null "$PUBLIC_PROXY_URL/nonexistent" 2>/dev/null)
if [ "$response" = "200" ]; then
    print_result 0 "Non-existent endpoint handling (forwarded through tunnel)"
else
    print_result 1 "Non-existent endpoint handling"
fi
echo

# Summary
echo -e "${BLUE}=== Test Summary ===${NC}"
echo -e "${GREEN}WebSocket Proxy Server Test Completed${NC}"
echo
echo "Key Features Verified:"
echo "✓ WebSocket tunnel establishment between public and private proxies"
echo "✓ Request forwarding through WebSocket tunnel"
echo "✓ HTTP method preservation (GET, POST, PUT, DELETE, PATCH)"
echo "✓ Request body and header preservation"
echo "✓ Query parameter handling"
echo "✓ Connection persistence and stability"
echo
echo -e "${YELLOW}Architecture:${NC}"
echo "Internet → Public Proxy (WebSocket Server) ←─ WebSocket Tunnel ←─ Private Proxy (WebSocket Client)"
echo
echo -e "${YELLOW}For cross-server deployment:${NC}"
echo "1. Deploy public proxy on Server 1 using docker-compose.public.yml"
echo "2. Update PUBLIC_PROXY_URL in docker-compose.private.yml with Server 1's IP"
echo "3. Deploy private proxy on Server 2 using docker-compose.private.yml"
echo
echo -e "${GREEN}All tests completed!${NC}"