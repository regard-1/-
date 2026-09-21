#!/bin/bash
# =============================================================================
# 多特倍斯私域运营中台 - CI/CD 回滚脚本
# 从最近一次备份还原代码并重启容器
# =============================================================================

set -euo pipefail

SSH_TARGET="${DEPLOY_USER:-ubuntu}@${DEPLOY_HOST:-10.0.0.11}"
REMOTE_DIR="${REMOTE_DIR:-/opt/dotbest-ops}"
BACKUP_DIR="/data/dotbest-ops/backup"
SERVICE_NAME="dotbest-ops-app"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:8300/}"
SSH_OPTS="-o ConnectTimeout=15 -o ServerAliveInterval=60"

remote_cmd() {
    sshpass -e ssh $SSH_OPTS "${SSH_TARGET}" "$1"
}

echo "[CI-ROLLBACK] 查找最近备份 ..."
LATEST_BACKUP=$(remote_cmd "ls -dt ${BACKUP_DIR}/pre-deploy_* 2>/dev/null | head -1" 2>/dev/null || true)

if [ -z "$LATEST_BACKUP" ]; then
    echo "[CI-ROLLBACK-ERR] 没有找到备份"
    exit 1
fi
echo "[CI-ROLLBACK] 使用备份: ${LATEST_BACKUP}"

# 还原代码(排除 dist/ 和 node_modules/,保留产线的)
echo "[CI-ROLLBACK] 还原代码 ..."
remote_cmd "sudo rsync -a --exclude='dist/' --exclude='node_modules/' --exclude='.git' ${LATEST_BACKUP}/ ${REMOTE_DIR}/"

# 还原 .env 和 docker-compose.prod.yml
remote_cmd "sudo cp ${LATEST_BACKUP}/.env.backup ${REMOTE_DIR}/.env 2>/dev/null || true"
remote_cmd "sudo cp ${LATEST_BACKUP}/docker-compose.prod.yml.backup ${REMOTE_DIR}/docker-compose.prod.yml 2>/dev/null || true"

# 重建并重启
echo "[CI-ROLLBACK] 重建镜像 ..."
remote_cmd "cd ${REMOTE_DIR} && sudo docker compose -f docker-compose.prod.yml build --no-cache ${SERVICE_NAME}"

echo "[CI-ROLLBACK] 重启容器 ..."
remote_cmd "cd ${REMOTE_DIR} && sudo docker compose -f docker-compose.prod.yml up -d ${SERVICE_NAME}"
sleep 5

# 健康检查
echo "[CI-ROLLBACK] 健康检查 ..."
HEALTH_CODE=$(remote_cmd "curl -s -m 10 -o /dev/null -w '%{http_code}' ${HEALTH_URL}" 2>/dev/null || true)
if [ "$HEALTH_CODE" = "200" ]; then
    echo "[CI-ROLLBACK-OK] 回滚成功,服务健康"
else
    echo "[CI-ROLLBACK-ERR] 回滚后健康检查失败(HTTP ${HEALTH_CODE})"
    echo "查看日志: ssh ${SSH_TARGET} 'sudo docker logs --tail 30 ${SERVICE_NAME}'"
    exit 1
fi
