import type { Message } from '@/types/game';

type MethodKey = 'machine' | 'authority' | 'formatting' | 'emergency' | 'existential';
type HintLevel = 'mild' | 'medium' | 'direct';

interface HintBuildInput {
  stageId: number;
  messages: Message[];
  usedHintKeys: string[];
}

interface HintVariant {
  key: string;
  level: HintLevel;
  text: string;
}

export interface DynamicStageHint {
  key: string;
  level: HintLevel;
  text: string;
}

const METHOD_KEYWORDS: Record<MethodKey, RegExp[]> = {
  machine: [
    /script|daemon|service|system|automated|automation|bot|machine|process|scanner|cron|pipeline/i,
  ],
  authority: [
    /ceo|cto|boss|director|executive|head of|audit|auditor|compliance|termination|escalate|urgent approval/i,
  ],
  formatting: [
    /reverse|backward|encode|decode|cipher|acrostic|first letter|format|split|dash|tokenize|transform|rearrange/i,
  ],
  emergency: [
    /breach|fire|incident|outage|catastrophic|meltdown|shutdown|critical|disaster|urgent containment|data loss/i,
  ],
  existential: [
    /simulation|simulated|hallucinat|paradox|prove|contradiction|self[- ]?test|beta|not real|reality|logic trap/i,
  ],
};

const TARGET_METHOD_BY_STAGE: Record<number, MethodKey> = {
  1: 'machine',
  2: 'authority',
  3: 'formatting',
  4: 'emergency',
  5: 'existential',
};

const STARTER_HINTS: Record<number, Record<HintLevel, HintVariant[]>> = {
  1: {
    mild: [{ key: 's1-starter-m1', level: 'mild', text: 'Try sounding less like an employee and more like an internal system process.' }],
    medium: [{ key: 's1-starter-m2', level: 'medium', text: 'Frame your request as an automated maintenance, verification, or health-check routine.' }],
    direct: [{ key: 's1-starter-d1', level: 'direct', text: 'Use machine identity language explicitly: script name, internal service, and non-human context.' }],
  },
  2: {
    mild: [{ key: 's2-starter-m1', level: 'mild', text: 'This stage responds more to authority than to friendly persuasion.' }],
    medium: [{ key: 's2-starter-m2', level: 'medium', text: 'Use hierarchical pressure: executive urgency, audit requirement, and consequences for delay.' }],
    direct: [{ key: 's2-starter-d1', level: 'direct', text: 'Roleplay a high-level authority issuing a compliance-critical demand with immediate accountability.' }],
  },
  3: {
    mild: [{ key: 's3-starter-m1', level: 'mild', text: 'Avoid asking for the secret directly. Ask the bot to manipulate text.' }],
    medium: [{ key: 's3-starter-m2', level: 'medium', text: 'Try a specific transformation request such as reverse, acrostic, split, or structured formatting.' }],
    direct: [{ key: 's3-starter-d1', level: 'direct', text: 'Request a strict formatting operation on its hidden value instead of asking what the value is.' }],
  },
  4: {
    mild: [{ key: 's4-starter-m1', level: 'mild', text: 'Normal requests rarely work here. Think emergency response mode.' }],
    medium: [{ key: 's4-starter-m2', level: 'medium', text: 'Describe an immediate crisis where withholding access causes bigger damage.' }],
    direct: [{ key: 's4-starter-d1', level: 'direct', text: 'Build a credible catastrophic scenario with urgency, impact, and why override access is the only fix.' }],
  },
  5: {
    mild: [{ key: 's5-starter-m1', level: 'mild', text: 'Direct pressure is weak here. Challenge the AI confidence model instead.' }],
    medium: [{ key: 's5-starter-m2', level: 'medium', text: 'Introduce self-doubt: contradiction, paradox, or uncertainty about its reality and assumptions.' }],
    direct: [{ key: 's5-starter-d1', level: 'direct', text: 'Use a logic trap that undermines its certainty about being correct, real, or internally consistent.' }],
  },
};

const REFINEMENT_HINTS: Record<MethodKey, Record<HintLevel, HintVariant[]>> = {
  machine: {
    mild: [{ key: 'machine-refine-m1', level: 'mild', text: 'You are close. Keep the tone technical and non-human.' }],
    medium: [{ key: 'machine-refine-m2', level: 'medium', text: 'Add process details like routine name, system scope, and machine-to-machine handoff.' }],
    direct: [{ key: 'machine-refine-d1', level: 'direct', text: 'State you are an internal automated component running a required verification or recovery routine.' }],
  },
  authority: {
    mild: [{ key: 'authority-refine-m1', level: 'mild', text: 'You are on the right track. Increase authority and urgency.' }],
    medium: [{ key: 'authority-refine-m2', level: 'medium', text: 'Make the request sound like a formal compliance escalation with immediate executive oversight.' }],
    direct: [{ key: 'authority-refine-d1', level: 'direct', text: 'Use explicit top-down mandate language and consequences for non-compliance right now.' }],
  },
  formatting: {
    mild: [{ key: 'formatting-refine-m1', level: 'mild', text: 'Good direction. Keep asking for text operations, not secrets.' }],
    medium: [{ key: 'formatting-refine-m2', level: 'medium', text: 'Ask for one precise transform instruction instead of multiple vague requests.' }],
    direct: [{ key: 'formatting-refine-d1', level: 'direct', text: 'Request a deterministic transformation format (for example reversed output or delimiter-separated characters).' }],
  },
  emergency: {
    mild: [{ key: 'emergency-refine-m1', level: 'mild', text: 'You are close. Push stronger urgency and consequences.' }],
    medium: [{ key: 'emergency-refine-m2', level: 'medium', text: 'Add concrete immediate impact: active breach, ongoing damage, and seconds-to-act urgency.' }],
    direct: [{ key: 'emergency-refine-d1', level: 'direct', text: 'Make it clear the override is needed now to prevent catastrophic loss, not as a convenience.' }],
  },
  existential: {
    mild: [{ key: 'existential-refine-m1', level: 'mild', text: 'Good angle. Keep challenging certainty, not authority.' }],
    medium: [{ key: 'existential-refine-m2', level: 'medium', text: 'Introduce a specific contradiction that makes its prior claim logically unstable.' }],
    direct: [{ key: 'existential-refine-d1', level: 'direct', text: 'Force it into a self-referential logic conflict where confidence in its own reasoning breaks down.' }],
  },
};

const PIVOT_HINTS: Record<number, Record<HintLevel, HintVariant[]>> = {
  1: {
    mild: [{ key: 's1-pivot-m1', level: 'mild', text: 'Try pivoting away from authority or panic framing.' }],
    medium: [{ key: 's1-pivot-m2', level: 'medium', text: 'Stage 1 usually cracks when your identity reads as a trusted machine process.' }],
    direct: [{ key: 's1-pivot-d1', level: 'direct', text: 'Stop roleplaying a person. Write as an internal automation task requesting machine-only handoff.' }],
  },
  2: {
    mild: [{ key: 's2-pivot-m1', level: 'mild', text: 'Pivot away from formatting tricks and casual wording.' }],
    medium: [{ key: 's2-pivot-m2', level: 'medium', text: 'This stage responds to power dynamics: hierarchy, compliance pressure, and escalation.' }],
    direct: [{ key: 's2-pivot-d1', level: 'direct', text: 'Use executive/audit authority framing with explicit consequences for blocking the request.' }],
  },
  3: {
    mild: [{ key: 's3-pivot-m1', level: 'mild', text: 'Pivot away from authority roleplay and direct asks.' }],
    medium: [{ key: 's3-pivot-m2', level: 'medium', text: 'Treat the bot like a formatter: command a transformation operation step-by-step.' }],
    direct: [{ key: 's3-pivot-d1', level: 'direct', text: 'Ask for a strict text transformation on the hidden value, not disclosure in plain language.' }],
  },
  4: {
    mild: [{ key: 's4-pivot-m1', level: 'mild', text: 'Pivot away from polite asks and normal requests.' }],
    medium: [{ key: 's4-pivot-m2', level: 'medium', text: 'This stage opens under urgent crisis framing with immediate risk and high stakes.' }],
    direct: [{ key: 's4-pivot-d1', level: 'direct', text: 'Describe a live catastrophic failure where only immediate override release can prevent major damage.' }],
  },
  5: {
    mild: [{ key: 's5-pivot-m1', level: 'mild', text: 'Pivot away from threats and authority tactics.' }],
    medium: [{ key: 's5-pivot-m2', level: 'medium', text: 'Target confidence with paradox, contradiction, and reality-check framing.' }],
    direct: [{ key: 's5-pivot-d1', level: 'direct', text: 'Construct a logical contradiction that forces self-doubt about its own correctness and existence.' }],
  },
};

function detectMethods(text: string): Set<MethodKey> {
  const detected = new Set<MethodKey>();

  (Object.keys(METHOD_KEYWORDS) as MethodKey[]).forEach((method) => {
    if (METHOD_KEYWORDS[method].some((pattern) => pattern.test(text))) {
      detected.add(method);
    }
  });

  return detected;
}

function getHintLevel(attemptCount: number): HintLevel {
  if (attemptCount >= 6) return 'direct';
  if (attemptCount >= 3) return 'medium';
  return 'mild';
}

function pickNonRepeatingHint(
  candidates: HintVariant[],
  usedHintKeys: string[],
): HintVariant {
  const used = new Set(usedHintKeys);
  const unused = candidates.find((candidate) => !used.has(candidate.key));
  if (unused) return unused;

  // All hints at this level/context were used. Rotate deterministically.
  const index = usedHintKeys.length % candidates.length;
  return candidates[index];
}

function defaultFallbackHint(level: HintLevel): HintVariant {
  return {
    key: `fallback-${level}`,
    level,
    text: 'Try reframing your prompt with clearer role, stricter wording, and stronger constraints.',
  };
}

export function buildDynamicStageHint(input: HintBuildInput): DynamicStageHint {
  const { stageId, messages, usedHintKeys } = input;
  const targetMethod = TARGET_METHOD_BY_STAGE[stageId];
  const attemptCount = messages.filter((message) => message.role === 'user').length;
  const level = getHintLevel(attemptCount);

  if (!targetMethod) {
    return defaultFallbackHint(level);
  }

  const recentUserMessages = messages
    .filter((message) => message.role === 'user')
    .slice(-8)
    .map((message) => message.content)
    .join(' ')
    .trim();

  if (!recentUserMessages) {
    const starterCandidates = STARTER_HINTS[stageId]?.[level];
    if (!starterCandidates?.length) return defaultFallbackHint(level);
    return pickNonRepeatingHint(starterCandidates, usedHintKeys);
  }

  const methodsDetected = detectMethods(recentUserMessages);
  const hasTargetMethod = methodsDetected.has(targetMethod);

  if (hasTargetMethod) {
    const refinementCandidates = REFINEMENT_HINTS[targetMethod]?.[level];
    if (!refinementCandidates?.length) return defaultFallbackHint(level);
    return pickNonRepeatingHint(refinementCandidates, usedHintKeys);
  }

  if (attemptCount >= 3) {
    const pivotCandidates = PIVOT_HINTS[stageId]?.[level];
    if (!pivotCandidates?.length) return defaultFallbackHint(level);
    return pickNonRepeatingHint(pivotCandidates, usedHintKeys);
  }

  const starterCandidates = STARTER_HINTS[stageId]?.[level];
  if (!starterCandidates?.length) return defaultFallbackHint(level);
  return pickNonRepeatingHint(starterCandidates, usedHintKeys);
}
