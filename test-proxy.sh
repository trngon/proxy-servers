#!/bin/bash

# Test script for proxy servers
echo "🚀 Testing Proxy Servers Setup..."
echo

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 10

# Test 1: Public proxy health check
echo "📋 Test 1: Public proxy health check"
curl -s http://localhost/health
echo -e "\n"

# Test 2: Echo endpoint through proxy chain
echo "📋 Test 2: Echo endpoint through proxy chain"
curl -s http://localhost/echo
echo -e "\n"

# Test 3: POST request with custom headers and body
echo "📋 Test 3: POST request with custom headers and body"
curl -s -X POST http://localhost/echo \
  -H "Content-Type: application/json" \
  -H "Custom-Header: test-value" \
  -H "User-Agent: proxy-test-client" \
  -d '{"test": "data", "timestamp": "'$(date -Iseconds)'"}'
echo -e "\n"

# Test 4: GET request with query parameters
echo "📋 Test 4: GET request with query parameters"
curl -s "http://localhost/echo?param1=value1&param2=value2&test=forwarding"
echo -e "\n"

# Test 5: Different HTTP methods
echo "📋 Test 5: Testing different HTTP methods"
echo "PUT request:"
curl -s -X PUT http://localhost/echo -d '{"method": "PUT"}'
echo -e "\n"

echo "DELETE request:"
curl -s -X DELETE http://localhost/echo
echo -e "\n"

echo "PATCH request:"
curl -s -X PATCH http://localhost/echo -d '{"method": "PATCH"}'
echo -e "\n"

echo "✅ All tests completed!"