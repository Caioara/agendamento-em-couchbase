# Registro de Carros com MongoDB

Sistema simples de registro de carros usando Node.js, Express e MongoDB.

## Requisitos

- Node.js 18+
- MongoDB em execucao (local ou via Docker)

## Configuracao

1) Copie o arquivo .env.example para .env e ajuste os valores.
2) Defina o banco com MONGODB_DB (ex: carros).

## Como rodar

```
npm install
npm run start
```

A aplicacao sobe em http://localhost:3000

## API

- GET /api/cars?limit=10&offset=0
- GET /api/cars/:id
- POST /api/cars
- PUT /api/cars/:id
- DELETE /api/cars/:id

### Exemplo de payload

```
{
	"plate": "ABC-1234",
	"model": "Onix",
	"brand": "Chevrolet",
	"year": 2022,
	"color": "Branco"
}
```

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
