"use strict";
(() => {
  const engine = window.PortalNLP;
  const fallback = engine.fallback;
  function interpret(question) {
    const result = engine.classify(question);
    if (result.intent === "unknown") {
      try {
        const faq = window.PortalFAQService?.match(question);
        if (faq && faq.publisher !== "Built-in portal usage guide (development)") return {...result,intent:"faq",answer:faq.answer};
      } catch {}
    }
    return result;
  }
  async function respond(question) {
    const result = interpret(question);
    if (!["request_status","appointment_status"].includes(result.intent)) return result;
    const account = window.PortalProfile?.snapshot()?.account;
    const current = () => window.PortalProfile?.snapshot()?.account;
    if (account?.role !== "student" || !account.accountNumber) return {...result,answer:"Sign in as a student to see your own request status."};
    const requests = window.PortalRequestService;
    try {
      if (!requests?.refresh) throw new Error("Database unavailable");
      await requests.refresh();
      if (current()?.role !== "student" || current()?.accountNumber !== account.accountNumber) return {...result,answer:"Your session changed. Please sign in again."};
      const service = result.intent === "appointment_status" ? window.PortalAppointmentService : requests;
      const rows = service.listForStudent(account.accountNumber).filter(row => !result.service || (row.documentType || row.serviceType) === result.service);
      if (!rows.length) return {...result,answer:"No matching records were returned for your account. Open My Request to review your history or choose a service to submit a request."};
      const summary = rows.slice(0,5).map(row => result.intent === "appointment_status" ? [row.serviceType,row.date,row.timeRange,row.status].filter(Boolean).join(" — ") : [row.documentType,row.referenceNo || row.id,row.status].filter(Boolean).join(" — ")).join("\n");
      return {...result,answer:"Your available records:\n"+summary+(rows.length>5?"\nMore records are available in My Request.":"")+"\nOpen My Request for details."};
    } catch {
      return {...result,answer:"I could not refresh your records right now. Please open My Request or try again. I will not guess your status."};
    }
  }
  window.PortalAIService = Object.freeze({interpret,respond,answer:async question=>(await respond(question)).answer,fallback});
})();
