# Chore board — static HTML + zero-dependency Node proxy.
# No npm install needed at runtime (server.js uses only Node built-ins).
FROM node:20-alpine

WORKDIR /app

# Copy only what the server needs to run.
COPY package.json server.js points.js index.js index.html scores.html approve.html ./

# Persisted points/balances live here; mount a volume to keep them.
ENV DATA_DIR=/data
VOLUME ["/data"]

# Container always listens on 3000 internally; map a host port in compose.
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
