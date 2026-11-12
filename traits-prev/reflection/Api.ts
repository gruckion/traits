import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/http-api"

export class Api extends HttpApi.make("reflection").add(
  HttpApiGroup.make("otlp").add(HttpApiEndpoint.post("traces", "/v1/traces"), HttpApiEndpoint.post("logs", "/v1/logs"))
) {}
