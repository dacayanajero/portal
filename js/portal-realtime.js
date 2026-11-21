"use strict";

// One authenticated channel per active portal tab. Events only invalidate caches;
// fresh queries remain subject to RLS. No service key or event payload is displayed.
(() => {
  const client = () => window.PortalSupabase?.client;
  let channel = null, uid = null, generation = 0, connected = false;
  let debounce = null, periodic = null, running = false, pending = new Set();
  let inbox = [], initialized = false, announcementsSeen = null, inboxError = "";
  const groups = ["requests", "announcements", "inbox"];
  const notify = () => document.dispatchEvent(new Event("portal:notificationschanged"));

  function toast(title) {
    if (document.hidden || !title) return;
    const element = document.createElement("div");
    element.setAttribute("role", "status");
    element.setAttribute("aria-live", "polite");
    element.textContent = title;
    Object.assign(element.style, {position:"fixed", bottom:"24px", right:"24px",
      maxWidth:"min(340px, calc(100vw - 48px))", padding:"14px 18px",
      background:"#0c3084", color:"#fff", borderRadius:"10px", zIndex:"10000",
      boxShadow:"0 4px 16px #0003", overflowWrap:"anywhere"});
    element.dataset.portalLiveToast = "true";
    document.querySelector("[data-portal-live-toast]")?.remove();
    document.body.append(element);
    setTimeout(() => element.remove(), 5000);
  }
  function list() {
    if (inboxError) throw new Error(inboxError);
    return inbox.map(row => ({ id:"db:"+row.id, dbId:row.id, source:"database",
      kind:row.kind, refTable:row.ref_table, refId:row.ref_id, title:row.title,
      body:row.body, timestamp:row.created_at, unread:!row.is_read }));
  }
  async function loadInbox(epoch) {
    const id = uid;
    const result = await client().from("notifications").select("id,kind,title,body,ref_table,ref_id,is_read,created_at")
      .eq("user_id",id).order("created_at",{ascending:false}).limit(100);
    if (epoch !== generation || uid !== id) return;
    if (result.error) { inboxError=result.error.message; notify(); throw result.error; }
    const next = result.data || [];
    if (initialized) {
      const before = new Set(inbox.map(row=>row.id));
      const fresh = next.filter(row=>!row.is_read && !before.has(row.id));
      const permitted = fresh.filter(row => { const candidate = {source:"database",kind:row.kind,unread:true}; const staff=window.PortalStaffContext?.current()?.account; let prefs={}; try { if(staff?.role==="staff") prefs=window.PortalStaffAccountService.preferences(); } catch {} return !window.PortalNotifications || window.PortalNotifications.visible([candidate],prefs).length; });
      if (permitted.length) toast(permitted.length === 1 ? permitted[0].title : permitted.length+" new portal updates");
    }
    inbox=next; inboxError=""; initialized=true; notify();
  }
  async function markRead(id) {
    const epoch=generation, owner=uid;
    if (!owner || !inbox.some(row=>row.id===id)) throw new Error("Notification unavailable.");
    const result=await client().from("notifications").update({is_read:true})
      .eq("id",id).eq("user_id",owner).select("id").single();
    if (result.error) throw new Error(result.error.message);
    if (epoch===generation) { inbox=inbox.map(row=>row.id===id?{...row,is_read:true}:row); notify(); enqueue("inbox"); }
  }
  async function loadAnnouncements(epoch) {
    await window.PortalAnnouncementService.refresh();
    if (epoch!==generation) return;
    const student=window.PortalProfile?.snapshot()?.account;
    if(student?.role!=="student") return;
    const notices=window.PortalAnnouncementService.notifications();
    const next=new Set(notices.map(n=>n.id));
    if(announcementsSeen) {
      const fresh=notices.filter(n=>n.unread&&!announcementsSeen.has(n.id));
      // Respect the existing announcement alert preference.
      let alerts=true;
      try { alerts=JSON.parse(localStorage.getItem(window.PortalAccounts.preferencesKey(student))||"{}").announcementAlerts!==false; } catch {}
      if(alerts&&fresh.length) toast(fresh.length===1?fresh[0].title:fresh.length+" new announcements");
    }
    announcementsSeen=next;
    notify(); // also recalculate expiry when no database row changed
  }
  function enqueue(...names) {
    if(!uid) return;
    names.forEach(name=>pending.add(name));
    if(running||debounce!==null) return;
    debounce=setTimeout(()=>{debounce=null;void flush();},250);
  }
  async function flush() {
    if(running||!uid||!pending.size) return;
    const epoch=generation, work=[...pending];
    pending.clear(); running=true;
    try {
      const results=await Promise.allSettled(work.map(name=>name==="requests"
        ?window.PortalRequestService.refresh():name==="announcements"
        ?loadAnnouncements(epoch):loadInbox(epoch)));
      if(epoch===generation) results.forEach(r=>{if(r.status==="rejected") console.warn("Live sync:",r.reason?.message||r.reason);});
    } finally {
      running=false;
      if(uid&&pending.size) enqueue();
    }
  }
  function stop() {
    generation++; connected=false; uid=null; pending.clear();
    clearTimeout(debounce); debounce=null; clearInterval(periodic); periodic=null;
    const old=channel; channel=null;
    if(old&&client()) void client().removeChannel(old).catch(console.warn);
    inbox=[]; inboxError=""; initialized=false; announcementsSeen=null;
    document.querySelector("[data-portal-live-toast]")?.remove(); notify();
  }
  async function start() {
    stop();
    const epoch=generation, sb=client();
    if(!sb) return;
    const {data,error}=await sb.auth.getSession();
    if(error||!data?.session||epoch!==generation) return;
    uid=data.session.user.id;
    // INSERT/UPDATE only: DELETE events cannot be filtered with normal RLS
    // semantics. The reconciliation query handles deletes/archiving/expiry.
    const bindings=[
      ["requests","requests"],["appointments","requests"],
      ["notifications","inbox","user_id=eq."+uid],
      ["announcements","announcements"],
      ["announcement_reads","announcements","user_id=eq."+uid]
    ];
    let live=sb.channel("portal-live:"+uid+":"+epoch);
    bindings.forEach(([table,group,filter])=>{
      ["INSERT","UPDATE"].forEach(event=>{
        live=live.on("postgres_changes",{event,schema:"public",table,...(filter?{filter}:{})},()=>{
          if(epoch===generation) enqueue(group);
        });
      });
    });
    channel=live;
    live.subscribe(status=>{
      if(epoch!==generation) return;
      connected=status==="SUBSCRIBED";
      if(connected) enqueue(...groups); // catch anything missed during connection/rejoin
      else if(["CHANNEL_ERROR","TIMED_OUT","CLOSED"].includes(status)) enqueue(...groups);
    });
    enqueue(...groups);
    // Slow reconciliation even when connected: time-based publication/expiry,
    // RLS visibility changes and deletes may not send a visible event.
    periodic=setInterval(()=>{if(!document.hidden) enqueue(...groups);},60000);
    // Reconcile all sources occasionally while connected, too.
  }
  document.addEventListener("portal:login",()=>void start().catch(console.warn));
  for(const event of ["portal:logout","portal:sessioninvalidated"]) document.addEventListener(event,stop);
  window.addEventListener("online",()=>enqueue(...groups));
  window.addEventListener("focus",()=>enqueue(...groups));
  document.addEventListener("visibilitychange",()=>{if(!document.hidden) enqueue(...groups);});
  window.PortalRealtime=Object.freeze({list,markRead,connected:()=>connected,refresh:()=>enqueue(...groups)});
})();
