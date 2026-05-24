# Agenda Flow com MongoDB

Sistema de agendamento com eventos e inscricoes usando Node.js, Express e MongoDB.

## Requisitos

- Docker + Docker Compose

## Configuracao (Docker)

1) Ajuste as variaveis no docker-compose.yml (MONGODB_DB e SESSION_SECRET).

## Como rodar (Docker)

```
docker compose up --build
```

A aplicacao sobe em http://localhost:3000

## API (resumo)

- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/logout
- GET /api/auth/me
- GET /api/events?limit=10&offset=0&q=
- GET /api/events/:id
- GET /api/events/mine
- POST /api/events
- PUT /api/events/:id
- DELETE /api/events/:id
- POST /api/events/:id/enroll
- GET /api/enrollments/me
- POST /api/enrollments/:id/cancel
- GET /api/reminders/upcoming?hours=24

## Benchmark e graficos (MongoDB)

1) Garanta o MongoDB rodando e o arquivo .env configurado.
2) Rode o benchmark:

```
node scripts/benchmark.js
```

3) Ajuste o checklist de vulnerabilidade (opcional):

- Arquivo: data/vulnerability.json
- Score: 0 = nao, 0.5 = desconhecido, 1 = sim

4) Gere os graficos (PNG):

```
python scripts/plot.py
```

Graficos gerados em reports/.

## Checklist de vulnerabilidade (MongoDB)

- Use TLS no cluster e rotacione senhas.
- Evite usuario administrador na app; use permissoes minimas.
- Valide dados no servidor e normalize entradas.
- Proteja variaveis de ambiente (.env fora do repositorio).
- Desabilite portas/servicos nao usados no cluster.
- Audite logs e monitore tentativas de acesso.

## Checklist de desempenho

- Crie indices que suportem as consultas usadas.
- Use LIMIT/OFFSET para paginar listagens grandes.
- Considere TTL para dados temporarios.
- Monitore latencia e throughput do cluster.
- Agrupe operacoes com bulk quando houver cargas massivas.
