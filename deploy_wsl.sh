#!/bin/bash
# Script to deploy TEMBUS backend via docker-compose in WSL

echo "Deploying TEMBUS Backend Infrastructure..."

# Ensure we are in the correct directory
cd "$(dirname "$0")"

echo "Bringing up services..."
docker-compose -f docker-compose.yml up -d

echo "Checking status..."
docker ps -a
echo "Deployment triggered. Please check 'docker logs <container_name>' for individual service logs."
