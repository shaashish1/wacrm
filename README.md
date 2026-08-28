# WhatsApp CRM (WaCRM)

Monorepo lives in [`wacrm/`](./wacrm). Production runbook: [`wacrm/docs/production.md`](./wacrm/docs/production.md).

```bash
cd wacrm
cp .env.example .env          # fill secrets
docker compose up -d --build  # web :3100  worker :4000  redis :6379
```

Source: https://github.com/shaashish1/wacrm
