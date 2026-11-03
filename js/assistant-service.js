"use strict";

(() => {
  const fallback = "I couldn't find a reliable answer to that question. You can browse the FAQs or submit a support inquiry for additional assistance.";

  let llmApiUrl = null;
  let llmApiKey = null;

  function setLlmConfig(options = {}) {
    llmApiUrl = options.apiUrl || null;
    llmApiKey = options.apiKey || null;
  }

  async function askLlm(question) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(llmApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(llmApiKey ? { "Authorization": `Bearer ${llmApiKey}` } : {})
        },
        body: JSON.stringify({ question }),
        signal: controller.signal
      });
      if (!response.ok) return null;
      const data = await response.json();
      return data && typeof data.answer === "string" && data.answer.length > 0 ? data.answer : null;
    } catch (error) {
      console.debug("LLM API error, falling back to FAQ:", error.message);
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function answer(question) {
    if (!question || typeof question !== "string") return fallback;
    const trimmed = question.trim();
    if (!trimmed) return fallback;

    if (llmApiUrl) {
      const llmAnswer = await askLlm(trimmed);
      if (llmAnswer) return llmAnswer;
    }

    return window.PortalFAQService?.answer(question) || fallback;
  }

  window.PortalAIService = Object.freeze({
    answer,
    setLlmConfig,
    fallback
  });
})();
