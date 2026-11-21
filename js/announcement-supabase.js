"use strict";

// Supabase is the shared source for staff and student announcements.
// Keep the legacy browser-local service only when Supabase is not configured.
(() => {
  const base = window.PortalAnnouncementService;
  const holder = window.PortalSupabase;
  if (!holder?.configured || !holder.client || !base) return;

  const client = holder.client;
  const S = base.STATUS;
  let records = [];
  let readIds = new Set();
  let viewerId = "";
  let viewerKey = "";
  let lastError = "";
  let loadVersion = 0;

  function account() {
    return window.PortalStaffContext?.current()?.account
      || window.PortalProfile?.snapshot()?.account || null;
  }
  function staff() {
    const value = account();
    if (value?.role !== "staff" && value?.role !== "admin") throw new Error("Sign in as staff to manage announcements.");
    return value;
  }
  function student() {
    const value = window.PortalProfile?.snapshot()?.account;
    if (value?.role !== "student") throw new Error("Sign in as a student to view announcements.");
    return value;
  }
  function inform() { document.dispatchEvent(new Event("portal:announcementschanged")); }
  function readableDate(value) { return value && !Number.isNaN(new Date(value).getTime()); }

  // Store midnight AFTER the selected Manila end date, as an exclusive UTC instant.
  // Thus the notice remains visible for the whole selected calendar day.
  function fromEndDate(value) {
    if (!value) return "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Select a valid end date.");
    const midnight = new Date(value + "T00:00:00+08:00");
    if (Number.isNaN(midnight.getTime()) || base.toManila(midnight.toISOString()).slice(0, 10) !== value) {
      throw new Error("Select a valid Manila calendar date.");
    }
    return new Date(midnight.getTime() + 86400000).toISOString();
  }
  function toEndDate(value) {
    if (!readableDate(value)) return "";
    return base.toManila(new Date(new Date(value).getTime() - 1).toISOString()).slice(0, 10);
  }
  function fromRow(row) {
    const published = row.status === S.PUBLISHED && readableDate(row.published_at)
      ? { title: row.title, content: row.content, category: row.category, audience: row.audience,
          priority: row.priority, version: row.revision, publishedAt: row.published_at,
          expiresAt: row.expires_at || "", publisher: row.author_name || "University Staff" } : null;
    return {
      id: row.id, title: row.title, content: row.content, category: row.category,
      audience: row.audience, priority: row.priority, status: row.status,
      authorId: row.author_id, author: row.author_name || "University Staff",
      revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at,
      scheduledAt: row.scheduled_for || "", expiresAt: row.expires_at || "",
      publishedAt: row.published_at || "", published, source: "Supabase",
      // Historical versions are not invented from the latest database row.
      versions: [], history: [], notifications: [],
    };
  }
  function sorted() {
    return records.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  function list() { staff(); if (lastError) throw new Error(lastError); return sorted(); }
  function get(id) { return list().find((item) => item.id === id) || null; }
  function capabilities() {
    staff();
    return base.capabilities();
  }
  function editable(record) {
    return Boolean(record && (account()?.role === "staff" || account()?.role === "admin")
      && ![S.ARCHIVED, S.PENDING].includes(record.status));
  }
  function requirePermission(permission) {
    staff();
    if (!capabilities().includes(permission)) throw new Error("Your staff account needs announcement " + permission + " permission.");
  }

  function publicFeed() {
    student();
    if (lastError) throw new Error(lastError);
    const timestamp = new Date().toISOString();
    return sorted().filter((row) => row.status === S.PUBLISHED && row.published
      && row.published.audience === "All Students" && row.published.publishedAt <= timestamp
      && (!row.expiresAt || row.expiresAt > timestamp))
      .map((row) => ({ id: row.id, ...row.published }))
      .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  }
  function publicGet(id) { return publicFeed().find((item) => item.id === id) || null; }
  function notifications() {
    return publicFeed().map((item) => ({
      id: "announcement:" + item.id, announcementId: item.id, title: item.title,
      timestamp: item.publishedAt, unread: !readIds.has(item.id),
    }));
  }
  function markRead(id) {
    if (!publicGet(id)) throw new Error("This announcement is no longer available.");
    if (readIds.has(id)) return;
    readIds.add(id); inform();
    if (!viewerId) return;
    void client.from("announcement_reads").upsert({
      user_id: viewerId, announcement_id: id, read_at: new Date().toISOString(),
    }, { onConflict: "user_id,announcement_id" }).then(({ error }) => {
      if (error) {
        readIds.delete(id); inform();
        console.error("Could not save announcement read status:", error.message);
      }
    });
  }
  function summary(items = list()) {
    const timestamp = new Date().toISOString();
    return {
      total: items.length,
      published: items.filter((r) => r.status === S.PUBLISHED && r.published
        && r.published.publishedAt <= timestamp && (!r.expiresAt || r.expiresAt > timestamp)).length,
      draft: items.filter((r) => r.status === S.DRAFT).length,
      scheduled: items.filter((r) => r.status === S.SCHEDULED && r.scheduledAt > timestamp).length,
      due: items.filter((r) => r.status === S.SCHEDULED && r.scheduledAt <= timestamp).length,
    };
  }
  async function refresh() {
    const generation = ++loadVersion;
    const current = account();
    const key = current ? (current.role + ":" + current.accountNumber) : "";
    if (viewerKey !== key) {
      viewerKey = key; records = []; readIds = new Set(); viewerId = ""; lastError = "";
      inform();
    }
    if (!current || !["student", "staff", "admin"].includes(current.role)) return;
    try {
      const { data: auth, error: authError } = await client.auth.getUser();
      if (authError) throw authError;
      if (!auth?.user?.id) { if (generation === loadVersion) { records = []; viewerId = ""; inform(); } return; }
      const isStudent = current.role === "student";
      let query = client.from("announcements").select("*").order("created_at", { ascending: false });
      if (isStudent) query = query.eq("status", "Published").lte("published_at", new Date().toISOString());
      const [notices, reads] = await Promise.all([
        query,
        isStudent ? client.from("announcement_reads").select("announcement_id").eq("user_id", auth.user.id)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (notices.error) throw notices.error;
      if (reads.error) throw reads.error;
      if (generation !== loadVersion || viewerKey !== key) return;
      records = (notices.data || []).map(fromRow);
      readIds = new Set((reads.data || []).map((r) => r.announcement_id));
      viewerId = auth.user.id; lastError = "";
      inform();
    } catch (error) {
      if (generation !== loadVersion) return;
      records = []; readIds = new Set(); viewerId = "";
      lastError = "Could not load announcements from Supabase: " + error.message;
      inform();
    }
  }
  async function saveAsync(input, options = {}) {
    requirePermission("view");
    const action = options.action || "draft";
    if (!["draft", "publish"].includes(action)) throw new Error("Announcements can be saved as drafts or published now.");
    if (action === "publish") {
      requirePermission("publish");
      if (options.confirmed !== true) throw new Error("Confirm publication first.");
    } else requirePermission("create");
    const data = base.validate({ ...input, scheduledAt: "" });
    const existing = options.id ? records.find((r) => r.id === options.id) : null;
    if (options.id && !existing) throw new Error("Announcement not found. Refresh before editing.");
    if (existing && existing.revision !== options.revision) throw new Error("This announcement has changed. Reopen it before saving.");
    if (existing && !editable(existing)) throw new Error("This announcement cannot be edited.");
    if (existing?.status === S.PUBLISHED && action !== "publish") throw new Error("Published announcements must be revised and republished.");
    const timestamp = new Date().toISOString();
    if (action === "publish" && data.expiresAt && data.expiresAt <= timestamp) {
      throw new Error("End date must be today or later in Asia/Manila.");
    }
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth?.user?.id) throw new Error("Your staff session is unavailable. Sign in again.");
    const payload = {
      title: data.title, content: data.content, category: data.category, audience: data.audience,
      priority: data.priority, status: action === "publish" ? S.PUBLISHED : S.DRAFT,
      scheduled_for: null, expires_at: data.expiresAt || null, updated_at: timestamp,
      revision: (existing?.revision || 0) + 1,
    };
    if (action === "publish") payload.published_at = timestamp;
    let query;
    if (existing) {
      query = client.from("announcements").update(payload).eq("id", existing.id)
        .eq("revision", existing.revision).select("*").maybeSingle();
    } else {
      const authorName = window.PortalStaffContext?.current()?.profile?.fullName
        || staff().fullName || "University Staff";
      query = client.from("announcements").insert({
        ...payload, author_id: auth.user.id, author_name: authorName,
      }).select("*").single();
    }
    const { data: saved, error } = await query;
    if (error) throw new Error("Announcement could not be saved in Supabase: " + error.message);
    if (!saved) throw new Error("Announcement was changed by another staff member. Refresh and try again.");
    await refresh();
    return fromRow(saved);
  }
  async function transitionAsync(id, revision, action, options = {}) {
    requirePermission(action === "archive" ? "archive" : "publish");
    if (options.confirmed !== true) throw new Error("Confirm this action first.");
    if (!["archive", "cancelSchedule"].includes(action)) throw new Error("Unsupported announcement action.");
    const existing = records.find((r) => r.id === id);
    if (!existing || existing.revision !== revision) throw new Error("This announcement changed. Reopen it before continuing.");
    if (action === "archive" && ![S.PUBLISHED, S.DRAFT, S.APPROVED, S.REJECTED].includes(existing.status)) throw new Error("This announcement cannot be archived.");
    if (action === "cancelSchedule" && existing.status !== S.SCHEDULED) throw new Error("Only scheduled announcements can be cancelled.");
    const payload = {
      status: action === "archive" ? S.ARCHIVED : S.DRAFT,
      revision: existing.revision + 1, updated_at: new Date().toISOString(),
    };
    if (action === "cancelSchedule") payload.scheduled_for = null;
    const { data: saved, error } = await client.from("announcements").update(payload)
      .eq("id", id).eq("revision", revision).select("*").maybeSingle();
    if (error) throw new Error("Announcement update failed: " + error.message);
    if (!saved) throw new Error("This announcement changed in another session. Refresh and try again.");
    await refresh();
    return fromRow(saved);
  }

  window.PortalAnnouncementService = Object.freeze({
    ...base, list, get, capabilities, editable, publicFeed, publicGet, notifications, markRead,
    summary, refresh, saveAsync, transitionAsync, fromEndDate, toEndDate,
    sourceInfo: () => ({ backend: "Supabase", error: lastError }),
  });
  ["portal:login", "portal:accountchange", "portal:staffaccountchange", "portal:logout"].forEach((name) => {
    document.addEventListener(name, () => { void refresh(); });
  });
  void refresh();
})();
