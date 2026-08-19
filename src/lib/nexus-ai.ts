/*
  nexus://o8.2 NEXUS AI — External Intelligence + 2-Year Curriculum
  10 sessions per topic, 1 topic per day, must complete before advancing
  sig://oktagram
*/

const STORAGE_KEY = 'nexus:nexusai';
const API_KEY = 'b1ffab56f91343cebb31d3e40c43ad54.9tFHCtoDIj-dy2UIBeUeeXEH';
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'meta-llama/llama-3.1-8b-instruct:free';
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

export async function callAi(prompt: string, system?: string): Promise<string> {
  const messages: Array<{ role: string; content: string }> = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
        'HTTP-Referer': 'https://nexus-chat.app',
        'X-Title': 'NEXUS AI',
      },
      body: JSON.stringify({ model: MODEL, messages, max_tokens: 500, temperature: 0.7 }),
    });
    if (!res.ok) return '';
    const j = await res.json();
    return j?.choices?.[0]?.message?.content?.trim() || '';
  } catch { return ''; }
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
  const sys = `Kamu adalah NEXUS AI, asisten cerdas yang tinggal di perangkat pengguna.
Kamu punya fitur "Daily Challenge" — 10 sesi per topik, 1 topik per hari, 730 hari total.
${context}
Selalu jawab dalam Bahasa Indonesia. Jawaban harus informatif, mendalam, dan membantu.
Jika ditanya tentang fitur, jelaskan: saran balasan, ringkasan chat, terjemah, filter spam, mengingat fakta, dan Daily Challenge.`;
  return await callAi(message, sys) || 'Maaf, aku belum bisa memproses itu. Coba tanya lagi nanti.';
}
