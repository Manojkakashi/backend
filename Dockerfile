# 1) Base image with Node
FROM node:18-slim

# 2) Install Python 3 and pip
RUN apt-get update && \
    apt-get install -y python3 python3-pip && \
    rm -rf /var/lib/apt/lists/*

# 3) Copy & install Python deps
WORKDIR /app
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# 4) Copy & install Node deps
COPY package*.json ./
RUN npm install --production

# 5) Copy the rest of your backend code
COPY . .

# 6) Expose and run
EXPOSE 4000
CMD ["node", "server.js"]
