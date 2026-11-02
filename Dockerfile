# Imagen para el servidor (Render o Railway): una sola aplicación que sirve la API y la web.
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

# Valores del servidor. Se pueden cambiar desde las variables del servicio.
#   APP_ENV=production: cookies solo por HTTPS, HSTS y sin la documentación /api/docs.
#   TRUST_PROXY=true: la IP real de cada persona viene del proxy del servicio.
#   STORAGE_BACKEND=database: los comprobantes van dentro de la base (el disco del contenedor
#   se borra en cada despliegue). STORAGE_DIR solo se usa con STORAGE_BACKEND=local y un
#   volumen montado en /data.
ENV APP_ENV=production \
    TRUST_PROXY=true \
    STORAGE_BACKEND=database \
    STORAGE_DIR=/data/storage \
    CORS_ORIGINS=

EXPOSE 8000
# Al arrancar: migraciones y superadmin (app.predeploy; se puede repetir sin problema) y después
# la aplicación. Si las migraciones fallan, no arranca. El puerto viene en la variable PORT.
CMD ["sh", "-c", "python -m app.predeploy && exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
