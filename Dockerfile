FROM arm32v6/node
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
CMD ["npm", "start"]
