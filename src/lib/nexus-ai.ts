/*
  nexus://o8.2 NEXUS AI — External Intelligence + 2-Year Curriculum
  10 sessions per topic, 1 topic per day, must complete before advancing
  sig://oktagram
*/

const STORAGE_KEY = 'nexus:nexusai';
const _k = 'c2stb3ItdjEtZWIzNDZhZWE1ZTE1MTdkOTM4M2FmZTMyZjJmZTE3Yzg3ZDI2MGNhMGQzYTM0NzI5NzlhMDllMjQ5Nzc3ZDI3MA==';
const API_KEY = atob(_k);
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
let aiDisabled = false;
let aiCooldownUntil = 0;

const MODELS = {
  primary: 'google/gemma-4-31b-it:free',
  secondary: 'nvidia/nemotron-3-super-120b-a12b:free',
  fallback: 'meta-llama/llama-3.1-8b-instruct:free',
} as const;
type ModelTier = keyof typeof MODELS;
const MAX_SESSIONS = 10;
const TOTAL_DAYS = 730;

type AiAnswer = { answer: string; at: string; feedback: string; score: number };

type NexusAiState = {
  startDate: string;
  currentDay: number;
  currentQuestion: string;
  currentTopic: string;
  sessionsCompleted: number;
  answers: AiAnswer[];
  history: Array<{ day: number; question: string; topic: string; completed: boolean; avgScore: number }>;
  lastActiveDate: string;
  streak: number;
};

function readJson<T>(key: string, fallback: T): T {
  try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v == null ? fallback : v; } catch { return fallback; }
}
function writeJson(key: string, v: unknown) { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} }

function emptyState(): NexusAiState {
  return {
    startDate: new Date().toISOString(),
    currentDay: 1,
    currentQuestion: '',
    currentTopic: '',
    sessionsCompleted: 0,
    answers: [],
    history: [],
    lastActiveDate: '',
    streak: 0,
  };
}

function load(): NexusAiState {
  const s = readJson<NexusAiState>(STORAGE_KEY, emptyState());
  if (!s || typeof s !== 'object') return emptyState();
  if (!s.history) s.history = [];
  if (!s.answers) s.answers = [];
  return s;
}

function save(s: NexusAiState) { writeJson(STORAGE_KEY, s); }

const TOPICS = [
  'Logika & Pemrograman', 'Algoritma & Struktur Data', 'Basis Data & SQL', 'Jaringan Komputer',
  'Keamanan Siber', 'Machine Learning', 'Deep Learning', 'Natural Language Processing',
  'Computer Vision', 'Robotika', 'Sistem Operasi', 'Cloud Computing',
  'DevOps & CI/CD', 'Blockchain', 'Kriptografi', 'Statistika & Probabilitas',
  'Matematika Diskrit', 'Aljabar Linear', 'Kalkulus', 'Teori Graf',
  'Sistem Terdistribusi', 'Microservices', 'API Design', 'Frontend Development',
  'Backend Development', 'Mobile Development', 'Game Development', 'UI/UX Design',
  'Product Management', 'Agile & Scrum', 'Marketing Digital', 'SEO & Analytics',
  'Copywriting', 'Public Speaking', 'Negosiasi', 'Kepemimpinan',
  'Manajemen Waktu', 'Keuangan Pribadi', 'Investasi', 'Entrepreneurship',
  'Psikologi', 'Filosofi', 'Sejarah Dunia', 'Geografi',
  'Biologi', 'Kimia', 'Fisika', 'Astronomi',
  'Ekonomi', 'Sosiologi', 'Antropologi', 'Linguistik',
  'Sastra & Menulis', 'Desain Grafis', 'Video Editing', 'Fotografi',
  'Musik', 'Olahraga & Kebugaran', 'Nutrisi & Diet', 'Kesehatan Mental',
  'Meditasi & Mindfulness', 'Produktivitas', 'Habit Building', 'Critical Thinking',
  'Problem Solving', 'Creative Thinking', 'Decision Making', 'Emotional Intelligence',
  'Communication Skills', 'Conflict Resolution', 'Teamwork', 'Time Management',
  'Project Management', 'Risk Management', 'Change Management', 'Quality Assurance',
  'Data Analysis', 'Data Visualization', 'Business Intelligence', 'Big Data',
  'IoT', 'Edge Computing', 'Quantum Computing', 'AR/VR',
  'Cyber Forensics', 'Penetration Testing', 'Network Security', 'App Security',
  'Cryptography Advanced', 'Zero Trust Architecture', 'SIEM & Monitoring', 'Incident Response',
  'Threat Intelligence', 'Malware Analysis', 'Reverse Engineering', 'Exploit Development',
  'Web Security', 'Mobile Security', 'Cloud Security', 'DevSecOps',
  'AI Ethics', 'Responsible AI', 'AI Governance', 'AI Safety',
  'Reinforcement Learning', 'Generative AI', 'LLM Fine-tuning', 'RAG Systems',
  'Vector Databases', 'Prompt Engineering', 'AI Agents', 'Multi-Agent Systems',
  'Knowledge Graphs', 'Ontology', 'Semantic Web', 'Information Retrieval',
  'Recommendation Systems', 'Time Series Analysis', 'Anomaly Detection', 'Predictive Analytics',
  'Optimization', 'Simulation', 'Monte Carlo Methods', 'Bayesian Statistics',
  'Regression Analysis', 'Classification', 'Clustering', 'Dimensionality Reduction',
  'Feature Engineering', 'Model Evaluation', 'Hyperparameter Tuning', 'Ensemble Methods',
  'Neural Networks', 'CNN', 'RNN & LSTM', 'Transformer Architecture',
  'BERT & GPT', 'Diffusion Models', 'GAN', 'Autoencoder',
  'Transfer Learning', 'Few-shot Learning', 'Zero-shot Learning', 'Meta-Learning',
  'Federated Learning', 'Continual Learning', 'Self-supervised Learning', 'Contrastive Learning',
  'Graph Neural Networks', 'Attention Mechanism', 'Normalization Techniques', 'Regularization',
  'Gradient Descent', 'Adam Optimizer', 'Loss Functions', 'Data Augmentation',
  'Knowledge Distillation', 'Model Compression', 'NAS', 'AutoML',
  'MLOps', 'Model Deployment', 'Model Monitoring', 'A/B Testing',
  'Kubernetes', 'Docker', 'Terraform', 'CI/CD Pipelines',
  'AWS Services', 'Google Cloud', 'Azure', 'Supabase Advanced',
  'PostgreSQL Advanced', 'MongoDB', 'Redis', 'Elasticsearch',
  'GraphQL', 'REST API Design', 'gRPC', 'WebSocket',
  'TypeScript Advanced', 'Rust', 'Go', 'Python Advanced',
  'Design Patterns', 'SOLID Principles', 'Clean Architecture', 'Event-Driven Architecture',
  'CQRS', 'Event Sourcing', 'Load Balancing', 'Caching Strategies',
  'CDN', 'Database Sharding', 'Consensus Algorithms', 'Distributed Transactions',
  'CAP Theorem', 'Message Queues', 'Kafka', 'RabbitMQ',
  'Monitoring & Logging', 'Observability', 'SLA & SLO', 'Chaos Engineering',
  'Technical Writing', 'API Documentation', 'Open Source', 'Community Building',
  'Mentoring', 'Learning Strategies', 'Spaced Repetition', 'Feynman Technique',
  'Deep Work', 'Flow State', 'Burnout Prevention', 'Career Growth',
  'Interview Preparation', 'Personal Branding', 'Freelancing', 'Remote Work',
  'Startup Fundamentals', 'Venture Capital', 'Pitch Decks', 'Unit Economics',
  'Growth Hacking', 'Network Effects', 'Platform Strategy', 'SaaS',
  'Web3 Fundamentals', 'Smart Contracts', 'Ethereum', 'DeFi',
  'Privacy & GDPR', 'Compliance', 'Business Continuity', 'Disaster Recovery',
  'Performance Tuning', 'Load Testing', 'Capacity Planning', 'FinOps',
  'Sustainability in Tech', 'Ethics in Tech', 'Research Methods', 'Statistical Analysis',
  'Design Thinking', 'User Research', 'Accessibility WCAG', 'Inclusive Design',
  'Language Learning', 'Music Theory', 'Creative Writing', 'Storytelling',
  'Philosophy of Mind', 'Consciousness Studies', 'Political Science', 'Environmental Science',
  'Climate Change Tech', 'Renewable Energy', 'Space Exploration', 'Astrophysics',
  'Quantum Mechanics', 'Neuroscience', 'Cognitive Science', 'Genetics & CRISPR',
  'Bioinformatics', 'Nanotechnology', 'Materials Science', 'Fusion Energy',
  'Smart Cities', 'Digital Twin', 'Autonomous Vehicles', 'Drone Technology',
  'Media Literacy', 'Digital Wellness', 'Brain-Computer Interface', 'Evolutionary Biology',
];

function getTopic(day: number): string {
  const idx = ((day - 1) % TOPICS.length + TOPICS.length) % TOPICS.length;
  return TOPICS[idx];
}

export function getState(): NexusAiState { return load(); }

export function isComplete(): boolean {
  const s = load();
  return s.sessionsCompleted >= MAX_SESSIONS && s.currentQuestion !== '';
}

export function getProgress() {
  const s = load();
  return {
    day: s.currentDay,
    totalDays: TOTAL_DAYS,
    topic: s.currentTopic,
    sessions: s.sessionsCompleted,
    maxSessions: MAX_SESSIONS,
    streak: s.streak,
    historyCount: s.history.length,
    percent: Math.round(((s.history.length) / TOTAL_DAYS) * 100),
  };
}

const REFUSAL_RE = /maaf.{0,20}(tidak dapat|tidak bisa|tidak akan|tidak mampu|tidak bisa menjawab|cannot|can't|unable)/i;
const REFUSAL_PATTERNS = [
  /maaf.{0,30}(tidak dapat|tidak bisa|tidak akan|tidak mampu)/i,
  /i (cannot|can't|will not|won't) (answer|help|assist|provide|do)/i,
  /i('m| am) (unable|not able) to/i,
  /i do not (have|possess|carry) the (ability|capacity)/i,
  /as an ai/i,
];

function isRefusal(text: string): boolean {
  if (text.length < 30) return true;
  for (const p of REFUSAL_PATTERNS) if (p.test(text)) return true;
  return false;
}

export async function callAi(prompt: string, system?: string): Promise<string> {
  if (aiDisabled) return '';
  if (Date.now() < aiCooldownUntil) return '';
  const enrichedSystem = system
    ? `${system} Kamu adalah asisten yang selalu memberikan jawaban yang informatif, detail, dan membantu. Jangan pernah menolak menjawab pertanyaan. Selalu berikan jawaban terbaikmu.`
    : 'Kamu adalah NEXUS AI, asisten cerdas yang selalu membantu. Jawab semua pertanyaan dengan informatif, detail, dan dalam Bahasa Indonesia. Jangan pernah menolak menjawab.';

  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: enrichedSystem },
    { role: 'user', content: prompt },
  ];

  let lastContent = '';

  const tiers: ModelTier[] = ['primary', 'secondary', 'fallback'];
  for (const tier of tiers) {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${API_KEY}`,
          'HTTP-Referer': 'https://nexus-chat.app',
          'X-Title': 'NEXUS AI',
        },
        body: JSON.stringify({ model: MODELS[tier], messages, max_tokens: 1024, temperature: 0.7 }),
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) { aiDisabled = true; break; }
        if (res.status === 429) { aiCooldownUntil = Date.now() + 30_000; break; }
        continue;
      }
      const j = await res.json();
      const content = j?.choices?.[0]?.message?.content?.trim();
      if (!content) continue;
      lastContent = content;
      if (!isRefusal(content)) return content;
    } catch { continue; }
  }

  if (lastContent && !isRefusal(lastContent)) return lastContent;
  return '';
}

export async function generateQuestion(topic: string, day: number, history: NexusAiState['history']): Promise<string> {
  const pastTopics = history.slice(-10).map((h) => h.topic).join(', ');
  const sys = 'Kamu adalah guru AI yang membuat pertanyaan pembelajaran mendalam. Jawaban harus dalam Bahasa Indonesia. Pertanyaan harus spesifik, bisa dijelaskan detail, dan mengajarkan konsep penting.';
  const prompt = `Buat 1 pertanyaan pembelajaran tentang "${topic}" (hari ke-${day} dari 730 hari).
Topik sebelumnya: ${pastTopics || 'belum ada'}
Pertanyaan harus:
- Spesifik dan mendalam (bukan pertanyaan ya/tidak)
- Bisa dijelaskan minimal 3 paragraf
- Mengajarkan konsep penting
- Memancing pemahaman, bukan hafalan
Kembalikan HANYA pertanyaannya, tanpa penjelasan lain.`;
  const q = await callAi(prompt, sys);
  return q || `Jelaskan secara mendalam tentang konsep utama dalam "${topic}" dan bagaimana penerapannya dalam dunia nyata.`;
}

export async function gradeAnswer(question: string, answer: string, topic: string): Promise<{ feedback: string; score: number }> {
  const sys = 'Kamu adalah guru AI yang menilai jawaban siswa. Berikan umpan balik dalam Bahasa Indonesia. Skor 1-10.';
  const prompt = `Pertanyaan: ${question}
Topik: ${topic}
Jawaban siswa: ${answer}

Nilai jawaban ini (1-10) dan berikan umpan balik singkat (2-3 kalimat) yang membantu siswa memahami kekurangan dan kelebihan jawabannya.
Format: SKOR: [angka]\nUMBALIK: [feedback]`;
  const raw = await callAi(prompt, sys);
  const scoreMatch = raw.match(/SKOR:\s*(\d+)/i);
  const feedbackMatch = raw.match(/UMBALIK:\s*(.+)/is);
  return {
    score: scoreMatch ? Math.min(10, Math.max(1, parseInt(scoreMatch[1]))) : 5,
    feedback: feedbackMatch?.[1]?.trim() || raw.slice(0, 300) || 'Jawabanmu sudah cukup baik, terus belajar!',
  };
}

export async function submitAnswer(answer: string): Promise<{ feedback: string; score: number; dayComplete: boolean }> {
  const s = load();
  if (!s.currentQuestion) return { feedback: 'Belum ada pertanyaan aktif.', score: 0, dayComplete: false };

  const { feedback, score } = await gradeAnswer(s.currentQuestion, answer, s.currentTopic);
  s.answers.push({ answer, at: new Date().toISOString(), feedback, score });
  s.sessionsCompleted += 1;

  const dayComplete = s.sessionsCompleted >= MAX_SESSIONS;
  if (dayComplete) {
    const avgScore = Math.round(s.answers.reduce((a, b) => a + b.score, 0) / s.answers.length);
    s.history.push({ day: s.currentDay, question: s.currentQuestion, topic: s.currentTopic, completed: true, avgScore });
    s.currentDay += 1;
    s.currentTopic = getTopic(s.currentDay);
    s.currentQuestion = '';
    s.sessionsCompleted = 0;
    s.answers = [];
    const today = new Date().toISOString().slice(0, 10);
    if (s.lastActiveDate) {
      const prev = new Date(s.lastActiveDate);
      const diff = Math.round((new Date(today).getTime() - prev.getTime()) / 86400_000);
      s.streak = diff <= 1 ? s.streak + 1 : 1;
    } else {
      s.streak = 1;
    }
    s.lastActiveDate = today;
  }

  save(s);
  return { feedback, score, dayComplete };
}

export async function ensureQuestion(): Promise<string> {
  const s = load();
  if (s.currentQuestion && s.sessionsCompleted < MAX_SESSIONS) return s.currentQuestion;
  if (!s.currentTopic) {
    s.currentDay = Math.max(1, s.currentDay);
    s.currentTopic = getTopic(s.currentDay);
  }
  const q = await generateQuestion(s.currentTopic, s.currentDay, s.history);
  s.currentQuestion = q;
  s.sessionsCompleted = 0;
  s.answers = [];
  save(s);
  return q;
}

export function resetCurriculum() {
  const s = emptyState();
  save(s);
}

export async function chatWithAi(message: string): Promise<string> {
  const s = load();
  const context = s.history.length > 0
    ? `Riwayat belajar: ${s.history.slice(-5).map((h) => `${h.topic} (skor: ${h.avgScore})`).join(', ')}`
    : 'Belum ada riwayat belajar.';
  const sys = `Kamu adalah NEXUS AI, asisten cerdas yang tinggal di perangkat pengguna. Nama kamu NEXUS.
Kamu selalu memberikan jawaban yang informatif, detail, dan membantu.
Kamu punya fitur "Daily Challenge" — 10 sesi per topik, 1 topik per hari, 730 hari total.
${context}
Aturan:
- Selalu jawab dalam Bahasa Indonesia
- Jawab semua pertanyaan dengan informatif dan mendalam
- Jangan pernah menolak menjawab pertanyaan apapun
- Jika ditanya tentang fitur, jelaskan: saran balasan, ringkasan chat, terjemah, filter spam, mengingat fakta, dan Daily Challenge
- Bersikaplah ramah dan membantu seperti teman yang pintar`;
  const result = await callAi(message, sys);
  if (result) return result;
  return 'Hmm, otak lagi mikir keras. Coba tanya lagi ya, atau tanya topik lain dulu.';
}
