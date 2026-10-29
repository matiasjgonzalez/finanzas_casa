# Imagen para el servidor (Railway): una sola aplicación que sirve la API y la web.
#
# 1. Compila el frontend (React) con Node.
# 2. Instala el backend (FastAPI) y le copia el frontend compilado: la API lo sirve en la misma
#    dirección, así no hace falta CORS y las cookies de sesión funcionan sin configuración extra.

# --- 1. Frontend ---------------------------------------------------------------------------
FROM node:24-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- 2. Backend ----------------------------------------------------------------------------
FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app/backend

COPY backend/requirements.txt ./
RUN pip install -r requirements.txt

COPY backend/alembic.ini ./
COPY backend/alembic ./alembic
COPY backend/app ./app
COPY --from=frontend /app/frontend/dist /app/frontend/dist

# Valores del servidor. Se pueden cambiar desde las variables de Railway.
#   APP_ENV=production: cookies solo por HTTPS, HSTS y sin la documentación /api/docs.
#   TRUST_PROXY=true: la IP real de cada persona viene del proxy de Railway.
#   STORAGE_DIR: los comprobantes van al VOLUMEN montado en /data (si no, se perderían en cada
#   despliegue).
ENV APP_ENV=production \
    TRUST_PROXY=true \
    STORAGE_DIR=/data/storage \
    CORS_ORIGINS=

EXPOSE 8000
# Railway indica el puerto en la variable PORT.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
