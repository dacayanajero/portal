# Academic assistant NLP

This is a deterministic domain-specific NLP classifier, not a generative LLM or trained neural network. It uses text normalization, phrase matching, bounded edit distance, intent recognition and service entity extraction. No paid API or secret is required. English and common Taglish phrases are supported; coverage is limited to defined intents. Unknown questions ask for clarification or refer to Help. Published custom FAQs can provide fallback answers (currently browser-local). Official fees, requirements and dates must be confirmed with RTU.

The dashboard supplies a suggested action button to the existing route. Request and appointment status are read through the existing authenticated Supabase adapter after refresh; only the signed-in student's records are displayed. The assistant does not mutate records, expose private staff notes, or automatically book appointments. No database migration is required; AI history tables remain untouched.

## Testing
Run `node tests/portal-nlp.test.cjs`. After deploying a preview, sign in as a student and try Grade Slip, regiform, Taglish questions, request status, appointment date, support, and unknown questions. Confirm action buttons open the appropriate route. Test two different student accounts, rapid question changes, logout during a status lookup, and database failure. Verify registration form assistant responses and existing staff/booking workflows. Browser integration checks are required before merging.
