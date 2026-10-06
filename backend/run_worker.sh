.venv/bin/celery -A app.worker worker --beat --pool=solo --loglevel=info
