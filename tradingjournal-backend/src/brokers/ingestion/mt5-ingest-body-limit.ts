import { json } from 'express';

/**
 * Route-scoped JSON body limit for POST /brokers/mt/ingest only — the global Express
 * body-parser limit (default 100kb, set once in main.ts via Nest's own bodyParser
 * registration) stays untouched for every other route. Phase 3 hardening review §1:
 * a RECONCILE event bundles an account snapshot + a FULL positions snapshot (capped at
 * 2000 positions by Mt5PositionsSnapshotPayloadDto) + a deals batch (capped at 5000 by
 * Mt5ReconcilePayloadDto) in one request — a worst-case payload at those caps measures
 * ~1.46MB (see mt5-ingest-body-limit.spec.ts), which the global 100kb default would
 * reject at the body-parser layer before DTO validation ever runs. 3mb gives that
 * worst case roughly 2x headroom while staying bounded (not "raise the limit and hope"
 * — it's sized off the DTO's own ArrayMaxSize caps).
 *
 * The wrapper function below MUST NOT be named `jsonParser` (the name express.json()'s
 * own returned function always has). NestJS's ExpressAdapter.registerParserMiddleware()
 * skips installing its own global body parser if it finds ANY middleware already on the
 * stack whose handler is named `jsonParser` (see isMiddlewareApplied() in
 * @nestjs/platform-express) — it can't tell a route-scoped parser from a global one, it
 * only compares function names. Before this wrapper existed, this route's parser WAS a
 * bare express.json() (name `jsonParser`), which made Nest believe the global parser was
 * already registered and silently skip it — breaking req.body on every other route in
 * the app (all of them, since none of them go through this route-scoped parser). Keep
 * this named something other than `jsonParser` if you ever touch this again.
 */
export const MT5_INGEST_ROUTE_PATH = '/brokers/mt/ingest';
export const MT5_INGEST_BODY_LIMIT = '3mb';

export function createMt5IngestBodyParser() {
  const parser = json({ limit: MT5_INGEST_BODY_LIMIT });
  return function mt5IngestJsonParser(
    req: Parameters<typeof parser>[0],
    res: Parameters<typeof parser>[1],
    next: Parameters<typeof parser>[2],
  ) {
    parser(req, res, next);
  };
}
