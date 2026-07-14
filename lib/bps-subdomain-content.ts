/**
 * Per-subdomain patient-facing content (COS-446, SCRUM-582).
 *
 * Powers the WellbeingSubdomainSheet drilldown — when a user taps a
 * subdomain chip or Venn dot on the wellbeing map, this content
 * populates the "What this means / Why it matters / Example goals"
 * section of the bottom sheet.
 *
 * Kept separate from lib/bps-subdomains.ts (which is the taxonomy /
 * type definitions single source of truth) so future taxonomy edits
 * don't have to touch prose and vice versa. Content is patient-facing
 * (warm, plain-English, no clinical jargon, no "biopsychosocial") and
 * targets an older-adult reading level.
 *
 * Backward-compat: getSubdomainContent returns a benign default for
 * unknown keys so the sheet always renders something meaningful even
 * if a taxonomy key is added before its content is written.
 */

export interface SubdomainContent {
  /** 1-sentence patient-friendly definition (12-20 words). */
  description: string
  /** 1-2 sentence explanation of why this area affects wellbeing (25-40 words). */
  whyItMatters: string
  /** 3 short concrete goal examples a patient might set (5-10 words each). */
  exampleGoals: string[]
}

const CONTENT: Record<string, SubdomainContent> = {
  // ── Biological ────────────────────────────────────────────────────
  genes: {
    description: 'The traits and health tendencies you inherit from your parents and grandparents that shape your body and mind.',
    whyItMatters: 'Your family history can raise or lower your risk for certain conditions, and it often shapes how your body responds to stress, sleep, and treatment. Knowing your genetic background helps your care team personalize your plan.',
    exampleGoals: [
      'Write down my known family health history',
      'Share family history with my care team',
      'Ask my doctor about recommended screenings',
    ],
  },
  neurobiology: {
    description: 'How your brain and nervous system work, including the chemistry that shapes mood, focus, and how you handle stress.',
    whyItMatters: 'Brain chemistry influences how you think, feel, and react each day, and it works closely with sleep, stress, and emotions. Supporting your brain helps every other part of your health work better.',
    exampleGoals: [
      'Practice 10 minutes of calm breathing daily',
      'Take medications exactly as prescribed',
      'Do one brain-friendly activity each day',
    ],
  },
  sleep: {
    description: 'How well and how long you rest at night, and how refreshed you feel when you wake up.',
    whyItMatters: 'Good sleep helps your body heal, your mind stay clear, and your mood stay steady, while poor sleep can worsen pain, stress, and chronic conditions. It is one of the strongest foundations of overall health.',
    exampleGoals: [
      'Go to bed at the same time nightly',
      'Keep screens out of the bedroom',
      'Aim for 7 to 8 hours nightly',
    ],
  },
  physical_health: {
    description: 'The overall condition of your body, including any ongoing health issues and how active you feel day to day.',
    whyItMatters: 'Your physical health affects your energy, independence, and mood, and it interacts with sleep, stress, and emotional wellbeing. Small daily habits often bring the biggest long-term gains.',
    exampleGoals: [
      'Walk 20 minutes most days of the week',
      'Attend all scheduled medical appointments',
      'Track one health number each week',
    ],
  },
  metabolic_disorders: {
    description: 'Conditions that affect how your body uses food and energy, such as diabetes, thyroid issues, or high cholesterol.',
    whyItMatters: 'When your body has trouble managing sugar, fats, or hormones, it can affect your energy, weight, mood, and heart health. Careful management protects nearly every other body system.',
    exampleGoals: [
      'Check blood sugar as recommended',
      'Take metabolic medications on schedule',
      'Reduce sugary drinks to once a week',
    ],
  },
  immune_stress_response: {
    description: 'How your body defends itself from illness and how it reacts when you feel stressed or overwhelmed.',
    whyItMatters: 'Long-term stress can weaken your immune system and make you more prone to illness, pain, and slow healing. Calming your stress response supports both your body and your mind.',
    exampleGoals: [
      'Practice one relaxation technique daily',
      'Get recommended vaccines and boosters',
      'Spend 15 minutes outdoors each day',
    ],
  },

  // ── Biological ∩ Psychological overlap ────────────────────────────
  emotions: {
    description: 'The everyday feelings you notice, and how your body reacts to them — this touches both mind and body.',
    whyItMatters: 'Emotions shape your body\'s stress response, sleep, and even pain levels, while your physical state also shapes how you feel. Learning to notice and name feelings helps both mind and body settle.',
    exampleGoals: [
      'Name one feeling I have each day',
      'Journal for 5 minutes before bed',
      'Talk about feelings with someone I trust',
    ],
  },
  response_to_reward: {
    description: 'How your brain and behavior respond to pleasure, motivation, and things that feel good — a mind and body connection.',
    whyItMatters: 'Your reward system drives motivation, habits, and cravings, and it links brain chemistry with daily choices. Understanding it can help you build habits that support long-term wellbeing.',
    exampleGoals: [
      'Replace one unhealthy reward with a walk',
      'Celebrate one small win each day',
      'Notice cravings before acting on them',
    ],
  },

  // ── Psychological ─────────────────────────────────────────────────
  attitudes_beliefs: {
    description: 'The ideas and views you hold about yourself, your health, and the world around you.',
    whyItMatters: 'Your beliefs shape the choices you make, how you handle setbacks, and whether you follow through on care. Shifting unhelpful beliefs can open the door to better health and more hope.',
    exampleGoals: [
      'Notice one negative thought each day',
      'Replace one unhelpful belief with a kinder one',
      'Write down three things I value',
    ],
  },
  perceptions: {
    description: 'The way you see and understand situations, including how you interpret what happens to you.',
    whyItMatters: 'How you view a situation often affects your stress level, mood, and reactions more than the situation itself. Practicing balanced thinking can ease worry and improve daily life.',
    exampleGoals: [
      'Pause and consider another point of view',
      'Ask a trusted person for their view',
      'Practice one mindful moment daily',
    ],
  },
  coping_skills: {
    description: 'The healthy ways you handle stress, hard days, and unexpected challenges.',
    whyItMatters: 'Strong coping skills protect your mood, sleep, and physical health when life gets difficult, and they lower the chance of turning to unhealthy habits. Building a small toolbox pays off for years.',
    exampleGoals: [
      'Practice deep breathing when stressed',
      'List three healthy ways I cope',
      'Try one new coping tool this month',
    ],
  },
  self_esteem: {
    description: 'How you feel about yourself and the sense of worth and confidence you carry each day.',
    whyItMatters: 'Healthy self-esteem supports better relationships, motivation, and mental health, while low self-esteem can lead to isolation and low mood. Small daily kindnesses to yourself add up.',
    exampleGoals: [
      'Write one thing I did well daily',
      'Speak to myself as I would a friend',
      'Do one activity that makes me proud',
    ],
  },
  temperament: {
    description: 'Your natural personality style — how you tend to react, feel, and interact with the world.',
    whyItMatters: 'Understanding your natural style helps you set realistic goals, manage stress, and choose environments that fit you best. Working with your temperament is easier than working against it.',
    exampleGoals: [
      'Notice what situations energize or drain me',
      'Plan quiet time after busy events',
      'Pick activities that match my nature',
    ],
  },

  // ── Biological ∩ Social overlap ───────────────────────────────────
  diet_lifestyle: {
    description: 'What you eat, drink, and do each day — habits that connect your body with your environment.',
    whyItMatters: 'Food and daily habits fuel your body, shape your energy, and influence conditions like diabetes and heart disease. Small consistent changes can improve both physical and emotional health.',
    exampleGoals: [
      'Add one serving of vegetables daily',
      'Drink 6 to 8 glasses of water daily',
      'Cook one healthy meal at home weekly',
    ],
  },
  substance_use: {
    description: 'Your use of alcohol, tobacco, or other substances — a habit that affects both your body and social life.',
    whyItMatters: 'Substance use can affect sleep, memory, medications, and relationships, and it often links physical health with social settings. Honest tracking is the first step toward healthy change.',
    exampleGoals: [
      'Track daily alcohol or tobacco use',
      'Cut back one drink or cigarette weekly',
      'Talk to my doctor about safer limits',
    ],
  },

  // ── Psychological ∩ Social overlap ────────────────────────────────
  interpersonal_relationships: {
    description: 'The close connections in your life — a bridge between your inner world and your social world.',
    whyItMatters: 'Healthy relationships support mood, reduce stress, and even improve physical health, while strained ones can weigh on mind and body. Investing in connection is investing in wellbeing.',
    exampleGoals: [
      'Reach out to one loved one weekly',
      'Practice active listening in conversations',
      'Address one small conflict kindly',
    ],
  },
  trauma: {
    description: 'Painful past experiences that still affect how you feel, think, or relate to others today.',
    whyItMatters: 'Unhealed trauma can shape your stress response, relationships, and physical health long after the event. Gentle support and safe conversations can help the mind and body heal over time.',
    exampleGoals: [
      'Practice grounding when memories arise',
      'Talk with a counselor about my experience',
      'Identify one safe person to lean on',
    ],
  },
  grief: {
    description: 'The natural feelings that come after losing someone or something meaningful — touching both your heart and your community.',
    whyItMatters: 'Grief affects your emotions, sleep, appetite, and social life, and it often changes how you connect with others. Giving yourself time and support helps healing unfold naturally.',
    exampleGoals: [
      'Allow myself to feel without judgment',
      'Share memories with a loved one',
      'Attend a grief group or counseling session',
    ],
  },

  // ── Social & Spiritual ────────────────────────────────────────────
  social_support: {
    description: 'How connected you feel to family, friends, and community — the people you can rely on.',
    whyItMatters: 'Strong social support lowers stress, protects mental health, and is linked to living longer and healthier. Even one reliable person can make a real difference.',
    exampleGoals: [
      'Call one friend or family member weekly',
      'Join a local walking or hobby group',
      'Attend one social event each month',
    ],
  },
  family_circumstances: {
    description: 'What is happening within your family — roles, responsibilities, and how everyone is getting along.',
    whyItMatters: 'Family life can be a source of comfort or stress, and it often shapes daily routines, finances, and emotional health. Understanding your family situation helps your care team support you better.',
    exampleGoals: [
      'Share one concern with a family member',
      'Set aside weekly family time',
      'Ask for help with one caregiving task',
    ],
  },
  peer_group: {
    description: 'The friends and people you spend time with regularly, and the habits you share together.',
    whyItMatters: 'The people around you influence your habits, mood, and choices, sometimes without you realizing it. Choosing supportive company helps healthy habits stick.',
    exampleGoals: [
      'Spend time with one supportive friend weekly',
      'Limit time with people who bring me down',
      'Try one new activity with a friend',
    ],
  },
  work_school: {
    description: 'Your job, studies, or daily role — the place where you spend much of your time and energy.',
    whyItMatters: 'Work or school can bring purpose and structure, but it can also cause stress that affects sleep, mood, and health. Balancing effort and rest protects your long-term wellbeing.',
    exampleGoals: [
      'Take short breaks throughout the day',
      'Set one clear boundary with work hours',
      'Talk to a supervisor about a concern',
    ],
  },
  culture: {
    description: 'The traditions, values, and community customs that shape who you are and how you live.',
    whyItMatters: 'Your culture influences how you view health, food, family, and healing, and honoring it makes care feel more personal and effective. It is a source of strength worth sharing with your care team.',
    exampleGoals: [
      'Share cultural preferences with my care team',
      'Practice one meaningful tradition weekly',
      'Connect with my cultural community',
    ],
  },
  socioeconomic_status: {
    description: 'Your income, education, housing, and access to resources that support daily life.',
    whyItMatters: 'Access to safe housing, healthy food, transportation, and care strongly affects your health outcomes. Talking openly about these needs helps your care team connect you with support.',
    exampleGoals: [
      'Ask about financial help for medications',
      'Explore community resources near me',
      'Talk to my team about transportation needs',
    ],
  },
  life_events: {
    description: 'Big changes or milestones — like a move, retirement, illness, or new caregiving role.',
    whyItMatters: 'Major life events can affect your stress level, mood, sleep, and physical health all at once. Naming these changes helps you and your care team plan support during the transition.',
    exampleGoals: [
      'Share a recent life change with my team',
      'Create a simple plan for the transition',
      'Ask for extra support during this season',
    ],
  },
  faith_spiritual: {
    description: 'Your sense of meaning, purpose, or connection to something greater than yourself.',
    whyItMatters: 'Faith and spiritual practices can offer comfort, hope, and resilience, especially during illness or loss. Whether through prayer, nature, or reflection, this part of you supports whole-person healing.',
    exampleGoals: [
      'Spend 10 minutes in prayer or reflection daily',
      'Connect with my faith or spiritual community',
      'Practice gratitude before bed each night',
    ],
  },
}

/**
 * Look up patient-facing content for a subdomain key. Returns a benign
 * placeholder if the key is unknown or content hasn't been written yet
 * so the sheet always renders something meaningful.
 */
export function getSubdomainContent(key: string, label: string): SubdomainContent {
  const explicit = CONTENT[key]
  if (explicit) return explicit
  return {
    description: `${label} is one of the areas your wellbeing plan can address.`,
    whyItMatters: `Attention to ${label.toLowerCase()} helps balance your overall wellbeing across body, mind, and social areas.`,
    exampleGoals: [
      `Set a small weekly goal for ${label.toLowerCase()}`,
      `Track how ${label.toLowerCase()} is going`,
      `Ask your care team about ${label.toLowerCase()}`,
    ],
  }
}

/** Full content map (for tests / dev tooling). */
export const ALL_SUBDOMAIN_CONTENT = CONTENT
