FROM node:20

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --force

COPY . .

RUN apt-get update && apt-get install -y cron

COPY whatsapp-cron /etc/cron.d/whatsapp-cron

RUN chmod 0644 /etc/cron.d/whatsapp-cron

RUN crontab /etc/cron.d/whatsapp-cron

CMD ["cron", "-f"]
