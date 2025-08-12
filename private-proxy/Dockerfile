FROM node:18-alpine

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application files
COPY . .

# Expose port 8080 for health checks
EXPOSE 8080

# Start the WebSocket client
CMD ["node", "client.js"]