// api/moderation.js — listing moderation: the admin queue, keywords, settings, penalties and appeals,
// the shop's own penalties, and customer reports.

Api.moderation = (function () {

    function qs(params) {
        var q = new URLSearchParams();
        Object.keys(params || {}).forEach(function (k) { if (params[k] !== undefined && params[k] !== "") q.set(k, params[k]); });
        var s = q.toString();
        return s ? "?" + s : "";
    }

    return {
        // admin
        health: function () { return Api.request("GET", "/admin/moderation/health"); },
        flags: function (params) { return Api.request("GET", "/admin/moderation/flags" + qs(params)); },
        decide: function (id, decision, note, points) {
            return Api.request("POST", "/admin/moderation/flags/" + id + "/decide", { decision: decision, note: note || undefined, points: points || undefined });
        },
        keywords: function () { return Api.request("GET", "/admin/moderation/keywords"); },
        addKeyword: function (phrase, severity) { return Api.request("POST", "/admin/moderation/keywords", { phrase: phrase, severity: severity }); },
        removeKeyword: function (id) { return Api.request("DELETE", "/admin/moderation/keywords/" + id); },
        settings: function () { return Api.request("GET", "/admin/moderation/settings"); },
        saveSettings: function (patch) { return Api.request("PUT", "/admin/moderation/settings", patch); },
        appeals: function (status) { return Api.request("GET", "/admin/penalty-appeals" + qs({ status: status })); },
        decideAppeal: function (id, accept, note) { return Api.request("POST", "/admin/penalty-appeals/" + id + "/decide", { accept: accept, note: note }); },
        penaltiesOf: function (shopId) { return Api.request("GET", "/admin/penalties" + qs({ shopId: shopId })); },

        // shop
        myPenalties: function () { return Api.request("GET", "/shop/penalties"); },
        appeal: function (penaltyId, message) { return Api.request("POST", "/shop/penalties/" + penaltyId + "/appeal", { message: message }); },

        // customer
        report: function (productId, reason, note) { return Api.request("POST", "/products/" + productId + "/report", { reason: reason, note: note || undefined }); }
    };

})();
