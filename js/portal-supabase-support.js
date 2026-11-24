"use strict";
// Shared database adapter; the old browser-only service remains for standalone demo tests.
(() => {
  const base = window.PortalSupportService;
  if (!window.PortalSupabase?.configured) return;
  const sb = window.PortalSupabase.client;
  let rows = [], staff = [], caps = [], viewer = null, generation = 0, error = "", ready = false;
  const changed = () => document.dispatchEvent(new Event("portal:supportchanged"));
  const clone = x => JSON.parse(JSON.stringify(x));
  const check = r => { if (r.error) throw new Error(r.error.message); return r.data; };
  const account = () => window.PortalAccounts?.sessionInfo();
  const role = () => account()?.role;
  const clear = () => { generation++; rows = []; staff = []; caps = []; viewer = null; ready = false; error = ""; changed(); };
  const verify = () => { if (error) throw new Error(error); if (!ready || !viewer) throw new Error("Loading support tickets from Supabase…"); };
  const allCaps = ["viewAll","viewAssigned","reply","note","assign","manage","resolve","close","reopen","studentContact","faqView","faqCreate","faqEditOwn","faqManage","faqPublish","faqArchive"];
  async function refresh() {
    const stamp = ++generation;
    try {
      const p = await window.PortalSupabaseApi.profile();
      const isStaff = p.role === "staff" || p.role === "admin";
      if (viewer && viewer.id !== p.id) { rows=[]; staff=[]; caps=[]; ready=false; }
      const [tickets, messages, history, grants, directory] = await Promise.all([
        sb.from("support_tickets").select("*").order("created_at",{ascending:false}),
        sb.from("support_messages").select("*").order("created_at",{ascending:true}),
        sb.from("audit_log").select("*").eq("entity","ticket").order("created_at",{ascending:true}),
        isStaff ? sb.from("staff_capabilities").select("capability").eq("user_id",p.id) : Promise.resolve({data:[]}),
        isStaff ? sb.from("profiles").select("id,account_number,full_name").eq("role","staff").eq("is_active",true) : Promise.resolve({data:[]})
      ]);
      const t = check(tickets), m = check(messages), h = check(history), c = check(grants), d = check(directory);
      if (stamp !== generation) return;
      viewer=p; caps=p.role==="admin"?allCaps:c.map(x=>x.capability); staff=d.map(x=>({id:x.id,accountNumber:x.account_number,fullName:x.full_name}));
      rows=t.map(x=>{
        const ownMessages=m.filter(y=>y.ticket_id===x.id);
        const mapMessage=y=>({id:y.id,text:y.body,sender:y.sender_name,role:y.sender_role==="student"?"student":"staff",timestamp:y.created_at});
        const publicMessages=ownMessages.filter(y=>!y.is_internal).map(mapMessage);
        const events=h.filter(y=>y.entity_id===x.id&&(isStaff||y.public_visible)).map(y=>({id:y.id,action:y.action,actor:y.actor_name,role:y.actor_role,timestamp:y.created_at,previousStatus:y.previous_status||"",newStatus:y.new_status||"",remarks:y.remarks||""}));
        const item={id:x.id,referenceNo:x.reference_no,studentNumber:x.student_number,studentName:x.student_name,subject:x.subject,category:x.category,createdAt:x.created_at,updatedAt:x.updated_at,status:x.status,priority:x.priority,assignedStaffId:staff.find(a=>a.id===x.assigned_staff_id)?.accountNumber||"",assignedStaff:x.assigned_staff_name||"",requestId:x.request_id||"",appointmentId:x.appointment_id||"",revision:x.revision,description:publicMessages[0]?.text||"",lastResponseAt:publicMessages.filter(y=>y.role==="staff").at(-1)?.timestamp||"",messages:publicMessages,history:events,resolutions:events.filter(y=>y.newStatus==="Resolved"&&y.previousStatus!=="Resolved").map(y=>({summary:y.remarks,timestamp:y.timestamp,actor:y.actor}))};
        if(isStaff&&caps.includes("note")) item.notes=ownMessages.filter(y=>y.is_internal).map(mapMessage);
        if(isStaff&&caps.includes("studentContact")) item.email=x.email;
        if(!isStaff) delete item.assignedStaffId;
        return item;
      });
      error="";ready=true;changed();
    } catch(e) { if(stamp===generation){rows=[];staff=[];caps=[];ready=false;error=e.message||String(e);changed();} throw e; }
  }
  function listStudent(){verify();if(viewer.role!=="student")throw new Error("Student access required.");return clone(rows);}
  function listStaff(){verify();if(!["staff","admin"].includes(viewer.role))throw new Error("Staff access required.");return clone(rows);}
  function get(id){verify();return clone(rows.find(x=>x.id===id||x.referenceNo===id)||null);}
  async function create(input,token){
    const p=await window.PortalSupabaseApi.profile();
    if(p.role!=="student")throw new Error("Student access required.");
    const request=input.requestId?window.PortalRequestService.getForStudent(input.requestId,p.account_number):null;
    const appointment=input.appointmentId?window.PortalAppointmentService.get(input.appointmentId):null;
    if(input.requestId&&!request?.dbId)throw new Error("Related request unavailable.");
    if(input.appointmentId&&(!appointment?.dbId||appointment.studentNumber!==p.account_number))throw new Error("Related appointment unavailable.");
    const id=check(await sb.rpc("portal_create_support_ticket",{p_id:token,p_subject:String(input.subject||"").trim(),p_category:input.category,p_description:String(input.description||"").trim(),p_request:request?.dbId||null,p_appointment:appointment?.dbId||null}));
    const saved=check(await sb.from("support_tickets").select("id,reference_no").eq("id",id).single());
    await refresh().catch(console.warn);return {id:saved.id,referenceNo:saved.reference_no};
  }
  async function reply(id,body,options={}){
    verify();
    await sb.rpc("portal_reply_support_ticket",{p_ticket:id,p_message:options.token,p_revision:options.revision,p_body:String(body||"").trim(),p_internal:!!options.internal}).then(check);
    await refresh().catch(console.warn);
  }
  async function update(id,changes,options={}){
    verify();const patch={};
    if(changes.assignedStaffId!==undefined){const assignee=staff.find(x=>x.accountNumber===changes.assignedStaffId);if(changes.assignedStaffId&&!assignee)throw new Error("Invalid staff assignment.");patch.assigned_staff_id=assignee?.id||null;}
    if(changes.priority!==undefined)patch.priority=changes.priority;
    if(!Object.keys(patch).length)return;
    check(await sb.from("support_tickets").update(patch).eq("id",id).eq("revision",options.revision).select("id").single());
    await refresh().catch(console.warn);
  }
  async function transition(id,target,options={}){
    verify();if(!options.confirmed)throw new Error("Confirm this action first.");
    check(await sb.rpc("portal_transition_support_ticket",{p_ticket:id,p_revision:options.revision,p_status:target,p_remarks:options.reason||""}));
    await refresh().catch(console.warn);
  }
  function related(id){const t=get(id);if(!t)throw new Error("Ticket unavailable.");const request=t.requestId&&window.PortalRequestService.get(t.requestId);const appointment=t.appointmentId&&window.PortalAppointmentService.get(t.appointmentId);return {request:request||null,appointment:appointment||null};}
  function summary(records=listStaff()){return base.summary(records);}
  function analytics(range={}){
    const records=listStaff(), dates=window.PortalReportService.validateFilters({start:range.start,end:range.end});
    const start=Date.parse(dates.start+"T00:00:00+08:00"),end=Date.parse(dates.end+"T23:59:59.999+08:00");
    const inRange=x=>Date.parse(x)>=start&&Date.parse(x)<=end&&Date.parse(x)<=Date.now();
    const cohort=records.filter(x=>inRange(x.createdAt)),resolved=records.filter(x=>x.resolutions.some(r=>inRange(r.timestamp)));
    const mean=pairs=>{const values=pairs.map(([a,b])=>(Date.parse(b)-Date.parse(a))/3600000).filter(x=>Number.isFinite(x)&&x>=0);return {hours:values.length?values.reduce((a,b)=>a+b,0)/values.length:null,eligible:values.length,excluded:pairs.length-values.length};};
    return {available:true,...summary(cohort),byCategory:window.PortalSupportPolicy.categories.map(category=>({label:category,value:cohort.filter(x=>x.category===category).length})),resolvedDuringPeriod:resolved.length,firstResponse:mean(cohort.map(x=>[x.createdAt,x.lastResponseAt?x.messages.find(m=>m.role==="staff")?.timestamp:""])),resolution:mean(resolved.map(x=>[x.createdAt,x.resolutions.filter(r=>inRange(r.timestamp)).at(-1)?.timestamp]))};
  }
  async function acknowledgeTicket(id){const notices=window.PortalRealtime?.list()||[];await Promise.all(notices.filter(n=>n.refTable==="support_tickets"&&n.refId===id&&n.unread).map(n=>window.PortalRealtime.markRead(n.dbId)));}
  window.PortalSupportService=Object.freeze({...base,refresh,capabilities:()=>[...caps],eligibleStaff:()=>clone(staff),listStudent,listStaff,getStudent:get,getStaff:get,create,reply,update,transition,related,summary,analytics,notifications:()=>[],markRead:()=>{},acknowledgeTicket,database:true});
  for(const event of ["portal:logout","portal:sessioninvalidated"]) document.addEventListener(event,clear);
  document.addEventListener("portal:login",()=>{clear();void refresh().catch(console.warn);});
})();
