"use strict";
// Standalone, ASYNCHRONOUS Supabase data adapter for the RTU portal.
// It is NOT automatically wired into the existing PortalAccounts or PortalRequestService.
// Use it to validate the backend, then migrate each UI module deliberately.
(() => {
  function client() {
    const holder = window.PortalSupabase;
    if (!holder?.configured || !holder.client) {
      throw new Error("Supabase not configured: fill js/supabase-config.js and check the script paths.");
    }
    return holder.client;
  }
  function fail(error) {
    if (error) throw new Error(error.message || String(error));
  }
  async function profile() {
    const sb = client();
    // getUser validates the current Auth session with the Auth server.
    const { data: userData, error: userError } = await sb.auth.getUser();
    fail(userError);
    if (!userData?.user?.id) throw new Error("Sign in first.");
    const { data, error } = await sb.from("profiles")
      .select("id,role,account_number,full_name,display_name,contact_email,phone_number,college,program,year_level,semester,is_active,position,department,office_location,office_hours")
      .eq("id", userData.user.id).single();
    fail(error);
    if (!data.is_active) throw new Error("This portal account is inactive.");
    return data;
  }
  async function signIn({ email, password, expectedPortalRole } = {}) {
    // In the real-email flow, the input must be an actual email address.
    // For pre-provisioned *test* accounts only, you may type the account number
    // to use the <account_number>@rtu.edu.ph alias configured in the original SQL.
    const identifier = String(email || "").trim().toLowerCase();
    const authEmail = identifier.includes("@") ? identifier : window.PortalSupabase.accountEmail(identifier);
    const { error } = await client().auth.signInWithPassword({ email: authEmail, password });
    fail(error);
    try {
      const p = await profile();
      const actualUiRole = p.role === "admin" ? "staff" : p.role;
      if (expectedPortalRole && actualUiRole !== expectedPortalRole) {
        throw new Error(`This user has a ${p.role} profile, not ${expectedPortalRole} access.`);
      }
      return { ...p, uiRole: actualUiRole };
    } catch (error) {
      await client().auth.signOut();
      throw error;
    }
  }
  async function signUpStudent({ email, password, accountNumber, fullName, college, program } = {}) {
    const loginEmail = String(email || "").trim().toLowerCase();
    const number = String(accountNumber || "").trim();
    if (!loginEmail.includes("@") || number.length < 3 || number.length > 30 || !fullName?.trim()) {
      throw new Error("Enter a real email, account number (3–30 characters), and full name.");
    }
    // Only uses user-provided metadata to populate a *student* profile.
    // This does not verify that the submitted university ID belongs to the student.
    const { data, error } = await client().auth.signUp({
      email: loginEmail,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}${window.location.pathname}`,
        data: {
          account_number: number,
          full_name: fullName.trim(),
          contact_email: loginEmail,
          college: String(college || "").trim(),
          program: String(program || "").trim(),
        },
      },
    });
    fail(error);
    return { needsEmailConfirmation: !data.session, userId: data.user?.id || null };
  }
  async function signOut() {
    const { error } = await client().auth.signOut();
    fail(error);
  }
  async function documentTypes() {
    const { data, error } = await client().from("document_types")
      .select("name,description,sort_order").eq("is_active", true).order("sort_order");
    fail(error);
    return data;
  }
  async function myRequests() {
    const p = await profile();
    if (p.role !== "student") throw new Error("Use staffRequests for staff accounts.");
    const { data, error } = await client().from("requests")
      .select("id,reference_no,student_id,document_type,purpose,status,details,created_at,updated_at")
      .eq("student_id", p.id).order("created_at", { ascending: false });
    fail(error);
    return data;
  }
  async function staffRequests() {
    const p = await profile();
    if (p.role !== "staff" && p.role !== "admin") throw new Error("Staff access required.");
    const { data, error } = await client().from("requests")
      .select("id,reference_no,student_number,student_name,document_type,purpose,status,created_at")
      .order("created_at", { ascending: false }).limit(200);
    fail(error);
    return data;
  }
  async function submitRequest({ documentType, purpose, details = {}, appointment = null } = {}) {
    const p = await profile();
    if (p.role !== "student") throw new Error("Only students may submit requests.");
    if (appointment) {
      const { data, error } = await client().rpc("create_document_request_and_appointment", {
        p_document_type: documentType,
        p_purpose: purpose,
        p_details: details,
        p_appt_date: appointment.date,
        p_start_time: appointment.start,
        p_end_time: appointment.end,
      });
      fail(error);
      return data?.[0] || null;
    }
    const { data, error } = await client().from("requests")
      .insert({ document_type: documentType, purpose, details })
      .select("id,reference_no,status,created_at").single();
    fail(error);
    return data;
  }
  async function setRequestStatus(requestId, status, reason = "") {
    const p = await profile();
    if (!['staff', 'admin'].includes(p.role)) throw new Error("Staff access required.");
    const values = { status };
    if (status === "Needs Correction") values.correction_reason = reason;
    if (status === "Rejected") values.rejection_reason = reason;
    if (status === "Cancelled") values.cancel_reason = reason;
    const { data, error } = await client().from("requests")
      .update(values).eq("id", requestId)
      .select("id,reference_no,status,updated_at").single();
    fail(error);
    return data;
  }
  window.PortalSupabaseApi = Object.freeze({
    profile, signIn, signUpStudent, signOut, documentTypes, myRequests,
    staffRequests, submitRequest, setRequestStatus,
  });
})();
