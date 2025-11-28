# Dockerfile - minimal Node app container
FROM node:18-slim

WORKDIR /usr/src/app
COPY package.json package-lock.json* ./
RUN npm install --production || npm install

# copy app
COPY . .

EXPOSE 8080
ENV PORT=8080
CMD ["node", "app.js"]
