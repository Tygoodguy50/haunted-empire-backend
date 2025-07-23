# Dockerfile for Haunted Empire Backend (Node.js)
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3002
CMD ["node", "index.js"]
