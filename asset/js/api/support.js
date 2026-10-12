// api/support.js — conversations between customers and the support staff.

// What a customer can need help with. Each CSKH position handles some of these topics, so the choice
// decides who sees the conversation. ms = Material Symbols glyph (storefront), fa = Font Awesome (admin).
Api.supportTopics = [
    { id: "orders", label: "Orders & delivery", ms: "receipt_long", fa: "fa-receipt", placeholder: "Which order is it about? Add the order number if you have it." },
    { id: "returns", label: "Returns & refunds", ms: "undo", fa: "fa-rotate-left", placeholder: "Which order or product do you want to return, and what went wrong?" },
    { id: "payments", label: "Payments & wallet", ms: "account_balance_wallet", fa: "fa-wallet", placeholder: "What happened with the payment or your wallet balance? Add the order number if there is one." },
    { id: "products", label: "Products & warranty", ms: "devices", fa: "fa-mobile-screen", placeholder: "Which product is it, and what would you like to know?" },
    { id: "account", label: "My account", ms: "account_circle", fa: "fa-user", placeholder: "What is wrong with your account, your sign-in or your details?" },
    { id: "other", label: "Something else", ms: "forum", fa: "fa-circle-question", placeholder: "Describe your question." }
];

// The topic with this id; anything unknown reads as "other".
Api.supportTopic = function (id) {
    var list = Api.supportTopics;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return list[list.length - 1];
};

// Customer side
Api.support = (function () {
    return {
        // Resolves to { online }: whether any staff member is at their desk right now.
        availability: function () { return Api.request("GET", "/support/availability"); },
        unread: function () { return Api.request("GET", "/support/unread"); },
        list: function () { return Api.request("GET", "/support/threads"); },
        // topic: one of Api.supportTopics; transcript: the bot chat so far, [{ role: "user" | "assistant", content }]
        create: function (message, transcript, topic) {
            return Api.request("POST", "/support/threads", { message: message, topic: topic, transcript: transcript && transcript.length ? transcript : undefined });
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
        // topic: a topic id, "mine" (the topics of the signed-in staff member) or undefined for every topic
        list: function (status, topic) {
            var q = [];
            if (status) q.push("status=" + status);
            if (topic) q.push("topic=" + topic);
            return Api.request("GET", "/admin/support/threads" + (q.length ? "?" + q.join("&") : ""));
        },
        // Resolves to { open, answered, byTopic: { orders: n, ... }, mine: [topic ids] }
        summary: function () { return Api.request("GET", "/admin/support/summary"); },
        setTopic: function (id, topic) { return Api.request("POST", "/admin/support/threads/" + id + "/topic", { topic: topic }); },
        get: function (id, after) { return Api.request("GET", "/admin/support/threads/" + id + (after ? "?after=" + after : "")); },
        reply: function (id, body) { return Api.request("POST", "/admin/support/threads/" + id + "/messages", { body: body }); },
        close: function (id) { return Api.request("POST", "/admin/support/threads/" + id + "/close"); },
        heartbeat: function () { return Api.request("POST", "/admin/support/presence"); }
    };
})();
