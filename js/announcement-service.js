"use strict";

(() => {
  const STORAGE_KEY = "rtu.portal.staff.announcements"; // Reuse the existing announcement source.
  const READ_PREFIX = "rtu.portal.announcementReads.";
  const STATUS = Object.freeze({ DRAFT: "Draft", PENDING: "Pending Approval", APPROVED: "Approved for Publication", SCHEDULED: "Scheduled", PUBLISHED: "Published", ARCHIVED: "Archived", REJECTED: "Rejected" });
  const policy = () => window.PortalAnnouncementPolicy;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const now = () => new Date().toISOString();
  const validTime = (value) => typeof value === "string" && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && !Number.isNaN(new Date(value).getTime());
  let migrating = false;

  function staff() {
    const current = window.PortalStaffContext?.current();
    if (current?.account?.role !== "staff") throw new Error("Sign in as authorized staff to manage announcements.");
    return { id: userId, name: current.profile?.fullName || current.account.fullName };
  }
  function capabilities() {
    const actor = staff();
    return [...grants];
  }
  function requireCapability(capability) {
    const actor = staff();
    if (!capabilities().includes(capability)) throw new Error(`Your staff account does not have announcement ${capability} permission.`);
    return actor;
  }
  function editable(record) {
    const actor = staff(); const permissions = capabilities();
    return permissions.includes("editAny") || (permissions.includes("editOwnDrafts") && record.authorId === actor.id && [STATUS.DRAFT, STATUS.REJECTED].includes(record.status));
  }
  let cache = [], seenIds = [], userId = null, grants = [], generation = 0, loaded = false;
  let refreshPromise = null;
  const client = () => {
    if (!window.PortalSupabase?.configured) throw new Error("Supabase is not configured.");
    return window.PortalSupabase.client;
  };
  function checked(result) {
    if (result.error) throw new Error(result.error.message);
    return result.data;
  }
  function read() { return clone(cache); }
  function mapRow(row, versions = []) {
    const data = { title: row.title, content: row.content, category: row.category, audience: row.audience, priority: row.priority, scheduledAt: row.scheduled_for || "", expiresAt: row.expires_at || "" };
    const publishedAt = row.published_at || (row.status === STATUS.SCHEDULED ? row.scheduled_for : "") || "";
    const published = [STATUS.PUBLISHED, STATUS.SCHEDULED].includes(row.status) && publishedAt ? { ...data, version: row.revision, publishedAt, publisher: row.author_name || "" } : null;
    return { ...data, schemaVersion: 1, id: row.id, authorId: row.author_id, author: row.author_name || "", revision: row.revision, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at, publishedAt, published,
      history: versions.map((v, i) => ({ action: "Revision Saved", actor: v.saved_by_name || "", timestamp: v.created_at, previousStatus: versions[i-1]?.status || "", newStatus: v.status })),
      versions: versions.filter(v => v.status === STATUS.PUBLISHED).map(v => ({ title:v.title, content:v.content, category:v.category, priority:v.priority, audience:row.audience, version:v.revision, publishedAt:v.created_at, publisher:v.saved_by_name || "" })),
      notifications: [] };
  }
  async function refresh() {
    if (refreshPromise) return refreshPromise;
    const epoch = generation;
    const work = (async () => {
      const sb = client();
      const session = checked(await sb.auth.getSession()).session;
      if (!session || epoch !== generation) return;
      const uid = session.user.id;
      const profile = checked(await sb.from("profiles").select("role").eq("id",uid).single());
      const isStaff = ["staff","admin"].includes(profile.role);
      const results = await Promise.all([
        sb.from("announcements").select("*").order("created_at",{ascending:false}),
        isStaff ? sb.from("announcement_versions").select("*").order("revision") : Promise.resolve({data:[]}),
        isStaff ? sb.from("staff_capabilities").select("capability").eq("user_id",uid) : Promise.resolve({data:[]}),
        isStaff ? Promise.resolve({data:[]}) : sb.from("announcement_reads").select("announcement_id").eq("user_id",uid)
      ]);
      const [rows, versions, caps, reads] = results.map(checked);
      if (epoch !== generation) return;
      const next = rows.map(row => mapRow(row,versions.filter(v=>v.announcement_id===row.id)));
      const nextSeen = reads.map(r=>r.announcement_id);
      const nextGrants = profile.role === "admin" ? ["view","create","editAny","editOwnDrafts","publish","archive","review","approve"] : caps.map(c=>c.capability);
      const changed = !loaded || userId !== uid || JSON.stringify([cache,seenIds,grants]) !== JSON.stringify([next,nextSeen,nextGrants]);
      userId=uid; cache=next; seenIds=nextSeen; grants=nextGrants; loaded=true;
      if(changed) announceChange();
    })();
    refreshPromise=work;
    try { await work; } finally { if(refreshPromise===work) refreshPromise=null; }
  }
  async function persist(record, created, previousRevision) {
    const sb = client();
    const values = {title:record.title,content:record.content,category:record.category,audience:record.audience,priority:record.priority,scheduled_for:record.scheduledAt||null,expires_at:record.expiresAt||null};
    if (created) {
      const draft=checked(await sb.from("announcements").insert(values).select("*").single());
      record.id=draft.id;
      if(record.status!==STATUS.DRAFT) {
        checked(await sb.from("announcements").update({status:record.status}).eq("id",draft.id).eq("revision",draft.revision).select("*").single());
      }
    } else {
      checked(await sb.from("announcements").update({...values,status:record.status}).eq("id",record.id).eq("revision",previousRevision).select("*").single());
    }
    await refresh();
    return clone(cache.find(r=>r.id===record.id) || record);
  }
  function refreshQuietly() { refresh().catch(error=>{ console.error("Announcement synchronization failed",error); }); }
  document.addEventListener("portal:login",()=>{generation++;cache=[];seenIds=[];grants=[];userId=null;loaded=false;refreshPromise=null;refreshQuietly();});
  for (const event of ["portal:logout","portal:sessioninvalidated"]) document.addEventListener(event,()=>{generation++;cache=[];seenIds=[];grants=[];userId=null;loaded=false;refreshPromise=null;});
  for(const event of ["portal:staffpagechange","portal:pagechange"]) document.addEventListener(event,refreshQuietly);
  window.addEventListener("focus",refreshQuietly);
  setInterval(()=>{if(userId && !document.hidden && !window.PortalRealtime) refreshQuietly();},15000);
  function announceChange() { document.dispatchEvent(new Event("portal:announcementschanged")); }
  function list() { requireCapability("view"); return read().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)); }
  function get(id) { return list().find((record) => record.id === id) || null; }
  function text(value, max, label) {
    const result = typeof value === "string" ? value.trim() : "";
    if (!result || result.length > max) throw new Error(`${label} is required and must be at most ${max.toLocaleString()} characters.`);
    return result;
  }
  function validate(input) {
    const result = { title: text(input.title, 120, "Title"), content: text(input.content, 10000, "Content"), category: text(input.category, 80, "Category"), audience: text(input.audience, 80, "Audience"), priority: text(input.priority, 20, "Priority"), scheduledAt: input.scheduledAt || "", expiresAt: input.expiresAt || "" };
    if (!policy().categories.includes(result.category)) throw new Error("Select a configured announcement category.");
    if (result.audience !== "All Students" || !policy().audiences.includes(result.audience)) throw new Error("Only general All Students announcements are supported until secure audience filtering is connected.");
    if (!policy().priorities.includes(result.priority)) throw new Error("Select a configured priority.");
    for (const key of ["scheduledAt", "expiresAt"]) {
      if (result[key] && !validTime(result[key])) throw new Error("Use a valid date and time with timezone information.");
      if (result[key]) result[key] = new Date(result[key]).toISOString();
    }
    if (result.expiresAt && result.scheduledAt && result.expiresAt <= result.scheduledAt) throw new Error("Expiration must be later than publication.");
    return result;
  }
  function fromManila(value) {
    if (!value) return "";
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error("Enter a valid Manila date and time.");
    const date = new Date(`${value}:00+08:00`);
    if (Number.isNaN(date.getTime()) || toManila(date.toISOString()) !== value) throw new Error("Enter a valid Manila calendar date and time.");
    return date.toISOString();
  }
  function toManila(value) {
    if (!value || !validTime(value)) return "";
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
    const part = (type) => parts.find((entry) => entry.type === type).value;
    return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
  }
  function core(value) { return JSON.stringify([value.title, value.content, value.category, value.audience, value.priority]); }
  function addHistory(record, action, actor, previousStatus, remarks = "") {
    record.history.push({ action, actor: actor.name, staffId: actor.id, timestamp: now(), previousStatus, newStatus: record.status, remarks });
  }
  async function save(input, options = {}) {
    await refresh();
    const actor = requireCapability("view");
    const action = options.action || "draft";
    if (!["draft", "schedule", "publish"].includes(action)) throw new Error("Choose a supported save action.");
    if (action !== "draft") requireCapability("publish");
    const data = validate(input);
    const all = read();
    let record = options.id ? all.find((item) => item.id === options.id) : null;
    if (options.id && !record) throw new Error("This announcement is unavailable.");
    if (record && record.revision !== options.revision) throw new Error("This announcement changed in another editor. Reopen the latest record before saving; your editor content is preserved.");
    if (!record && options.token) {
      const existing = all.find((item) => item.creationToken === options.token);
      if (existing) return clone(existing); // Idempotent successful submission retry.
    }
    if (record && (!editable(record) || [STATUS.ARCHIVED, STATUS.PENDING].includes(record.status))) throw new Error("You cannot edit this announcement in its current state.");
    if (!record) requireCapability("create");
    const previous = record?.status || "";
    if (previous === STATUS.SCHEDULED && action === "draft") throw new Error("Use the confirmed schedule update action or cancel scheduled publication separately.");
    const created = !record;
    if (!record) {
      record = { schemaVersion: 1, id: `ANN-${window.crypto.randomUUID()}`, createdAt: now(), authorId: actor.id, author: actor.name, revision: 0, history: [], versions: [], notifications: [], published: null, publishedAt: "", creationToken: options.token || window.crypto.randomUUID() };
      all.push(record);
    }
    if (previous === STATUS.PUBLISHED && action !== "publish") throw new Error("Published content must be explicitly revised and republished; it cannot be silently saved over the public version.");
    if (previous === STATUS.PUBLISHED && core(record) === core(data) && record.expiresAt === data.expiresAt) throw new Error("No announcement changes are available to publish as a revision.");
    if (action !== "draft") {
      requireCapability("publish");
      if (options.confirmed !== true) throw new Error("Explicit confirmation is required before scheduling or publishing.");
      if (policy().approvalRequired && (![STATUS.APPROVED, STATUS.SCHEDULED].includes(previous) || record.approvedCore !== core(data))) throw new Error("This content version requires approval before publication or scheduling.");
    }
    const timestamp = now();
    if (action === "schedule" || previous === STATUS.SCHEDULED && action === "draft") {
      if (!data.scheduledAt || data.scheduledAt <= timestamp) throw new Error("Scheduled publication must be in the future (Asia/Manila).");
      requireCapability("publish");
    }
    if (action === "publish") {
      if (previous === STATUS.SCHEDULED && record.scheduledAt > timestamp) throw new Error("This scheduled announcement is not due. Cancel or change its schedule before publishing early.");
      if (data.expiresAt && data.expiresAt <= timestamp) throw new Error("Expiration must be later than publication.");
      data.scheduledAt = "";
    }
    Object.assign(record, data, { updatedAt: timestamp, revision: record.revision + 1 });
    record.status = action === "publish" ? STATUS.PUBLISHED : action === "schedule" || previous === STATUS.SCHEDULED ? STATUS.SCHEDULED : STATUS.DRAFT;
    if (created) addHistory(record, "Created", actor, "");
    if (action === "publish") {
      const version = { ...data, version: record.versions.length + 1, publishedAt: timestamp, publisher: actor.name, publisherId: actor.id };
      record.versions.push(version); record.published = clone(version);
      if (!record.publishedAt) record.publishedAt = timestamp;
      // One in-app notification reference per announcement, never per refresh/revision.
      if (!record.notifications.length) record.notifications.push({ id: `announcement:${record.id}`, title: record.title, timestamp, announcementId: record.id });
      addHistory(record, previous === STATUS.PUBLISHED ? "Revised and Published" : "Published", actor, previous);
    } else addHistory(record, record.status === STATUS.SCHEDULED ? "Scheduled" : created ? "Saved as Draft" : "Edited", actor, previous);
    return persist(record, created, options.revision);
  }
  async function transition(id, revision, action, options = {}) {
    await refresh();
    const actor = requireCapability("view");
    const all = read(); const record = all.find((item) => item.id === id);
    if (!record) throw new Error("This announcement is unavailable.");
    if (record.revision !== revision) throw new Error("This announcement changed. Reopen its latest version before continuing.");
    const previous = record.status;
    if (options.confirmed !== true) throw new Error("Confirm this announcement action first.");
    if (action === "archive") {
      requireCapability("archive");
      if (![STATUS.DRAFT, STATUS.REJECTED, STATUS.APPROVED, STATUS.PUBLISHED].includes(previous)) throw new Error("Cancel a scheduled publication separately before archiving; archived records cannot be archived again.");
      record.status = STATUS.ARCHIVED; record.archivedAt = now(); record.archivedBy = actor.id;
    } else if (action === "cancelSchedule") {
      requireCapability("publish");
      if (previous !== STATUS.SCHEDULED) throw new Error("Only scheduled announcements can have publication cancelled.");
      record.status = STATUS.DRAFT; record.scheduledAt = "";
    } else if (action === "submit") {
      if (!policy().approvalRequired || !editable(record) || ![STATUS.DRAFT, STATUS.REJECTED].includes(previous)) throw new Error("This announcement cannot be submitted for approval.");
      validate(record); record.status = STATUS.PENDING;
    } else if (action === "approve" || action === "reject") {
      requireCapability("review"); requireCapability("approve");
      if (!policy().approvalRequired || previous !== STATUS.PENDING) throw new Error("This announcement is not awaiting configured approval.");
      if (policy().separateApprover && record.authorId === actor.id) throw new Error("A different authorized reviewer must approve this announcement.");
      if (action === "reject" && !String(options.reason || "").trim()) throw new Error("Provide a rejection reason.");
      record.status = action === "approve" ? STATUS.APPROVED : STATUS.REJECTED;
      if (action === "approve") record.approvedCore = core(record);
    } else throw new Error("Unsupported announcement action.");
    record.updatedAt = now(); record.revision++;
    const labels = { archive: "Archived", cancelSchedule: "Scheduled Publication Cancelled", submit: "Submitted for Approval", approve: "Approved", reject: "Rejected" };
    addHistory(record, labels[action], actor, previous, String(options.reason || "").trim().slice(0, 1000));
    return persist(record, false, revision);
  }
  function student() {
    const account = window.PortalProfile?.snapshot()?.account;
    if (account?.role !== "student") throw new Error("Sign in as a student to view announcements.");
    return account;
  }
  function publicFeed() {
    student(); const timestamp = now();
    return read().filter((record) => [STATUS.PUBLISHED, STATUS.SCHEDULED].includes(record.status) && record.published && typeof record.published.content === "string" && record.published.audience === "All Students" && validTime(record.published.publishedAt) && record.published.publishedAt <= timestamp && (!record.published.expiresAt || validTime(record.published.expiresAt) && record.published.expiresAt > timestamp)).map(({ id, published }) => ({ id, title: published.title, content: published.content, category: published.category, audience: published.audience, priority: published.priority, version: published.version, publishedAt: published.publishedAt, expiresAt: published.expiresAt, publisher: published.publisher })).sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  }
  function publicGet(id) { return publicFeed().find((record) => record.id === id) || null; }
  function readIds() { return [...seenIds]; }
  function notifications() {
    const seen = new Set(readIds());
    return publicFeed().map((record) => ({ id: `announcement:${record.id}`, announcementId: record.id, title: record.title, timestamp: record.publishedAt, unread: !seen.has(record.id) }));
  }
  async function markRead(id) {
    if (!publicGet(id) || !userId) throw new Error("This announcement is not available to your account.");
    checked(await client().from("announcement_reads").upsert({user_id:userId,announcement_id:id},{onConflict:"user_id,announcement_id",ignoreDuplicates:true}));
    await refresh();
  }
  function summary(records = list()) {
    return { total: records.length, published: records.filter((item) => item.status === STATUS.PUBLISHED && item.published && item.published.publishedAt <= now() && (!item.published.expiresAt || item.published.expiresAt > now())).length, draft: records.filter((item) => item.status === STATUS.DRAFT).length, scheduled: records.filter((item) => item.status === STATUS.SCHEDULED && item.scheduledAt > now()).length, due: records.filter((item) => item.status === STATUS.SCHEDULED && item.scheduledAt <= now()).length };
  }
  window.PortalAnnouncementService = Object.freeze({ STORAGE_KEY, STATUS, refresh, list, get, save, transition, summary, capabilities, editable, validate, fromManila, toManila, publicFeed, publicGet, notifications, markRead });
})();
