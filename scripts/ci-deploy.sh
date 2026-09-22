#!/bin/bash
# =============================================================================
# 多特倍斯私域运营中台 - CI/CD 部署脚本
# 由 .gitlab-ci.yml 的 deploy:prod 阶段调用
# 部署到产线 10.0.0.11 (内网,Docker Compose 部署)
# 密码通过 SSHPASS 环境变量传入(sshpass -e 自动读取)
# =============================================================================
# 前置条件:
#   1. 产线已完成首次部署(/opt/dotbest-ops/ 已存在)
#   2. CI 服务器与产线在同一 VPC(10.0.0.0/24),内网互通
# =============================================================================

set -euo pipefail

# ===== 配置 =====
SSH_TARGET="${DEPLOY_USER}@${DEPLOY_HOST}"
REMOTE_DIR="${REMOTE_DIR:-/opt/dotbest-ops}"
SSH_OPTS="-o ConnectTimeout=15 -o ServerAliveInterval=60"
BACKUP_DIR="/data/dotbest-ops/backup"
SERVICE_NAME="dotbest-ops-app"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:8300/}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
COMMIT=${CI_COMMIT_SHORT_SHA:-manual}
BRANCH=${CI_COMMIT_BRANCH:-manual}

# ===== 日志函数 =====
log() { echo "[CI-DEPLOY] $(date '+%Y-%m-%d %H:%M:%S') | $1"; }
ok()  { echo "[CI-DEPLOY-OK] $1"; }
err() { echo "[CI-DEPLOY-ERR] $1" >&2; }

# 远程执行命令(通过 sshpass + ssh)
remote() {
    sshpass -e ssh $SSH_OPTS "$@" "${SSH_TARGET}" "$2"
}

# 远程执行本地脚本/命令(简化版)
remote_cmd() {
    sshpass -e ssh $SSH_OPTS "${SSH_TARGET}" "$1"
}

# =============================================================================
# 步骤 1/5: 前置检查
# =============================================================================
log "===== 开始部署 (commit=${COMMIT} branch=${BRANCH}) ====="

# 1.1 检查环境变量
if [ -z "${SSHPASS}" ]; then
    err "SSHPASS 环境变量未设置"
    exit 1
fi

# 1.2 检查远程目录存在
log "检查远程目录 ${REMOTE_DIR} ..."
if ! remote_cmd "test -d ${REMOTE_DIR}" 2>/dev/null; then
    err "${REMOTE_DIR} 不存在,产线尚未完成首次部署"
    exit 1
fi
ok "远程目录存在"

# 1.3 SSH 连通性
log "测试 SSH 连通 ${SSH_TARGET} ..."
if ! remote_cmd "echo SSH-OK" >/dev/null 2>&1; then
    err "SSH 连接失败。检查: 内网 IP 是否可达 / 密码是否正确"
    exit 1
fi
ok "SSH 连通"

# 1.4 检查 docker-compose.prod.yml
if ! remote_cmd "test -f ${REMOTE_DIR}/docker-compose.prod.yml" 2>/dev/null; then
    err "${REMOTE_DIR}/docker-compose.prod.yml 不存在"
    exit 1
fi
ok "docker-compose.prod.yml 存在"

# =============================================================================
# 步骤 2/5: 备份
# =============================================================================
log "备份当前代码到 ${BACKUP_DIR}/pre-deploy_${TIMESTAMP}_${COMMIT} ..."

remote_cmd "sudo mkdir -p ${BACKUP_DIR}" 2>/dev/null || true
remote_cmd "sudo rsync -a --exclude='.git' --exclude='node_modules' --exclude='dist' --exclude='__pycache__' ${REMOTE_DIR}/ ${BACKUP_DIR}/pre-deploy_${TIMESTAMP}_${COMMIT}/ 2>/dev/null" || true
remote_cmd "sudo cp ${REMOTE_DIR}/.env ${BACKUP_DIR}/pre-deploy_${TIMESTAMP}_${COMMIT}/.env.backup 2>/dev/null" || true
remote_cmd "sudo cp ${REMOTE_DIR}/docker-compose.prod.yml ${BACKUP_DIR}/pre-deploy_${TIMESTAMP}_${COMMIT}/docker-compose.prod.yml.backup 2>/dev/null" || true

# 只保留最近 5 次备份
remote_cmd "cd ${BACKUP_DIR} && ls -dt pre-deploy_* 2>/dev/null | tail -n +6 | xargs -r sudo rm -rf" 2>/dev/null || true

ok "备份完成"

# =============================================================================
# 步骤 3/5: 上传代码(rsync)
# =============================================================================
log "上传代码到 ${REMOTE_DIR} ..."

# 排除列表:
# - dist/ : Docker 构建阶段从源码重新生成,避免沿用旧前端
# - node_modules/ : 依赖(产线有,docker build 时安装)
# - .env : 密钥(产线有)
# - docker-compose.prod.yml : 产线 compose(不覆盖)
# - data.db / *.db : 运行时数据
# - logs/ / *.log : 日志
# - __pycache__ / *.pyc : Python 缓存
# - tests/ : 测试代码
# - .git/ : git 仓库
# - .studio-local/ : 本地数据
# - artifacts/ : 构建产物
sshpass -e rsync -az --delete \
    --rsync-path="sudo rsync" \
    --exclude '.git' \
    --exclude '.env' \
    --exclude '.env.*' \
    --exclude 'dist/' \
    --exclude 'node_modules/' \
    --exclude 'docker-compose.prod.yml' \
    --exclude 'docker-compose.yml' \
    --exclude 'data.db' \
    --exclude '*.db' \
    --exclude '*.db-wal' \
    --exclude '*.db-shm' \
    --exclude 'logs/' \
    --exclude '*.log' \
    --exclude '__pycache__/' \
    --exclude '*.pyc' \
    --exclude 'tests/' \
    --exclude '.studio-local/' \
    --exclude 'artifacts/' \
    --exclude '.pytest_cache/' \
    --exclude '.mypy_cache/' \
    --exclude '.vscode/' \
    --exclude '.idea/' \
    --exclude 'tmp/' \
    --exclude 'temp/' \
    -e "ssh ${SSH_OPTS}" \
    ./ "${SSH_TARGET}:${REMOTE_DIR}/"

ok "代码上传完成"

# =============================================================================
# 步骤 4/5: 构建镜像 + 重启容器
# =============================================================================
log "构建 Docker 镜像 ..."

# 4.1 docker compose build
if ! remote_cmd "cd ${REMOTE_DIR} && sudo docker compose -f docker-compose.prod.yml build --no-cache ${SERVICE_NAME}" 2>&1; then
    err "Docker 构建失败"
    err "如需回滚: bash scripts/ci-rollback.sh"
    exit 1
fi
ok "Docker 镜像构建完成"

# 4.2 重启容器(先移除旧容器,避免名称冲突)
log "重启容器 ${SERVICE_NAME} ..."
# 先移除旧容器(可能是手动创建的,compose 不认识)
remote_cmd "sudo docker rm -f ${SERVICE_NAME} 2>/dev/null" || true
if ! remote_cmd "cd ${REMOTE_DIR} && sudo docker compose -f docker-compose.prod.yml up -d ${SERVICE_NAME}" 2>&1; then
    err "容器重启失败"
    err "如需回滚: bash scripts/ci-rollback.sh"
    exit 1
fi

# 等待容器启动
log "等待容器启动 ..."
sleep 5

# 4.3 检查容器状态
CONTAINER_STATUS=$(remote_cmd "sudo docker ps --filter name=${SERVICE_NAME} --format '{{.Status}}' 2>&1" || true)
if echo "$CONTAINER_STATUS" | grep -q "Up"; then
    ok "容器状态: ${CONTAINER_STATUS}"
else
    err "容器状态异常: ${CONTAINER_STATUS}"
    err "查看日志: ssh ${SSH_TARGET} 'sudo docker logs --tail 30 ${SERVICE_NAME}'"
    exit 1
fi

# =============================================================================
# 步骤 5/5: 健康检查
# =============================================================================
log "健康检查 ${HEALTH_URL} ..."

# 5.1 内部健康检查
HEALTH_OUTPUT=$(remote_cmd "curl -s -m 10 -o /dev/null -w '%{http_code}' ${HEALTH_URL} 2>&1" || true)
if [ "$HEALTH_OUTPUT" = "200" ]; then
    ok "健康检查通过(HTTP 200)"
else
    err "健康检查失败(HTTP ${HEALTH_OUTPUT})"
    err "容器状态: $(remote_cmd 'sudo docker ps --filter name=${SERVICE_NAME} --format "{{.Status}}" 2>&1' || true)"
    err "最近日志: $(remote_cmd 'sudo docker logs --tail 10 ${SERVICE_NAME} 2>&1' || true)"
    err "如需回滚: bash scripts/ci-rollback.sh"
    exit 1
fi

ok "===== 部署成功 ====="

# 记录部署日志
remote_cmd "echo '${TIMESTAMP} | commit=${COMMIT} | branch=${BRANCH} | status=SUCCESS' >> ${REMOTE_DIR}/deploy.log 2>/dev/null || true" 2>/dev/null || true

log "部署完成。访问: https://numen-ops.7moor.com/dotbest-ops/"
