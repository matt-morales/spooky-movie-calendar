// Cloudflare Pages Function: every /api/* request goes to the Go API.
// API_ORIGIN (the Cloud Run URL) is set on the Pages project by Terraform.
import { proxyToApi } from "../proxy";

interface Env {
  API_ORIGIN: string;
}

export const onRequest: PagesFunction<Env> = ({ request, env }) => proxyToApi(request, env.API_ORIGIN);
