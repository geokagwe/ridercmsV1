# Use official Node.js runtime
FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Install dependencies
COPY package*.json ./
RUN npm install --only=production

# Copy source code
COPY . .

# Expose port
EXPOSE 8080

# Start command
CMD ["npm", "start"]
