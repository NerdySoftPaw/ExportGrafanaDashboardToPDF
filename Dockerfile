FROM node:latest

WORKDIR /usr/src/app

COPY package*.json ./

RUN apt-get update && apt-get install -y \
    gconf-service libasound2 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgcc1 libgconf-2-4 libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 ca-certificates fonts-liberation libappindicator1 libnss3 lsb-release xdg-utils wget \
    chromium \
    jq \
    curl \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

RUN npm install

COPY grafana_pdf.js .
COPY server.js .
COPY .env ./
COPY generate-pdf.sh ./

# Create output and debug directories
RUN mkdir -p output debug

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Default port 3001 if not found in .env
ARG EXPORT_SERVER_PORT=3001
EXPOSE ${EXPORT_SERVER_PORT}

CMD ["node", "server.js"]
