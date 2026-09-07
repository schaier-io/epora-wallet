import { NextResponse } from "next/server";

// Interactive reference for the public API: Swagger UI over the same document
// the server generates at /api/v1/openapi.json, so it can never drift from
// what the routes validate. A route handler rather than a page, so the wallet
// app's layout, dialogs, and theme stay out of it. The Swagger UI assets are
// served from public/api-docs/, mirrored out of the swagger-ui-dist package by
// scripts/sync-swagger-ui.mjs on install.
const page = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Epora permission wallet API</title>
    <link rel="icon" href="/favicon.ico" sizes="32x32" />
    <link rel="stylesheet" href="/api-docs/swagger-ui.css" />
    <style>body { margin: 0; }</style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="/api-docs/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: "/api/v1/openapi.json",
        dom_id: "#swagger-ui",
        deepLinking: true
      });
    </script>
  </body>
</html>
`;

export function GET() {
  return new NextResponse(page, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Static markup; the document behind it already carries its own caching.
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600"
    }
  });
}
