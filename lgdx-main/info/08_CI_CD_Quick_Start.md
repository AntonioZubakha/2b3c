# 🚀 08. CI/CD Quick Start для LGDX (ручной деплой)

> В проекте деплой выполняется вручную через Docker Swarm. CI/CD можно использовать для сборки/публикации образов, но раскатку стека делаем руками.

## ⚡ Ручной деплой (prod secure)

1) SSH на сервер  
```bash
ssh root@49.13.160.126
cd /opt/lgdx
```

2) Обновить код  
```bash
git pull origin main
```

3) Собрать образы (нужные сервисы)  
```bash
docker build -t lgdx-lgdx-server:latest ./server
docker build -t lgdx-lgdx-client:latest ./client
docker build -t lgdx-api-sync-service:latest ./api-product-sync-service
docker build -t lgdx-file-import-service:latest ./file-product-import-service
docker build -t lgdx-ftp-sync-service:latest ./ftp-product-sync-service
docker build -t lgdx-market-price-calculator:latest ./market-price-calculator-service
docker build -t lgdx-analytics-service:latest ./analytics-service
docker build -t lgdx-backup-service:latest ./backup-service
docker build -t lgdx-ssl-renewal-service:latest ./ssl-renewal-service
```

4) Развернуть стек  
```bash
docker stack deploy -c docker-compose.prod.secure.final.yml lgdx
docker service ls
```

5) Проверить логи ключевых сервисов  
```bash
docker service logs lgdx_lgdx-server --tail 50
docker service logs lgdx_nginx --tail 50
docker service logs lgdx_api-sync-service --tail 50
docker service logs lgdx_file-import-service --tail 50
docker service logs lgdx_ftp-service --tail 50
docker service logs lgdx_market-price-calculator --tail 50
docker service logs lgdx_analytics-service --tail 50
docker service logs lgdx_ssl-renewal-service --tail 50
```

## 🔧 Быстрое обновление одного сервиса
```bash
docker build -t lgdx-lgdx-server:latest ./server
docker service update --force lgdx_lgdx-server
```

## ✅ Чеклист после деплоя
- `docker service ls` — все реплики `1/1`
- Health: `curl https://lgdeal.com/health` (через nginx)
- Prometheus targets: `http://49.13.160.126:9090/targets`
- Grafana: https://lgdeal.com/grafana/
- SSL статус: `curl http://49.13.160.126:8080/status` (ssl-renewal-service)

## 📚 Подробная документация
- Деплой: `info/03_Production_Deployment.md`
- Мониторинг: `info/18_Monitoring.md`, `info/19_Monitoring_Quick_Start.md`
- SSL: `info/06_SSL_Certificate_Management.md`
