FROM node:18-slim
WORKDIR /usr/src/app
COPY package.json package-lock.json* ./
RUN npm install --production || npm install
COPY . .
EXPOSE 8080
ENV PORT=8080
CMD ["npm","start"]
