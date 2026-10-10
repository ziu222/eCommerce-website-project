// api/support.js — conversations between customers and the support staff.

// Customer side
Api.support = (function () {
    return {
        // Resolves to { online }: whether any staff member is at their desk right now.
        availability: function () { return Api.request("GET", "/support/availability"); },
        unread: function () { return Api.request("GET", "/support/unread"); },
        list: function () { return Api.request("GET", "/support/threads"); },
        // transcript: the bot chat so far, [{ role: "user" | "assistant", content }]
        create: function (message, transcript) {
            return Api.request("POST", "/support/threads", { message: message, transcript: transcript && transcript.length ? transcript : undefined });
        },
        // Resolves to { thread, messages }; pass the id of the last message you have to get only newer ones.
        get: function (id, after) { return Api.request("GET", "/support/threads/" + id + (after ? "?after=" + after : "")); },
        reply: function (id, body) { return Api.request("POST", "/support/threads/" + id + "/messages", { body: body }); }
    };
})();

// Staff side (needs the support.view / support.reply permissions)
Api.adminSupport = (function () {
    return {
        // status: "open" (waiting for staff) | "answered" | "closed" | undefined for all
        list: function (status) { return Api.request("GET", "/admin/support/threads" + (status ? "?status=" + status : "")); },
        summary: function () { return Api.request("GET", "/admin/support/summary"); },
        get: function (id, after) { return Api.request("GET", "/admin/support/threads/" + id + (after ? "?after=" + after : "")); },
        reply: function (id, body) { return Api.request("POST", "/admin/support/threads/" + id + "/messages", { body: body }); },
        close: function (id) { return Api.request("POST", "/admin/support/threads/" + id + "/close"); },
        heartbeat: function () { return Api.request("POST", "/admin/support/presence"); }
    };
})();
