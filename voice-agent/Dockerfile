FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends gcc g++ \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml README.md ./
COPY src ./src
RUN pip install .

# Télécharge les poids (Silero VAD, détecteur de fin de tour) dans l'image :
# aucun téléchargement au premier appel.
RUN python -m zunqoo_voice.agent.worker download-files

COPY data ./data

# Le worker se connecte en sortie à LiveKit : aucun port entrant requis
# (8081 = health check du worker).
EXPOSE 8081
CMD ["python", "-m", "zunqoo_voice.agent.worker", "start"]
