"use strict";

// Deterministic domain NLP: normalization, token matching, typo tolerance, entity and intent detection.
const createPortalNlp = function makeNlp(){
  const fallback="I couldn't confidently identify your academic service question. Please mention the document or concern (Grade Slip, Registration Form, ID, TOR, COE, appointment, request status, or support), or open Help.";
  const normalize=v=>String(v??"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");
  const distance=(a,b)=>{let row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(a[i-1]===b[j-1]?0:1));row=next;}return row[b.length];};
  const has=(q,phrase)=>{const words=q.split(" "), terms=phrase.split(" ");return words.some((_,i)=>terms.every((t,j)=>{const w=words[i+j];return w===t||Boolean(w&&t.length>=5&&w.length>=4&&distance(w,t)<=1);}));};
  const any=(q,phrases)=>phrases.some(p=>has(q,p));
  const services=[
    {name:"Grade Slip",route:"grade-slip",aliases:["grade slip","gradeslip","gradeslips","grade report","my grades","grades","grado"]},
    {name:"Registration Form",route:"registration-form",aliases:["registration form","regiform","regi form","reg form","registration slip","enrollment form"]},
    {name:"ID Printing",route:"id-printing",aliases:["id printing","student id","school id","id card","lost id","id"]},
    {name:"Transcript of Records",route:"services",aliases:["transcript of records","transcript","tor"]},
    {name:"Certificate of Enrollment",route:"services",aliases:["certificate of enrollment","enrollment certificate","coe"]}
  ];
  const result=(intent,route,label,answer,service=null)=>({intent,route,label,answer,service:service?.name??null});
  function classify(question){
    const q=normalize(question);
    const help=(intent,answer)=>result(intent,"help","Open Help",answer);
    const requests=(intent,answer,service)=>result(intent,"requests","Open My Request",answer,service);
    if(!q||String(question).length>1000)return help("unknown",fallback);
    if(any(q,["someone else","another student","other student","classmate","ibang student","ibang estudyante","student ng iba"]))return help("privacy","I can only help you access your own requests and appointments. I cannot disclose another student's records.");
    const hits=services.filter(s=>any(q,s.aliases));
    const service=hits.length===1?hits[0]:null;
    if(any(q,["support ticket","contact support","report a problem","ticket status","complaint","technical problem","help desk","kausapin staff"]))return help("support","Open Help → Contact Support to create an inquiry, or My Support Tickets to view and reply to your existing tickets.");
    if(any(q,["forgot password","reset password","change password","login problem","password","forgot my password"]))return result("account","settings","Open Settings","Use Settings to manage your password while signed in. If you cannot sign in, choose Forgot Password on the login page and follow the email link.");
    if(any(q,["edit profile","update profile","my profile","change name","change my name","student number"]))return result("profile","profile","Open My Profile","Open My Profile to view or edit the fields available to your account. Official university records must be corrected through the appropriate office.");
    if(any(q,["announcement","announcements","enrollment schedule","when is enrollment","enrollment date","next term","pasukan"]))return result("announcements","announcements","View Announcements","Check published Announcements for university advisories. Confirm official enrollment dates with the registrar.");
    const appointment=any(q,["appointment","booking","schedule","iskedyul"]);
    const change=any(q,["cancel","reschedule","modify","edit","change","kansela","palitan","move"]);
    if(change&&(appointment||service||any(q,["request","document","application"])))return requests("change_request","Open My Request and inspect the available actions for your request or appointment. If the action is unavailable, contact support. The assistant will not change or cancel a booking automatically.",service);
    const timing=any(q,["how long","how many days","processing time","ilang araw","gaano katagal","when will","kailan makukuha"]);
    const status=any(q,["status","track","progress","ready","released","approved","pending","nasaan","kumusta","handa na","nakuha","update on"]);
    const own=any(q,["my","ko","akin","aking","request","application","submitted","booked"]);
    if(timing&&!status)return requests("processing_time","Processing time depends on staff review. The portal does not promise a release date; check My Request for the recorded status.",service);
    if((status||(appointment&&own&&any(q,["when","kailan","what time","anong oras"])))&&(own||service||appointment))return requests(appointment?"appointment_status":"request_status","Open My Request to see the latest recorded status of your own "+(appointment?"appointments.":"document requests."),service);
    if(hits.length>1)return result("clarify","services","Explore services","I found more than one document in your question: "+hits.map(s=>s.name).join(", ")+". Which one do you need? Please ask about one service at a time.");
    const official=any(q,["requirement","requirements","documents needed","need to bring","what documents do i need","fee","fees","how much","magkano","kailangan","dalhin","clearance"]);
    if(service){
      const guidance=service.route==="services"?"Open Services and select "+service.name+". Enter the requested information and review it before submitting.":"Open Services → "+service.name+". Complete the displayed information, select an available schedule, review your details and confirm. Track the submitted request in My Request.";
      return result(official?"requirements":"document_request",service.route,"Open "+service.name,(official?"The portal does not establish official document requirements or fees. Review the "+service.name+" form and confirm any official requirements with the university. ":"")+guidance,service);
    }
    if(appointment)return result("appointment","services","Explore services","Choose the academic service you need and select an available date and time if scheduling is offered. Review the information before confirming.");
    if(any(q,["documents","services","request a document","papeles","document request"]))return result("services","services","Explore services","Available services include Grade Slip, Registration Form, ID Printing, Transcript of Records, and Certificate of Enrollment. Which document do you need?");
    if(official)return help("requirements","Please specify the document or service you need. Confirm official requirements and fees with the authorized university office.");
    if(any(q,["hello","hi","good morning","good day","kumusta","kamusta","salamat","thank you"])&&q.split(" ").length<=4)return result("greeting","services","Explore services","Hello! I can help you find academic services, check your requests, or contact support. What do you need?");
    return help("unknown",fallback);
  }
  return Object.freeze({classify,normalize,fallback});
};
if (typeof module !== "undefined" && module.exports) module.exports = createPortalNlp();
else window.PortalNLP = createPortalNlp();
