const ORIGIN = "https://sensational-eclair-af5ce5.netlify.app";

export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    const target = new URL(incoming.pathname + incoming.search, ORIGIN);

    const headers = new Headers(request.headers);

    if (headers.has("origin")) {
      headers.set("origin", ORIGIN);
    }

    const options = {
      method: request.method,
      headers,
      redirect: "manual"
    };

    if (request.method !== "GET" && request.method !== "HEAD") {
      options.body = request.body;
    }

    const response = await fetch(target.toString(), options);
    const outHeaders = new Headers(response.headers);

    const location = outHeaders.get("location");
    if (location && location.startsWith(ORIGIN)) {
      outHeaders.set("location", location.replace(ORIGIN, incoming.origin));
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: outHeaders
    });
  }
};
