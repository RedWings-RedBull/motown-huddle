// CloudFront Function (cloudfront-js-2.0): make Astro's directory-style routes work from S3.
//   /games/2026/week-03/  -> /games/2026/week-03/index.html   (rewrite)
//   /games/2026/week-03   -> 301 /games/2026/week-03/          (canonical trailing slash)
//   /ads.txt, /_astro/x.js -> untouched                          (anything with an extension)
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (uri.endsWith("/")) {
    request.uri = uri + "index.html";
    return request;
  }
  var last = uri.substring(uri.lastIndexOf("/") + 1);
  if (last.indexOf(".") === -1) {
    return {
      statusCode: 301,
      statusDescription: "Moved Permanently",
      headers: { location: { value: uri + "/" } },
    };
  }
  return request;
}
