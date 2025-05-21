# backend/Dockerfile

# 1) Start from official Python image (includes pip)
FROM python:3.10-slim

# 2) Install Node.js, npm, and build tools
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      curl \
      build-essential \
      git \
      python3-dev \
      libffi-dev \
      libssl-dev \
      zlib1g-dev \
      libbz2-dev \
      liblzma-dev \
      nodejs npm && \
    rm -rf /var/lib/apt/lists/*

# 3) Set working dir
WORKDIR /app

# 4) Copy & install Python deps
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# 5) Copy & install Node deps
COPY package*.json ./
RUN npm install --production

# 6) Copy the rest of your backend code
COPY . .

# 7) Expose and start the server
EXPOSE 4000
CMD ["node", "server.js"]
