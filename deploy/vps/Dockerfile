# SENTINEL backend + built dashboard in one image. Build context is the repo root.
FROM node:22-slim AS dashboard
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
ARG VITE_PROTECTED_SITE_HOST=
ARG VITE_PROTECTED_SITE_IP=
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/ backend/
COPY model/prompts/ model/prompts/
COPY --from=dashboard /src/frontend/dist frontend/dist
RUN useradd --system --uid 10001 sentinel && mkdir /data && chown sentinel /data
USER sentinel
ENV SENTINEL_DB_PATH=/data/sentinel.db PYTHONDONTWRITEBYTECODE=1
# Loopback only: nothing on the public interface, open the dashboard through an SSH tunnel.
CMD ["python", "-m", "uvicorn", "backend.app:app", "--host", "127.0.0.1", "--port", "8001"]
