// api/client.js — thin fetch wrapper for the backend API.
// The API is served from the same origin as the pages and authenticates with an httpOnly cookie.
var Api = (function () {

    class ApiError extends Error {
        constructor(status, message) {
            super(message);
            this.name = "ApiError";
            this.status = status;
        }
    }

    async function request(method, path, body) {
        const res = await fetch("/api" + path, {
            method: method,
            credentials: "same-origin",
            headers: body === undefined ? {} : { "Content-Type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body)
        });

        if (res.status === 204) return null;

        let data = null;
        try { data = await res.json(); } catch (e) { /* empty or non-JSON body */ }

        if (!res.ok) {
            const msg = data && data.message;
            throw new ApiError(res.status, Array.isArray(msg) ? msg.join(", ") : (msg || res.statusText));
        }
        return data;
    }

    // Shop-authored text (names, descriptions) must never reach innerHTML unescaped.
    function escapeHtml(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    return { ApiError: ApiError, request: request, escapeHtml: escapeHtml };

})();
