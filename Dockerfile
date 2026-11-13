FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node . .
RUN node --check server.mjs
ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["node", "server.mjs"]
