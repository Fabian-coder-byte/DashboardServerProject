FROM node:20-alpine

# util-linux fornisce lsblk e nsenter (per rimontare nel namespace host)
RUN apk add --no-cache util-linux

WORKDIR /app

COPY package*.json ./
RUN npm install --only=production

COPY src/ ./src/

EXPOSE 5005

CMD ["node", "src/app.js"]
