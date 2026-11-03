"use strict";

(() => {
  const STORAGE_KEY = "rtu.portal.help.faqs.v1";
  const STATUS = Object.freeze({ DRAFT: "Draft", PUBLISHED: "Published", ARCHIVED: "Archived" });
  const normalize = (value) => String(value || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/gradeslips?/g, "grade slip").replace(/regiform|reg form/g, "registration form").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const now = () => new Date().toISOString();
  const id = () => `FAQ-${window.crypto.randomUUID()}`;
  const fallback = "I couldn't find a reliable answer to that question. You can browse the FAQs or submit a support inquiry for additional assistance.";
  function requireCapability(capability) {
    if (!window.PortalSupportService.capabilities().includes(capability)) throw new Error(`Your account does not have ${capability} permission.`);
    return window.PortalStaffContext.current();
  }
  function reader() {
    if (window.PortalProfile?.snapshot()?.account?.role === "student") return;
    requireCapability("faqView");
  }
  function write(records) {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); } catch { throw new Error("FAQ changes could not be saved in this browser."); }
    document.dispatchEvent(new Event("portal:faqschanged"));
  }
  function read() {
    let raw;
    try { raw = window.localStorage.getItem(STORAGE_KEY); } catch { throw new Error("FAQ storage is unavailable."); }
    if (raw === null) {
      const records = window.PortalSupportPolicy.bundledGuideEnabled ? window.PortalHelpGuide.map((guide) => {
        const timestamp = now(); const content = { question: guide.question, answer: guide.answer, category: guide.category, keywords: [...guide.keywords], relatedService: guide.relatedService };
        const published = { ...content, version: 1, publishedAt: timestamp, publisher: "Built-in portal usage guide (development)" };
        return { id: id(), ...content, status: STATUS.PUBLISHED, revision: 1, authorId: "bundled-guide", author: "Built-in portal guide", createdAt: timestamp, updatedAt: timestamp, updatedBy: "Built-in portal guide", bundledKey: guide.key, published, versions: [published], history: [{ action: "Bundled public guidance imported", timestamp, actor: "Portal configuration", previousStatus: "", newStatus: STATUS.PUBLISHED }] };
      }) : [];
      // Bootstrap is a trusted deployment asset, not a student/staff publication API.
      // Do not emit recursively while first initialization is still mounting views.
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); } catch { throw new Error("The help knowledge base could not initialize in browser storage."); }
      return records;
    }
    let records;
    try { records = JSON.parse(raw); } catch { throw new Error("Saved FAQ data is invalid."); }
    if (!Array.isArray(records) || records.some((record) => !record || typeof record.id !== "string" || !Object.values(STATUS).includes(record.status) || !Number.isInteger(record.revision) || !Array.isArray(record.versions) || !Array.isArray(record.history) || typeof record.question !== "string" || typeof record.answer !== "string" || !Array.isArray(record.keywords))) throw new Error("Saved FAQ data is invalid; it has not been overwritten.");
    if (new Set(records.map((record) => record.id)).size !== records.length) throw new Error("Duplicate FAQ identifiers require review.");
    return records;
  }
  function list() { requireCapability("faqView"); return clone(read()).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)); }
  function get(faqId) { return list().find((record) => record.id === faqId) || null; }
  function publicList() {
    reader();
    return read().filter((record) => record.status === STATUS.PUBLISHED && record.published).map(({ id: faqId, published }) => ({ id: faqId, question: published.question, answer: published.answer, category: published.category, keywords: clone(published.keywords), relatedService: published.relatedService, version: published.version, publishedAt: published.publishedAt, publisher: published.publisher }));
  }
  function validate(input) {
    const question = String(input.question || "").trim(); const answer = String(input.answer || "").trim();
    if (!question || question.length > 180) throw new Error("Question is required and must be at most 180 characters.");
    if (!answer || answer.length > 5000) throw new Error("Answer is required and must be at most 5,000 characters.");
    if (!window.PortalSupportPolicy.categories.includes(input.category)) throw new Error("Choose a configured FAQ category.");
    const relatedService = String(input.relatedService || "");
    if (relatedService && !window.PortalRequestService.SERVICES.includes(relatedService)) throw new Error("Choose an existing academic service.");
    const sourceKeywords = Array.isArray(input.keywords) ? input.keywords : String(input.keywords || "").split(",");
    const keywords = [...new Set(sourceKeywords.map((value) => String(value).trim()).filter(Boolean))];
    if (keywords.length > 20 || keywords.join(",").length > 500) throw new Error("Use at most 20 keywords/phrases and 500 characters.");
    return { question, answer, category: input.category, relatedService, keywords };
  }
  function core(record) { return JSON.stringify([record.question, record.answer, record.category, record.relatedService, record.keywords]); }
  function editable(record) {
    const current = requireCapability("faqView"); const caps = window.PortalSupportService.capabilities();
    return record.status !== STATUS.ARCHIVED && (caps.includes("faqManage") || caps.includes("faqEditOwn") && record.authorId === current.account.accountNumber);
  }
  function save(input, options = {}) {
    const current = requireCapability("faqView"); const data = validate(input); const records = read();
    const action = options.action || "draft";
    if (!["draft", "publish"].includes(action)) throw new Error("Choose Draft or Published through a supported action.");
    if (action === "publish") { requireCapability("faqPublish"); if (options.confirmed !== true) throw new Error("Confirm FAQ publication first."); }
    let record = options.id ? records.find((entry) => entry.id === options.id) : null;
    if (options.id && !record) throw new Error("This FAQ is unavailable.");
    if (record && (!editable(record) || record.revision !== options.revision)) throw new Error("This FAQ changed or is not editable. Reopen its latest version; your unsaved answer is preserved.");
    if (!record) {
      requireCapability("faqCreate");
      const previous = options.token && records.find((entry) => entry.creationToken === options.token && entry.authorId === current.account.accountNumber); if (previous) return clone(previous);
    }
    if (records.some((entry) => entry.id !== record?.id && entry.status !== STATUS.ARCHIVED && (normalize(entry.question) === normalize(data.question) || entry.published && normalize(entry.published.question) === normalize(data.question)))) throw new Error("A matching question already exists. Edit that FAQ to avoid conflicting answers.");
    const previousStatus = record?.status || "";
    if (record && action === "draft" && core(record) === core(data)) return clone(record);
    if (!record) { record = { id: id(), authorId: current.account.accountNumber, author: current.profile?.fullName || current.account.fullName, createdAt: now(), revision: 0, status: STATUS.DRAFT, versions: [], history: [], published: null, creationToken: options.token || window.crypto.randomUUID() }; records.unshift(record); }
    if (action === "publish" && record.published && core(record.published) === core(data)) throw new Error("There are no new FAQ changes to publish.");
    Object.assign(record, data, { updatedAt: now(), updatedBy: current.profile?.fullName || current.account.fullName, revision: record.revision + 1 });
    if (action === "publish") {
      record.status = STATUS.PUBLISHED; const version = { ...data, version: record.versions.length + 1, publishedAt: now(), publisher: record.updatedBy }; record.versions.push(version); record.published = clone(version);
    }
    // A draft revision of a live entry does not replace its published snapshot.
    record.history.push({ action: action === "publish" ? record.versions.length > 1 ? "Published FAQ Revised" : "FAQ Published" : previousStatus === STATUS.PUBLISHED ? "Unpublished FAQ Changes Saved" : previousStatus ? "FAQ Draft Edited" : "FAQ Draft Created", actor: record.updatedBy, actorId: current.account.accountNumber, timestamp: now(), previousStatus, newStatus: record.status });
    write(records); return clone(record);
  }
  function archive(faqId, revision, confirmed) {
    const current = requireCapability("faqArchive"); if (confirmed !== true) throw new Error("Confirm FAQ archiving first.");
    const records = read(); const record = records.find((entry) => entry.id === faqId);
    if (!record || record.revision !== revision || record.status === STATUS.ARCHIVED) throw new Error("This FAQ changed or is already archived.");
    const previousStatus = record.status; record.status = STATUS.ARCHIVED; record.updatedAt = now(); record.updatedBy = current.profile?.fullName || current.account.fullName; record.revision++;
    record.history.push({ action: "FAQ Archived", actor: record.updatedBy, actorId: current.account.accountNumber, timestamp: now(), previousStatus, newStatus: STATUS.ARCHIVED }); write(records); return clone(record);
  }
  function search(query = "", category = "") { const normalized = normalize(query); return publicList().filter((entry) => (!category || entry.category === category) && (!normalized || normalize([entry.question, entry.answer, entry.category, ...entry.keywords].join(" ")).includes(normalized))); }
  function match(question) {
    const query = normalize(question); if (!query || query.length > 1000) return null;
    const stop = new Set(["how", "can", "do", "does", "i", "my", "the", "a", "an", "what", "is", "to", "in", "of", "for", "and", "where", "get", "me", "with"]);
    const tokens = [...new Set(query.split(" ").filter((token) => token.length > 2 && !stop.has(token)))];
    const ranked = publicList().map((entry) => {
      const title = normalize(entry.question); const titleTokens = new Set(title.split(" ").filter((token) => !stop.has(token)));
      const phraseHits = entry.keywords.map(normalize).filter((phrase) => phrase && ` ${query} `.includes(` ${phrase} `));
      const common = tokens.filter((token) => titleTokens.has(token)).length;
      return { entry, score: query === title ? 1000 : phraseHits.length ? 100 + Math.max(...phraseHits.map((phrase) => phrase.split(" ").length)) * 10 + common : common >= 2 && common / Math.max(1, tokens.length) >= .6 ? common : 0 };
    }).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score);
    return ranked.length && (!ranked[1] || ranked[0].score > ranked[1].score) ? clone(ranked[0].entry) : null;
  }
  function answer(question) { try { return match(question)?.answer || fallback; } catch { return fallback; } }
  window.addEventListener("storage", (entry) => { if (entry.key === null || entry.key === STORAGE_KEY) document.dispatchEvent(new Event("portal:faqschanged")); });
  window.PortalFAQService = Object.freeze({ STATUS, normalize, list, get, publicList, validate, editable, save, archive, search, match, answer, fallback });
})();
