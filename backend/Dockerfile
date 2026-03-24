# 1. Start with a lightweight, secure Node.js environment
FROM node:22-alpine

# 2. Set the working directory inside the container
WORKDIR /app

# 3. Copy over your package files first (this caches dependencies to make future builds faster)
COPY package*.json ./

# 4. Install production and development dependencies
RUN npm install

# 5. Copy the rest of your backend source code
COPY . .

# 6. Compile the TypeScript code into plain JavaScript
RUN npm run build

# 7. Expose the port your Express server runs on
EXPOSE 3001

# 8. Start the compiled application
CMD [ "npm", "start" ]