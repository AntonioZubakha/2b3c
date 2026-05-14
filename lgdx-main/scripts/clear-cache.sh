#!/bin/bash

echo "Clearing Market Analytics Cache..."

# Получаем ID MongoDB контейнера
MONGO_CONTAINER=$(docker ps -q -f name=lgdx_mongodb)

if [ -z "$MONGO_CONTAINER" ]; then
    echo "MongoDB container not found!"
    exit 1
fi

echo "MongoDB container ID: $MONGO_CONTAINER"

# Очищаем коллекцию кэша
docker exec $MONGO_CONTAINER mongosh --port 27017 --eval "
use lgdx;
db.MarketAnalyticsCache.deleteMany({});
print('Cache cleared successfully');
"

echo "Cache clearing completed!"
