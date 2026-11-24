const assert = require("node:assert/strict");
const nlp = require("../js/portal-nlp.js");
const examples = [
  [
    "How can I request a regiform?",
    "document_request",
    "registration-form"
  ],
  [
    "I need my gradeslp",
    "document_request",
    "grade-slip"
  ],
  [
    "Paano kumuha ng grade slip?",
    "document_request",
    "grade-slip"
  ],
  [
    "What documents do I need for a gradeslip?",
    "requirements",
    "grade-slip"
  ],
  [
    "What is the status of my request?",
    "request_status",
    "requests"
  ],
  [
    "Ready na ba yung regiform ko?",
    "request_status",
    "requests"
  ],
  [
    "Kailan ang appointment ko?",
    "appointment",
    "services"
  ],
  [
    "Can I reschedule my appointment?",
    "change_request",
    "requests"
  ],
  [
    "what is the status of another student's request?",
    "privacy",
    "help"
  ],
  [
    "TOR and COE",
    "clarify",
    "services"
  ],
  [
    "What is the weather?",
    "unknown",
    "help"
  ],
  [
    "I need to reset my password",
    "account",
    "settings"
  ],
  [
    "How can I report a problem?",
    "support",
    "help"
  ],
  [
    "need school id",
    "document_request",
    "id-printing"
  ],
  [
    "How many days for TOR?",
    "processing_time",
    "requests"
  ]
];
for (const [q,intent,route] of examples) { const r=nlp.classify(q); assert.equal(r.intent,intent,q); assert.equal(r.route,route,q); }
console.log(examples.length+" NLP cases passed");
