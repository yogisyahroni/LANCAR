# Load and capacity tests

The canonical critical-path profile is
`scripts/load/on-demand-1m-day.k6.js`. It covers quote, order create,
tracking, WebSocket state sync and payment callback.
`scripts/load/admin-broadcast.k6.js` covers the broad admin notification path.

Run only against an approved non-production environment:

```text
k6 run scripts/load/on-demand-1m-day.k6.js
k6 run scripts/load/admin-broadcast.k6.js
```

Override profile inputs with `QUOTE_RPS`, `CREATE_ORDER_RPS`, `TRACKING_RPS`,
`WS_VUS`, `PAYMENT_CALLBACK_RPS` and the approved provider/webhook profile.
Record the forecast, safety margin, DB/Redis/RabbitMQ/provider quotas,
bottleneck, cost and whether load shedding protected authoritative writes.
Do not paste tokens or raw request/response payloads into the result.

