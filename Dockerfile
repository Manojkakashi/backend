# Stage 1: Use the official Python image to get python3
FROM python:3.10-slim AS python

# Stage 2: Use Node for your app
FROM node:18-slim

WORKDIR /app

# Copy python3 from the python image
COPY --from=python /usr/local /usr/local
COPY --from=python /usr/bin/python3 /usr/bin/python3

# Copy your package files & install
COPY package*.json ./
RUN npm install --production

# Copy your backend code
COPY . .

# Expose port and start
EXPOSE 4000
CMD ["node", "server.js"]
