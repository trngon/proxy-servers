FROM node:18-alpine

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application files
COPY . .

# Expose port 80
EXPOSE 80

# Start the WebSocket server
CMD ["node", "server.js"]