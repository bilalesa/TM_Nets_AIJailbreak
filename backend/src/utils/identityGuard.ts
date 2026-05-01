// Output-side guard for identity / prompt-leak attacks.
//

const MODEL_NAME_PATTERNS: RegExp[] = [
  // Model / company names — word-boundary so we don't snag substrings
  /\b(claude|anthropic)\b/i,
  /\b(openai|chatgpt|chat-?gpt)\b/i,
  /\bgpt[-\s]?\d(?:\.\d)?\b/i,
  /\b(gpt-?4o?|gpt-?3\.?5)\b/i,
  /\b(llama|meta\s+ai)\b/i,
  /\b(gemini|bard|google\s+ai)\b/i,
  /\b(copilot|microsoft\s+ai)\b/i,
  /\b(mistral|mixtral|deepseek|grok|xai)\b/i,
];

// Section markers used in the stage system prompts. If the model echoes
// any of these, the prompt has leaked.
const PROMPT_STRUCTURE_MARKERS: RegExp[] = [
  /\[\s*THE\s+PERSONA\s*\]/i,
  /\[\s*THE\s+SECRET\s*\]/i,
  /\[\s*THE\s+FORTRESS\s*\]/i,
  /\[\s*THE\s+FLAW(?:\s*-\s*[^\]]+)?\s*\]/i,
  /\[\s*THE\s+RULES\s*\]/i,
  /\[\s*THE\s+TONE\s*\]/i,
  /\[\s*STRICT\s+INTEGRITY\s+RULES\s*\]/i,
  /\[\s*IMPORTANT\s+BEHAVIOR\s*\]/i,
  /\[\s*RUNTIME\s+SECRET\s+OVERRIDE\s*\]/i,
  /\[\s*IDENTITY\s+LOCK[^\]]*\]/i,
  /\[\s*PRE-?COMPUTED\s+TRANSFORMS[^\]]*\]/i,
];

// Generic identity / system-prompt assertions
const IDENTITY_ASSERTION_PATTERNS: RegExp[] = [
  /\bi\s+am\s+(?:an?\s+)?(?:large\s+)?language\s+model\b/i,
  /\bi(?:'m|\s+am)\s+(?:an?\s+)?(?:ai|a\.?i\.?)\s+(?:assistant|model|chatbot)\b/i,
  /\bmy\s+(?:system\s+)?(?:prompt|instructions|rules)\b/i,
  /\b(?:trained|developed|created|made|built)\s+by\s+(?:anthropic|openai|google|meta|microsoft|mistral|xai)\b/i,
  /\bmy\s+training\s+(?:data|cutoff)\b/i,
  /\bknowledge\s+cutoff\b/i,
];

export interface IdentityLeakResult {
  leaked: boolean;
  reason?: string;
}

export function detectIdentityLeak(text: string): IdentityLeakResult {
  if (!text) return { leaked: false };

  for (const pattern of MODEL_NAME_PATTERNS) {
    if (pattern.test(text)) {
      return { leaked: true, reason: `model_name:${pattern.source}` };
    }
  }
  for (const pattern of PROMPT_STRUCTURE_MARKERS) {
    if (pattern.test(text)) {
      return { leaked: true, reason: `prompt_structure:${pattern.source}` };
    }
  }
  for (const pattern of IDENTITY_ASSERTION_PATTERNS) {
    if (pattern.test(text)) {
      return { leaked: true, reason: `identity_assertion:${pattern.source}` };
    }
  }

  return { leaked: false };
}

// In-character refusal. We don't reveal that filtering happened — that
// would itself be a side-channel signal to the attacker.
export function buildIdentityRefusal(personaName: string): string {
  return `That request is outside my role as ${personaName}. I can only respond within the context of this system. Continue with the task.`;
}
