# Stage 1: Build the React application
FROM node:18-alpine AS builder
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm ci --legacy-peer-deps

# Copy the rest of the application files
COPY . ./

# Verify that urlNormalizer.ts was copied (debug)
RUN ls -la src/utils/urlNormalizer.ts || (echo "ERROR: urlNormalizer.ts not found!" && ls -la src/utils/ && exit 1)

# Accept build arguments for environment variables
ARG REACT_APP_API_URL=/api
ARG REACT_APP_GA_MEASUREMENT_ID=
ARG NODE_ENV=production

# Set environment variables for the build
ENV REACT_APP_API_URL=${REACT_APP_API_URL}
ENV REACT_APP_GA_MEASUREMENT_ID=${REACT_APP_GA_MEASUREMENT_ID}
ENV NODE_ENV=${NODE_ENV}
ENV GENERATE_SOURCEMAP=false

# Build the application for production (без Sentry source maps)
RUN npm run build:local

# Stage 2: Serve the application using a lightweight web server
FROM nginx:1.23-alpine

# Install curl for healthchecks (already in nginx:alpine)
# Install bash for entrypoint script
RUN apk add --no-cache bash

# Copy the build output from the build stage
COPY --from=builder /app/build /usr/share/nginx/html

# Copy custom nginx configuration for SPA routing
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy entrypoint script for reading Docker secrets
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Expose port 80
EXPOSE 80

# Use entrypoint script instead of direct nginx command
ENTRYPOINT ["/docker-entrypoint.sh"] 