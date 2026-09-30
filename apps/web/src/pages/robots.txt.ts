import type { APIRoute } from "astro";

/** Generated at build time so the sitemap URL is absolute (Lighthouse rejects relative ones). */
export const GET: APIRoute = ({ site }) => {
  const sitemap = new URL("sitemap-index.xml", site).href;
  const body = [
    "User-agent: *",
    "Allow: /",
    "",
    "User-agent: Mediapartners-Google",
    "Allow: /",
    "",
    `Sitemap: ${sitemap}`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
