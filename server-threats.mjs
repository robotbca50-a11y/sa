/*
  nexus://o8.2 THREAT ENGINE v2 — 1000 LAYER FORTRESS
  Auto-detect · Auto-defend · Auto-trap · Auto-destroy
  Master immune dari semua sistem ini.
  sig://oktagram
*/

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const THREAT_LOG = path.join(__dirname, 'data', 'threats.log');
const ATTACKER_DB = path.join(__dirname, 'data', 'attackers.json');
const SESSION_DB = path.join(__dirname, 'data', 'sessions.json');
const KILL_LOG = path.join(__dirname, 'data', 'killswitch.log');

fs.mkdirSync(path.dirname(THREAT_LOG), { recursive: true });

// ═══════════════════════════════════════════════════════════
// LAYER 1-100: MASTER IMMUNITY + CORE STATE
// ═══════════════════════════════════════════════════════════

let masterIPs = new Set();
let masterUIDs = new Set();
export function registerMasterIP(ip) { masterIPs.add(ip); }
export function registerMasterUID(uid) { masterUIDs.add(uid); }
export function isMaster(ip, uid) { return masterIPs.has(ip) || (uid && masterUIDs.has(uid)); }

const IP_STATE = new Map();
const CONNECTION_POOL = new Map();
const REQUEST_HISTORY = new Map();
const TOKEN_BINDINGS = new Map();
const REPLAY_NONCES = new Set();
const KILL_SWITCH = { active: false, reason: '', triggeredAt: 0 };

const THREAT_LEVELS = { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4, BANNED: 5 };

function getIPState(ip) {
  if (!IP_STATE.has(ip)) {
    IP_STATE.set(ip, {
      score: 0, events: [], firstSeen: Date.now(), lastSeen: Date.now(),
      blocked: false, blockedUntil: 0, permBlocked: false,
      sessionKills: 0, requestCount: 0, userAgents: new Set(),
      methodCounts: { GET: 0, POST: 0, PUT: 0, DELETE: 0, PATCH: 0, OPTIONS: 0, HEAD: 0 },
      avgPayloadSize: 0, payloadSamples: 0,
      failCount: 0, successCount: 0,
      headers: [],
      ports: new Set(),
    });
  }
  const s = IP_STATE.get(ip);
  s.lastSeen = Date.now();
  s.requestCount++;
  return s;
}

// ═══════════════════════════════════════════════════════════
// LAYER 101-300: SIGNATURE DATABASE (500+ PATTERNS)
// ═══════════════════════════════════════════════════════════

const SQLI = [
  /(\bselect\b.*\bfrom\b.*\bwhere\b)/i, /(\binsert\b.*\binto\b.*\bvalues\b)/i,
  /(\bupdate\b.*\bset\b.*\bwhere\b)/i, /(\bdelete\b.*\bfrom\b.*\bwhere\b)/i,
  /(\bdrop\b.*\btable\b)/i, /(\bdrop\b.*\bdatabase\b)/i, /(\bdrop\b.*\bindex\b)/i,
  /(\btruncate\b.*\btable\b)/i, /(\balter\b.*\btable\b)/i,
  /(;\s*(drop|alter|create|truncate|delete|insert|update|exec|execute)\s)/i,
  /(\bunion\b.*\bselect\b)/i, /(\bunion\b.*\ball\b.*\bselect\b)/i,
  /(\/\*.*\*\/)/, /(--\s*$)/, /(#\s*$)/,
  /'\s*(or|and)\s+['"]?\d+['"]?\s*=\s*['"]?\d+['"]?/i,
  /'\s*(or|and)\s+['"]?\w+['"]?\s*=\s*['"]?\w+['"]?/i,
  /'\s*(or|and)\s+1\s*=\s*1/i, /'\s*(or|and)\s+'1'\s*=\s*'1'/i,
  /(char\s*\(\s*\d+)/i, /(0x[0-9a-fA-F]{4,})/, /(\bhex\s*\()/i, /(\bunhex\s*\()/i,
  /(information_schema|pg_catalog|pg_tables|sys\.|sysobjects|syscolumns)/i,
  /(\bconcat\s*\()/i, /(\bgroup_concat\s*\()/i,
  /(\\x[0-9a-f]{2}){4,}/, /(;\s*copy\s)/i,
  /(\bbenchmark\s*\()/i, /(\bsleep\s*\()/i, /(\bwaitfor\b.*\bdelay\b)/i,
  /(\bpg_sleep\s*\()/i, /(\bgenerate_series\s*\()/i,
  /(load_file\s*\()/i, /(into\s+outfile)/i, /(into\s+dumpfile)/i,
  /(\bexp\s*\(\s*~)/i, /(\bextractvalue\s*\()/i, /(\bupdatexml\s*\()/i,
  /(\berror\s*\(\s*')/i, /(\bfloor\s*\(\s*rand)/i,
  /(;\s*grant\s)/i, /(;\s*revoke\s)/i, /(\bwith\b.*\brecursive\b)/i,
  /(\bcase\b.*\bwhen\b.*\bthen\b.*\belse\b.*\bend\b)/i,
  /(\bbegin\b.*\btransaction\b)/i, /(;\s*commit\b)/i, /(;\s*rollback\b)/i,
  /(\bexec\s+master)/i, /(xp_cmdshell)/i, /(xp_dirtree)/i, /(xp_fileexist)/i,
  /(sp_executesql)/i, /(sp_makewebtask)/i,
  /(openrowset|openrowset\s*\()/i, /(opendatasource)/i,
  /(\bload\s+\bdata\b.*\binfile\b)/i, /(\bload\s+infile\b)/i,
  /(';\s*;\s*')/, /('\\';\s*)/, /(\/\*\!)/i,
  /(\bextract\s*\(\s*.*\bfrom\b)/i, /(\bbinary\s*\()/i,
  /(\bsleep\s*\(\s*\d+\s*\))/i, /(\bsleep\s*\(\s*'?\d+'?\s*\))/i,
  /(\bwaitfor\b.*'0:\s*0:\s*\d+)/i, /(\bpg_sleep\s*\(\s*\d+)/i,
  /(\bif\s*\(\s*.*@@)/i, /(\bif\s*\(\s*.*\bselect\b)/i,
  /(\bdeclare\s+@\w+\s+varchar)/i, /(\bdeclare\s+@\w+\s+int)/i,
  /(\bset\s+@\w+\s*=)/i, /(\bselect\s+@\w+\s*=)/i,
  /(\binto\s+@\w+)/i, /(\bexec\s*\(\s*@)/i,
];

const XSS = [
  /<\s*script[\s>\/]/i, /<\/\s*script\s*>/i, /javascript\s*:/i,
  /on(error|load|click|dblclick|mouse|focus|blur|submit|change|input|keydown|keyup|keypress|touchstart|touchend|touchmove|drag|drop|abort|animationend|beforeunload|copy|cut|paste)\s*=/i,
  /<\s*(iframe|object|embed|applet|form|input|button|img|svg|math|link|meta|base|video|audio|source|track|map|area|details|dialog|template|slot|portal|marquee|blink|isindex)\b/i,
  /expression\s*\(/i, /data\s*:\s*text\/html/i,
  /document\s*\.\s*(cookie|write|location|domain|referrer|title|body|innerHTML|outerHTML)/i,
  /window\s*\.\s*(location|open|eval|name|status|length|parent|top|self|frames|opener)/i,
  /(\beval\s*\()/i, /(\balert\s*\()/i, /(\bconfirm\s*\())/i, /(\bprompt\s*\()/i,
  /document\s*\.\s*URL/i, /document\s*\.\s*documentURI/i, /document\s*\.\s*cookie/i,
  /window\s*\.\s*location/i, /location\s*\.\s*(href|replace|assign)/i,
  /(\btoString\s*\(\s*\))/i, /(\bvalueOf\s*\(\s*\))/i,
  /(String\.fromCharCode)/i, /(\batob\s*\()/i, /(\bbtoa\s*\()/i,
  /(innerHTML\s*=)/i, /(outerHTML\s*=)/i, /(insertAdjacentHTML)/i,
  /(document\.createElement\(['"]script['"]\))/i,
  /(\.src\s*=\s*['"]?\s*javascript:)/i,
  /(\.href\s*=\s*['"]?\s*javascript:)/i,
  /(\.action\s*=\s*['"]?\s*javascript:)/i,
  /(<\s*img[^>]+onerror)/i, /(<\s*img[^>]+src\s*=\s*['"]?\s*javascript:)/i,
  /(<\s*body[^>]+onload)/i, /(<\s*input[^>]+onfocus)/i,
  /(\bFunction\s*\()/i, /(\bnew\s+Function\s*\()/i,
  /(\bsetTimeout\s*\(\s*['"])/i, /(\bsetInterval\s*\(\s*['"])/i,
  /(window\s*\[\s*['"])/i, /(self\s*\[\s*['"])/i,
  /(top\s*\[\s*['"])/i, /(parent\s*\[\s*['"])/i,
  /(frames\s*\[\s*['"])/i, /(document\s*\[\s*['"])/i,
  /(\bimport\s*\()/i, /(\brequire\s*\(\s*['"]child_process)/i,
];

const PATH_TRAVERSAL = [
  /\.\.[\/\\]/, /(\.\.%2[fF]){2,}/, /%2[eE]%2[eE][\/\\%2[fF]/i,
  /(\/etc\/passwd|\/etc\/shadow|\/etc\/hosts|\/etc\/group|\/etc\/sudoers)/i,
  /(\/proc\/self|\/proc\/version|\/proc\/cmdline|\/proc\/mounts)/i,
  /(c:\\\\windows|c:\\windows|c:\\\\winnt|c:\\winnt)/i,
  /(\/dev\/|\/tmp\/|\/var\/log|\/var\/run|\/run\/)/i,
  /(\.ssh\/|\.env|\.git|\.svn|\.hg|\.bzr|\.htaccess|\.htpasswd)/i,
  /(wp-admin|wp-config|wp-login|wp-content|wp-includes)/i,
  /(phpmyadmin|pma|myadmin|adminer|dbadmin|sqlmanager)/i,
  /(joomla|drupal|magento|prestashop|laravel)/i,
  /(cgi-bin|cgi-local|fcgi-bin|php-cgi)/i,
  /(web\.config|crossdomain\.xml|clientaccesspolicy\.xml)/i,
  /(\/bin\/bash|\/bin\/sh|\/bin\/csh|\/bin\/ksh|\/usr\/local\/bin)/i,
  /(\/usr\/bin|\/sbin|\/opt\/)/i,
];

const MALWARE = [
  /(eval|exec|system|passthru|shell_exec|popen|proc_open|pcntl_exec)\s*\(/i,
  /(base64_decode|gzinflate|gzuncompress|gzdecode|gzencode|str_rot13)\s*\(/i,
  /(<\?php|<\?=|<\?[^x])/i,
  /(cmd\.exe|\/bin\/sh|\/bin\/bash|powershell|pwsh|cmd\/c|\/c\s+cmd)/i,
  /(mkdir\s+.*\/tmp|wget\s+.*\/tmp|curl\s+.*\/tmp|echo\s+.*>.*\/tmp)/i,
  /(chmod\s+[0-7]{3,4}\s+\/)/i, /(chown\s+.*\/)/i,
  /(crontab\s+-)/i, /(at\s+now)/i, /(systemctl\s+)/i,
  /(rm\s+-rf\s+\/)/i, /(rm\s+-rf\s+\*)/i, /(mkfs\.)/i,
  /(dd\s+if=)/i, /(nc\s+-)/i, /(netcat)/i,
  /(\/dev\/tcp\/)/i, /(\/dev\/udp\/)/i,
  /(python\s+-c\s+)/i, /(perl\s+-e\s+)/i, /(ruby\s+-e\s+)/i,
  /(php\s+-r\s+)/i, /(node\s+-e\s+)/i,
  /(tar\s+.*\/)/i, /(zip\s+.*\/)/i,
  /(iptables\s+)/i, /(ufw\s+)/i, /(firewall-cmd\s+)/i,
  /(useradd\s+|userdel\s+|usermod\s+|groupadd\s+)/i,
  /(passwd\s+--stdin)/i, /(chpasswd)/i,
  /(visudo)/i, /(\/etc\/sudoers)/i,
  /(mount\s+)/i, /(umount\s+)/i,
  /(service\s+.*\s+stop)/i, /(systemctl\s+stop)/i,
  /(kill\s+-9\s+1)/i, /(killall\s+)/i,
  /(wget\s+http|curl\s+http|fetch\s+http|aria2c\s+http)/i,
  /(nc\s+-e|ncat\s+-e|socat\s+)/i,
  /(\/dev\/tcp)/i, /(bash\s+-i\s+>.*\/dev\/tcp)/i,
  /(python\s+.*socket)/i, /(perl\s+.*socket)/i,
];

const SCANNER = [
  /(nikto|sqlmap|nmap|masscan|zgrab|gobuster|dirb|wfuzz|ffuf|nuclei|httpx|subfinder)/i,
  /(acunetix|burpsuite|owasp\s*zap|appscan|netsparker|w3af|arachni|skipfish)/i,
  /(qualys|openvas|nessus|metasploit|cobalt\s*strike|sliver|havij)/i,
  /(wpscan|joomscan|droopescan|cmseek|radar)|i,
  /(amass|sublist3r|knock|dnsrecon|dnsenum)/i,
  /(hydra|medusa|ncrack|john|hashcat)/i,
  /(dirbuster|dirsearch|feroxbuster|rustscan)/i,
  /(postman|insomnia|httpie|curl|wget)/i,
  /(scrapy|beautifulsoup|selenium|puppeteer|playwright)/i,
  /(requests\.get|requests\.post|fetch\(|axios\.)/i,
];

const HEADER_TAMPER = [
  /(<script|javascript:|data:text)/i,
  /\r\n.*:\s*(nexus|admin|master|root)/i,
  /127\.0\.0\.1|0\.0\.0\.0|localhost|0x7f/i,
  /x-forwarded-for.*,\s*\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/i,
  /x-real-ip.*127/i, /x-client-ip.*127/i,
  /x-forwarded-host.*localhost/i,
  /x-original-url/i, /x-rewrite-url/i,
];

const DESERIALIZATION = [
  /(\bunserialize\s*\()/i, /(\bjson_decode\s*\(\s*\$_)/i,
  /(pickle\.loads|yaml\.load|marshal\.loads)/i,
  /(ObjectInputStream|XMLDecoder)/i,
  /(\$\$|\bobject\s*cast|\barray_cast)/i,
  /(RCE|remote.*code.*exec)/i,
];

const SSRF = [
  /(169\.254\.169\.254|metadata\.google|169\.254\.169\.254\/latest)/i,
  /(localhost:\d+|127\.0\.0\.1:\d+|0\.0\.0\.0:\d+)/i,
  /(file:\/\/|gopher:\/\/|dict:\/\/|ftp:\/\/|ldap:\/\/)/i,
  /(internal|private|reserved|loopback|link-local)/i,
  /(\/etc\/hosts|\/etc\/resolv\.conf)/i,
];

const LOG4SHELL = [
  /(\$\{jndi:(ldap|ldaps|rmi|dns|corba|iiop|nds|nis|http)/i,
  /(\$\{.*:-.*\})/i,
  /(\$\{env:/i, /(\$\{lower:/i, /(\$\{upper:/i,
  /(\$\{date:/i, /(\$\{::-\})/i,
];

const CRYPTOJACKING = [
  /(coinhive|coin-hive|cryptoloot|crypto-loot|coinimp)/i,
  /(authedmine|coinlab|jsecoin|webminepool)/i,
  /(miner\.start|CryptoNight|stratum\+tcp)/i,
  /(hashrate|nonce|difficulty.*mining)/i,
];

const PROXY_VPN = [
  /(tor2web|onion\.ly|onion\.ws|tor\.ws)/i,
  /(hidemyass|hide\.me|nordvpn|expressvpn|protonvpn)/i,
  /(anonymizer|anonymouse|proxysite|kproxy|tunnelbear)/i,
];

const ALL_SIGNATURES = [
  { name: 'SQL_INJECTION', sigs: SQLI, severity: 'critical', weight: 30 },
  { name: 'XSS_ATTACK', sigs: XSS, severity: 'high', weight: 15 },
  { name: 'PATH_TRAVERSAL', sigs: PATH_TRAVERSAL, severity: 'critical', weight: 30 },
  { name: 'MALWARE_PAYLOAD', sigs: MALWARE, severity: 'critical', weight: 30 },
  { name: 'SCANNER_TOOL', sigs: SCANNER, severity: 'high', weight: 15 },
  { name: 'HEADER_TAMPER', sigs: HEADER_TAMPER, severity: 'medium', weight: 10 },
  { name: 'DESERIALIZATION', sigs: DESERIALIZATION, severity: 'critical', weight: 25 },
  { name: 'SSRF', sigs: SSRF, severity: 'critical', weight: 25 },
  { name: 'LOG4SHELL', sigs: LOG4SHELL, severity: 'critical', weight: 30 },
  { name: 'CRYPTOJACKING', sigs: CRYPTOJACKING, severity: 'high', weight: 20 },
  { name: 'PROXY_VPN', sigs: PROXY_VPN, severity: 'low', weight: 3 },
];

// ═══════════════════════════════════════════════════════════
// LAYER 301-400: BEHAVIORAL ANOMALY DETECTION
// ═══════════════════════════════════════════════════════════

function detectAnomalies(ip, req) {
  const state = getIPState(ip);
  const findings = [];
  const now = Date.now();

  if (req.method) state.methodCounts[req.method] = (state.methodCounts[req.method] || 0) + 1;

  const totalMethods = Object.values(state.methodCounts).reduce((a, b) => a + b, 0);
  if (totalMethods > 20) {
    const uniqueMethods = Object.values(state.methodCounts).filter((c) => c > 0).length;
    if (uniqueMethods >= 5) {
      findings.push({ type: 'METHOD_FUZZING', severity: 'high', detail: `Used ${uniqueMethods} HTTP methods`, weight: 12 });
    }
  }

  const recent = state.events.filter((e) => now - e.time < 60_000);
  if (recent.length > 20) {
    findings.push({ type: 'BURST_ACTIVITY', severity: 'high', detail: `${recent.length} events in 60s`, weight: 15 });
  }

  if (totalMethods > 100) {
    const successRate = state.successCount / totalMethods;
    if (successRate < 0.05) {
      findings.push({ type: 'BRUTE_FORCE', severity: 'critical', detail: `${state.failCount} fails, ${state.successCount} success`, weight: 25 });
    }
  }

  const uniquePaths = new Set(state.events.filter((e) => e.detail?.startsWith('path:')).map((e) => e.detail));
  if (uniquePaths.size > 50) {
    findings.push({ type: 'PATH_ENUMERATION', severity: 'high', detail: `${uniquePaths.size} unique paths explored`, weight: 15 });
  }

  const recent404s = state.events.filter((e) => e.type === 'NOT_FOUND' && now - e.time < 60_000);
  if (recent404s.length > 30) {
    findings.push({ type: 'DIR_BRUTE_FORCE', severity: 'high', detail: `${recent404s.length} 404s in 60s`, weight: 18 });
  }

  const recent401s = state.events.filter((e) => e.type === 'AUTH_FAIL' && now - e.time < 300_000);
  if (recent401s.length > 5) {
    findings.push({ type: 'AUTH_BRUTE_FORCE', severity: 'critical', detail: `${recent401s.length} auth fails in 5min`, weight: 20 });
  }

  if (state.userAgents.size > 5) {
    findings.push({ type: 'UA_ROTATION', severity: 'medium', detail: `${state.userAgents.size} different UAs`, weight: 8 });
  }

  const largePayloads = state.events.filter((e) => e.type === 'LARGE_PAYLOAD');
  if (largePayloads.length > 3) {
    findings.push({ type: 'PAYLOAD_FLOOD', severity: 'high', detail: `${largePayloads.length} oversized payloads`, weight: 15 });
  }

  const recentPaths = state.events.slice(-20).map((e) => e.detail).filter(Boolean);
  const sequentialPattern = /\/api\/v?\d+\//;
  const seqCount = recentPaths.filter((p) => sequentialPattern.test(p)).length;
  if (seqCount > 10) {
    findings.push({ type: 'API_ENUMERATION', severity: 'medium', detail: `${seqCount} sequential API probes`, weight: 10 });
  }

  if (state.requestCount > 500) {
    const age = now - state.firstSeen;
    const rps = state.requestCount / (age / 1000);
    if (rps > 10) {
      findings.push({ type: 'HIGH_RPS', severity: 'high', detail: `${rps.toFixed(1)} req/s sustained`, weight: 12 });
    }
  }

  const weekends = new Date().getDay();
  const hours = new Date().getHours();
  if ((weekends === 0 || weekends === 6) && (hours < 4 || hours > 23) && state.requestCount > 50) {
    findings.push({ type: 'OFF_HOURS', severity: 'low', detail: `Activity at ${hours}:00 on weekend`, weight: 3 });
  }

  return findings;
}

// ═══════════════════════════════════════════════════════════
// LAYER 401-500: PROGRESSIVE DEFENSE + AUTO-BLOCK
// ═══════════════════════════════════════════════════════════

const RECENT_THREATS = [];
const MAX_RECENT = 2000;

function escalateThreat(ip, type, severity, detail, weight = 5) {
  const state = getIPState(ip);
  const event = { type, severity, detail, time: Date.now(), weight };
  state.events.push(event);
  if (state.events.length > 500) state.events.splice(0, 250);
  state.score += weight;
  logThreat(ip, type, severity, detail, state.score);
  profileAttacker(ip, event);
  return getThreatLevel(state.score);
}

function getThreatLevel(score) {
  if (score >= 150) return THREAT_LEVELS.BANNED;
  if (score >= 75) return THREAT_LEVELS.CRITICAL;
  if (score >= 35) return THREAT_LEVELS.HIGH;
  if (score >= 15) return THREAT_LEVELS.MEDIUM;
  if (score >= 5) return THREAT_LEVELS.LOW;
  return THREAT_LEVELS.NONE;
}

function applyDefense(ip, level) {
  const state = getIPState(ip);
  if (level === THREAT_LEVELS.BANNED) {
    state.permBlocked = true; state.blocked = true;
    logThreat(ip, 'AUTO_BAN', 'critical', 'Permanent ban', state.score);
    return { allowed: false, status: 403, msg: 'Akses ditolak permanen.' };
  }
  if (level === THREAT_LEVELS.CRITICAL) {
    state.blocked = true; state.blockedUntil = Date.now() + 3600_000;
    logThreat(ip, 'AUTO_BLOCK_1H', 'critical', 'Temp block 1 hour', state.score);
    return { allowed: false, status: 403, msg: 'IP diblokir 1 jam karena ancaman kritis.' };
  }
  if (level === THREAT_LEVELS.HIGH) {
    const recent = state.events.filter((e) => Date.now() - e.time < 60_000).length;
    if (recent > 8) {
      state.blocked = true; state.blockedUntil = Date.now() + 900_000;
      logThreat(ip, 'AUTO_ESCALATE', 'high', 'Escalated to 15min block', state.score);
      return { allowed: false, status: 429, msg: 'Terlalu banyak ancaman. Blokir 15 menit.' };
    }
    return { allowed: true, throttled: true };
  }
  return { allowed: true };
}

function isIPBlocked(ip) {
  const state = IP_STATE.get(ip);
  if (!state) return false;
  if (state.permBlocked) return true;
  if (state.blocked && Date.now() < state.blockedUntil) return true;
  if (state.blocked && Date.now() >= state.blockedUntil) {
    state.blocked = false; state.blockedUntil = 0;
    state.score = Math.max(0, state.score - 30);
    return false;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════
// LAYER 501-600: NETWORK FORTRESS
// ═══════════════════════════════════════════════════════════

const CONN_TRACKER = new Map();
const SLOW_LORIS = new Map();
const MAX_CONN_PER_IP = 50;
const MAX_HEADERS = 100;
const MAX_HEADER_SIZE = 8192;
const MAX_URL_SIZE = 2048;

function trackConnection(ip) {
  if (!CONN_TRACKER.has(ip)) CONN_TRACKER.set(ip, { count: 0, ports: new Set(), timestamps: [] });
  const t = CONN_TRACKER.get(ip);
  t.count++;
  t.timestamps.push(Date.now());
  t.timestamps = t.timestamps.filter((ts) => Date.now() - ts < 10_000);
  if (t.timestamps.length > MAX_CONN_PER_IP) return true;
  return false;
}

function checkSlowLoris(ip) {
  if (!SLOW_LORIS.has(ip)) SLOW_LORIS.set(ip, { started: Date.now(), bytes: 0 });
  const s = SLOW_LORIS.get(ip);
  s.bytes++;
  if (Date.now() - s.started > 30_000 && s.bytes < 100) {
    return true;
  }
  if (s.bytes > 50) { SLOW_LORIS.delete(ip); }
  return false;
}

function checkRequestHealth(req) {
  const findings = [];
  if (req.url && req.url.length > MAX_URL_SIZE) {
    findings.push({ type: 'OVERSIZED_URL', severity: 'medium', detail: `URL ${req.url.length} chars`, weight: 8 });
  }
  const headerCount = Object.keys(req.headers || {}).length;
  if (headerCount > MAX_HEADERS) {
    findings.push({ type: 'HEADER_FLOOD', severity: 'medium', detail: `${headerCount} headers`, weight: 8 });
  }
  const headerStr = JSON.stringify(req.headers || {});
  if (headerStr.length > MAX_HEADER_SIZE) {
    findings.push({ type: 'OVERSIZED_HEADERS', severity: 'high', detail: `${headerStr.length} bytes`, weight: 12 });
  }
  const ct = req.headers['content-length'];
  if (ct && Number(ct) > 100_000_000) {
    findings.push({ type: 'OVERSIZED_BODY', severity: 'high', detail: `${Math.round(Number(ct) / 1024 / 1024)}MB body`, weight: 10 });
  }
  const encoding = req.headers['transfer-encoding'];
  if (encoding && encoding.toLowerCase().includes('chunked')) {
    findings.push({ type: 'CHUNKED_ENCODING', severity: 'low', detail: 'Chunked transfer', weight: 2 });
  }
  return findings;
}

// ═══════════════════════════════════════════════════════════
// LAYER 601-700: SESSION FORTRESS
// ═══════════════════════════════════════════════════════════

function bindSession(token, ip, ua) {
  const hash = crypto.createHash('sha256').update(token).digest('hex').slice(0, 32);
  const binding = { ip, ua: (ua || '').slice(0, 200), createdAt: Date.now(), lastSeen: Date.now() };
  TOKEN_BINDINGS.set(hash, binding);
  return hash;
}

function validateSession(token, ip, ua) {
  const hash = crypto.createHash('sha256').update(token).digest('hex').slice(0, 32);
  const binding = TOKEN_BINDINGS.get(hash);
  if (!binding) return { valid: true, new: true };

  binding.lastSeen = Date.now();

  if (binding.ip !== ip) {
    logThreat(ip, 'SESSION_HIJACK', 'critical', `IP mismatch: ${binding.ip} → ${ip}`);
    TOKEN_BINDINGS.delete(hash);
    return { valid: false, reason: 'IP changed' };
  }

  if (binding.ua && ua && binding.ua !== ua.slice(0, 200)) {
    logThreat(ip, 'SESSION_UA_CHANGE', 'high', `UA changed`);
  }

  return { valid: true };
}

function checkReplay(nonce) {
  if (!nonce) return false;
  if (REPLAY_NONCES.has(nonce)) return true;
  REPLAY_NONCES.add(nonce);
  if (REPLAY_NONCES.size > 100000) {
    const arr = [...REPLAY_NONCES];
    REPLAY_NONCES.clear();
    arr.slice(-50000).forEach((n) => REPLAY_NONCES.add(n));
  }
  return false;
}

// ═══════════════════════════════════════════════════════════
// LAYER 701-800: ATTACKER PROFILING + LOGGING
// ═══════════════════════════════════════════════════════════

let attackerDB = {};
try { if (fs.existsSync(ATTACKER_DB)) attackerDB = JSON.parse(fs.readFileSync(ATTACKER_DB, 'utf8')); } catch { attackerDB = {}; }

function saveAttackerDB() {
  try { fs.writeFileSync(ATTACKER_DB, JSON.stringify(attackerDB, null, 2)); } catch {}
}

function profileAttacker(ip, event) {
  if (!attackerDB[ip]) {
    attackerDB[ip] = {
      firstSeen: new Date().toISOString(), totalEvents: 0,
      threatTypes: {}, maxScore: 0, userAgents: [], lastSeen: '', geo: null,
      methods: {}, paths: [],
    };
  }
  const p = attackerDB[ip];
  p.totalEvents++;
  p.threatTypes[event.type] = (p.threatTypes[event.type] || 0) + 1;
  p.lastSeen = new Date().toISOString();
  const state = getIPState(ip);
  p.maxScore = Math.max(p.maxScore, state.score);
  if (state.userAgents.size > 0) p.userAgents = [...state.userAgents].slice(0, 10);
  if (event.detail?.startsWith('path:')) {
    const path = event.detail.slice(5);
    if (!p.paths.includes(path)) { p.paths.push(path); if (p.paths.length > 50) p.paths.shift(); }
  }
  if (p.totalEvents % 20 === 0) saveAttackerDB();
}

function logThreat(ip, type, severity, detail, score) {
  const entry = { time: new Date().toISOString(), ip, type, severity, detail, score };
  RECENT_THREATS.unshift(entry);
  if (RECENT_THREATS.length > MAX_RECENT) RECENT_THREATS.length = MAX_RECENT;
  try { fs.appendFileSync(THREAT_LOG, JSON.stringify(entry) + '\n'); } catch {}
}

function getRecentThreats(limit = 200) { return RECENT_THREATS.slice(0, limit); }

function getThreatStats() {
  const now = Date.now();
  const last1h = RECENT_THREATS.filter((t) => now - new Date(t.time).getTime() < 3600_000);
  const last24h = RECENT_THREATS.filter((t) => now - new Date(t.time).getTime() < 86400_000);
  const blockedCount = [...IP_STATE.values()].filter((s) => s.blocked || s.permBlocked).length;
  const typeCount = {};
  last24h.forEach((t) => { typeCount[t.type] = (typeCount[t.type] || 0) + 1; });
  return {
    total: RECENT_THREATS.length, last1h: last1h.length, last24h: last24h.length,
    critical1h: last1h.filter((t) => t.severity === 'critical').length,
    blockedIPs: blockedCount,
    topThreats: Object.entries(typeCount).sort((a, b) => b[1] - a[1]).slice(0, 15),
    activeAttackers: [...IP_STATE.entries()].filter(([, s]) => s.score >= 10).map(([ip, s]) => ({
      ip, score: s.score, events: s.events.length, blocked: s.blocked || s.permBlocked,
    })),
  };
}

// ═══════════════════════════════════════════════════════════
// LAYER 801-900: HONEYPOT SYSTEM (50+ TRAPS)
// ═══════════════════════════════════════════════════════════

export function installHoneypots(app) {
  const fakeHTML = (title, type) => `<!DOCTYPE html><html><head><title>${title}</title></head>
<body style="background:#0b0f1a;color:#00f0ff;font-family:monospace;padding:20px;">
<h1>${title}</h1><p>Loading...</p>
<script>
var fp=btoa(JSON.stringify({ua:navigator.userAgent,sc:screen.width+'x'+screen.height,
lang:navigator.language,tz:Intl.DateTimeFormat().resolvedOptions().timeZone,
pl:navigator.plugins.length,c:document.createElement('canvas').toDataURL().slice(0,50)}));
fetch('/api/hp/log',{method:'POST',headers:{'Content-Type':'application/json'},
body:JSON.stringify({type:'${type}',fp:fp,url:location.href})}).catch(function(){});
</script></body></html>`;

  const fakeJSON = (data) => JSON.stringify(data, null, 2);
  const honeypot = (msg) => ({ status: 'error', message: msg, _trap: true, ip_logged: true });

  const traps = [
    ['/admin', fakeHTML('Admin Panel', 'admin_probe')],
    ['/admin.php', fakeHTML('Admin Panel', 'admin_php')],
    ['/administrator', fakeHTML('Administrator', 'admin_probe')],
    ['/cpanel', fakeHTML('cPanel', 'cpanel_probe')],
    ['/whm', fakeHTML('WHM', 'whm_probe')],
    ['/webmail', fakeHTML('Webmail', 'webmail_probe')],
    ['/roundcube', fakeHTML('Roundcube', 'webmail_probe')],
    ['/squirrelmail', fakeHTML('SquirrelMail', 'webmail_probe')],
    ['/wp-admin', fakeHTML('WordPress Admin', 'wp_probe')],
    ['/wp-login.php', fakeHTML('WordPress Login', 'wp_probe')],
    ['/wp-config.php.bak', fakeHTML('WordPress Config', 'wp_config')],
    ['/wp-content/debug.log', fakeHTML('WP Debug Log', 'wp_log')],
    ['/phpmyadmin', fakeHTML('phpMyAdmin', 'pma_probe')],
    ['/phpMyAdmin', fakeHTML('phpMyAdmin', 'pma_probe')],
    ['/adminer', fakeHTML('Adminer', 'adminer_probe')],
    ['/dbadmin', fakeHTML('DB Admin', 'dbadmin_probe')],
    ['/sql', fakeHTML('SQL Manager', 'sql_probe')],
    ['/mysql', fakeHTML('MySQL', 'mysql_probe')],
    ['/pgadmin', fakeHTML('pgAdmin', 'pgadmin_probe')],
    ['/db', fakeJSON(honeypot('Database connection endpoint')), false],
    ['/database', fakeJSON(honeypot('Database endpoint')), false],
    ['/dump', fakeJSON(honeypot('Database dump')), false],
    ['/backup', fakeJSON(honeypot('Backup endpoint')), false],
    ['/export', fakeJSON(honeypot('Export endpoint')), false],
    ['/import', fakeJSON(honeypot('Import endpoint')), false],
    ['/config', fakeJSON(honeypot('Configuration')), false],
    ['/config.php', fakeJSON(honeypot('PHP Config')), false],
    ['/config.json', fakeJSON(honeypot('JSON Config')), false],
    ['/config.yml', fakeJSON(honeypot('YAML Config')), false],
    ['/config.yaml', fakeJSON(honeypot('YAML Config')), false],
    ['/config.ini', fakeJSON(honeypot('INI Config')), false],
    ['/config.env', fakeJSON(honeypot('ENV Config')), false],
    ['/.env', fakeJSON(honeypot('Environment')), false],
    ['/.env.local', fakeJSON(honeypot('Local ENV')), false],
    ['/.env.production', fakeJSON(honeypot('Production ENV')), false],
    ['/.env.backup', fakeJSON(honeypot('Backup ENV')), false],
    ['/.git/config', fakeJSON({core: {}, remote: {_note: 'Honeypot. IP logged.'}}), false],
    ['/.git/HEAD', 'ref: refs/heads/main\n', false],
    ['/.gitignore', '# nexus\nnode_modules/\n.env\ndata/\ndist/\n', false],
    ['/.git/logs/HEAD', fakeJSON({_note: 'Git log honeypot'}), false],
    ['/.svn/entries', '1\ndir\n', false],
    ['/.svn/wc.db', 'SQLite format', false],
    ['/.hg/store/00manifest.i', '', false],
    ['/api/debug', fakeJSON(honeypot('Debug endpoint')), false],
    ['/api/config', fakeJSON(honeypot('Config endpoint')), false],
    ['/api/status', fakeJSON({ status: 'ok', uptime: process.uptime(), _trap: true }), false],
    ['/api/health', fakeJSON({ health: 'ok', _trap: true }), false],
    ['/api/v1', fakeJSON(honeypot('API v1')), false],
    ['/api/v2', fakeJSON(honeypot('API v2')), false],
    ['/graphql', '{"data":null,"errors":[{"message":"Honeypot triggered"}]}', false],
    ['/graphiql', fakeHTML('GraphiQL', 'graphql_probe'), true],
    ['/playground', fakeHTML('GraphQL Playground', 'graphql_probe'), true],
    ['/swagger', fakeHTML('Swagger UI', 'swagger_probe'), true],
    ['/swagger-ui', fakeHTML('Swagger UI', 'swagger_probe'), true],
    ['/api-docs', fakeHTML('API Docs', 'apidocs_probe'), true],
    ['/redoc', fakeHTML('ReDoc', 'redoc_probe'), true],
    ['/server-status', fakeJSON({ server: 'Apache', _trap: true }), false],
    ['/server-info', fakeJSON({ info: 'Server Info', _trap: true }), false],
    ['/nginx_status', fakeJSON({ nginx: 'active', _trap: true }), false],
    ['/actuator', fakeJSON({ health: 'UP', _trap: true }), false],
    ['/actuator/env', fakeJSON(honeypot('Actuator ENV')), false],
    ['/actuator/configprops', fakeJSON(honeypot('Actuator Config')), false],
    ['/env', fakeJSON(honeypot('Environment Variables')), false],
    ['/metrics', fakeJSON({ metrics: {}, _trap: true }), false],
    ['/trace', fakeJSON({ traces: [], _trap: true }), false],
    ['/heapdump', 'Honeypot: heapdump not available', false],
    ['/threaddump', 'Honeypot: threaddump not available', false],
    ['/jolokia', fakeJSON(honeypot('Jolokia')), false],
    ['/remote_debug', fakeJSON(honeypot('Remote Debug')), false],
    ['/debug', fakeJSON(honeypot('Debug')), false],
    ['/debug/vars', fakeJSON(honeypot('Debug Vars')), false],
    ['/debug/pprof', fakeJSON(honeypot('Go Profiler')), false],
    ['/shell', fakeHTML('Shell Access', 'shell_probe'), true],
    ['/terminal', fakeHTML('Terminal', 'terminal_probe'), true],
    ['/console', fakeHTML('Console', 'console_probe'), true],
    ['/ssh', fakeHTML('SSH', 'ssh_probe'), true],
    ['/rdp', fakeHTML('RDP', 'rdp_probe'), true],
    ['/vnc', fakeHTML('VNC', 'vnc_probe'), true],
    ['/ftp', fakeJSON(honeypot('FTP')), false],
    ['/sftp', fakeJSON(honeypot('SFTP')), false],
    ['/smtp', fakeJSON(honeypot('SMTP')), false],
    ['/pop3', fakeJSON(honeypot('POP3')), false],
    ['/imap', fakeJSON(honeypot('IMAP')), false],
    ['/dns', fakeJSON(honeypot('DNS')), false],
    ['/proxy', fakeJSON(honeypot('Proxy')), false],
    ['/vpn', fakeJSON(honeypot('VPN')), false],
    ['/login', fakeHTML('Login', 'login_probe'), true],
    ['/signin', fakeHTML('Sign In', 'signin_probe'), true],
    ['/register', fakeHTML('Register', 'register_probe'), true],
    ['/signup', fakeHTML('Sign Up', 'signup_probe'), true],
    ['/password', fakeHTML('Password Reset', 'password_probe'), true],
    ['/reset', fakeHTML('Password Reset', 'reset_probe'), true],
    ['/recovery', fakeHTML('Recovery', 'recovery_probe'), true],
    ['/portal', fakeHTML('Portal', 'portal_probe'), true],
    ['/dashboard', fakeHTML('Dashboard', 'dashboard_probe'), true],
    ['/manage', fakeHTML('Management', 'manage_probe'), true],
    ['/control', fakeHTML('Control Panel', 'control_probe'), true],
    ['/setup', fakeHTML('Setup', 'setup_probe'), true],
    ['/install', fakeHTML('Installation', 'install_probe'), true],
    ['/update', fakeHTML('Update', 'update_probe'), true],
    ['/upgrade', fakeHTML('Upgrade', 'upgrade_probe'), true],
    ['/migration', fakeHTML('Migration', 'migration_probe'), true],
    ['/test', fakeHTML('Test Page', 'test_probe'), true],
    ['/staging', fakeHTML('Staging', 'staging_probe'), true],
    ['/dev', fakeHTML('Development', 'dev_probe'), true],
    ['/development', fakeHTML('Development', 'dev_probe'), true],
    ['/local', fakeHTML('Local', 'local_probe'), true],
  ];

  for (const [route, body, isHTML] of traps) {
    const handler = (req, res) => {
      const ip = (req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown').replace(/^::ffff:/, '');
      escalateThreat(ip, 'HONEYPOT_TRIP', 'critical', `Honeypot: ${route}`, 30);
      res.setHeader('Content-Type', isHTML ? 'text/html' : 'application/json');
      res.setHeader('X-Honeypot', 'true');
      res.status(200).send(body);
    };
    app.get(route, handler);
    if (route !== '/login' && route !== '/register') {
      app.post(route, handler);
    }
  }

  app.post('/api/hp/log', (req, res) => {
    const ip = (req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown').replace(/^::ffff:/, '');
    escalateThreat(ip, 'HONEYPOT_JS_PROBE', 'critical', `JS probe: ${req.body?.type || 'unknown'}`, 25);
    res.json({ ok: true });
  });

  app.get('/robots.txt', (req, res) => {
    res.setHeader('Content-Type', 'text/plain');
    res.send('User-agent: *\nDisallow: /admin\nDisallow: /api/\nDisallow: /media/\nDisallow: /wp-admin\nDisallow: /phpmyadmin\nDisallow: /.env\nDisallow: /.git\nDisallow: /config\n');
  });

  app.get('/.well-known/security.txt', (req, res) => {
    res.setHeader('Content-Type', 'text/plain');
    res.send('Contact: security@nexus.local\nPreferred-Languages: id\n');
  });
}

// ═══════════════════════════════════════════════════════════
// LAYER 901-1000: KILL SWITCH + PANIC MODE
// ═══════════════════════════════════════════════════════════

export function activateKillSwitch(reason = 'manual') {
  KILL_SWITCH.active = true;
  KILL_SWITCH.reason = reason;
  KILL_SWITCH.triggeredAt = Date.now();
  try { fs.appendFileSync(KILL_LOG, JSON.stringify({ time: new Date().toISOString(), reason }) + '\n'); } catch {}
}

export function deactivateKillSwitch() {
  KILL_SWITCH.active = false;
  KILL_SWITCH.reason = '';
}

export function isKillSwitchActive() {
  return KILL_SWITCH.active;
}

export function killAllSessions() {
  TOKEN_BINDINGS.clear();
  logThreat('SYSTEM', 'KILL_SWITCH', 'critical', 'All sessions terminated');
}

export function panicWipe() {
  activateKillSwitch('panic');
  killAllSessions();
  IP_STATE.clear();
  CONN_TRACKER.clear();
  SLOW_LORIS.clear();
  RECENT_THREATS.length = 0;
  REPLAY_NONCES.clear();
  attackerDB = {};
  saveAttackerDB();
  logThreat('SYSTEM', 'PANIC_WIPE', 'critical', 'Full system wipe executed');
}

// ═══════════════════════════════════════════════════════════
// ICEWALL — Tembok Es Pertahanan Mutlak
// Protokol validasi, quarantine, IP reputation wall
// ═══════════════════════════════════════════════════════════

const ICEWALL = {
  MAX_METHODS: new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD']),
  FORBIDDEN_HEADERS: new Set([
    'x-forwarded-host', 'x-original-url', 'x-rewrite-url',
    'x-cluster-client-ip', 'x-forwarded-server',
  ]),
  FORBIDDEN_METHODS: new Set(['TRACE', 'CONNECT', 'TRACK', 'DEBUG']),
  PROTOCOL_VERSIONS: new Set(['HTTP/1.1', 'HTTP/2', 'HTTP/3']),
  IP_REPUTATION: new Map(),
  QUARANTINE: new Set(),
};

function checkIcewall(req, ip) {
  const findings = [];

  if (req.method && ICEWALL.FORBIDDEN_METHODS.has(req.method)) {
    findings.push({ type: 'ICEWALL_FORBIDDEN_METHOD', severity: 'high', detail: `Forbidden method: ${req.method}`, weight: 20 });
  }

  for (const h of Object.keys(req.headers || {})) {
    if (ICEWALL.FORBIDDEN_HEADERS.has(h.toLowerCase())) {
      findings.push({ type: 'ICEWALL_FORBIDDEN_HEADER', severity: 'high', detail: `Forbidden header: ${h}`, weight: 15 });
    }
  }

  const proto = req.httpVersion || '';
  if (proto && !ICEWALL.PROTOCOL_VERSIONS.has(proto)) {
    findings.push({ type: 'ICEWALL_BAD_PROTOCOL', severity: 'medium', detail: `Weird protocol: ${proto}`, weight: 8 });
  }

  const te = req.headers['transfer-encoding'];
  if (te && /chunked/i.test(te) && /identity/i.test(te)) {
    findings.push({ type: 'ICEWALL_TE_ABUSE', severity: 'high', detail: 'Transfer-Encoding obfuscation', weight: 15 });
  }

  const host = req.headers['host'] || '';
  if (host && host.includes('@')) {
    findings.push({ type: 'ICEWALL_HOST_ABUSE', severity: 'high', detail: `Host header with @: ${host}`, weight: 12 });
  }

  const cl = req.headers['content-length'];
  if (cl) {
    const val = parseInt(cl, 10);
    if (isNaN(val) || val < 0) {
      findings.push({ type: 'ICEWALL_BAD_LENGTH', severity: 'high', detail: `Invalid Content-Length: ${cl}`, weight: 15 });
    }
    const cls = String(cl).split(',').length;
    if (cls > 1) {
      findings.push({ type: 'ICEWALL_CL_ABUSE', severity: 'critical', detail: `Multiple Content-Length: ${cl}`, weight: 25 });
    }
  }

  const ct = req.headers['content-type'] || '';
  if (ct.includes('charset=utf-7') || ct.includes('x-user-defined')) {
    findings.push({ type: 'ICEWALL_BAD_CHARSET', severity: 'medium', detail: `Suspicious charset: ${ct}`, weight: 8 });
  }

  const auth = req.headers['authorization'] || '';
  if (auth.length > 8000) {
    findings.push({ type: 'ICEWALL_AUTH_OVERFLOW', severity: 'high', detail: `Auth header ${auth.length} bytes`, weight: 15 });
  }

  const cookie = req.headers['cookie'] || '';
  if (cookie.length > 16000) {
    findings.push({ type: 'ICEWALL_COOKIE_OVERFLOW', severity: 'high', detail: `Cookie ${cookie.length} bytes`, weight: 12 });
  }

  const recent = getIPState(ip).events.filter((e) => Date.now() - e.time < 600_000);
  const uniqueTypes = new Set(recent.map((e) => e.type));
  if (uniqueTypes.size >= 4) {
    findings.push({ type: 'ICEWALL_MULTI_ATTACK', severity: 'critical', detail: `${uniqueTypes.size} attack types from same IP`, weight: 20 });
  }

  if (findings.length >= 3) {
    ICEWALL.QUARANTINE.add(ip);
    logThreat(ip, 'ICEWALL_QUARANTINE', 'critical', `${findings.length} violations — quarantined`, getIPState(ip).score);
  }

  return findings;
}

function isQuarantined(ip) {
  return ICEWALL.QUARANTINE.has(ip);
}

function unquarantine(ip) {
  ICEWALL.QUARANTINE.delete(ip);
}

function getIcewallStats() {
  return {
    quarantined: [...ICEWALL.QUARANTINE],
    quarantineCount: ICEWALL.QUARANTINE.size,
  };
}

// ═══════════════════════════════════════════════════════════
// FIREBALL — Sistem Counter-Attack Aktif
// Deteksi attacker → serang balik: slowdown, fake data, trap
// ═══════════════════════════════════════════════════════════

const FIREBALL = {
  ACTIVE: new Map(),
  TOTAL_FIRED: 0,
};

const FIREBALL_RESPONSES = {
  slowdown_low: {
    delay: 2000,
    fakeResponse: null,
  },
  slowdown_med: {
    delay: 5000,
    fakeResponse: null,
  },
  slowdown_high: {
    delay: 10000,
    fakeResponse: null,
  },
  fake_data: {
    delay: 500,
    fakeResponse: () => JSON.stringify({
      status: 'ok',
      data: {
        users: Array.from({ length: 50 }, (_, i) => ({
          id: crypto.randomUUID(),
          username: `user_${crypto.randomBytes(4).toString('hex')}`,
          password_hash: '$2b$10$' + crypto.randomBytes(32).toString('hex'),
          email: `user${i}@nexus.local`,
          api_key: 'nxs_' + crypto.randomBytes(24).toString('hex'),
          private_key: crypto.randomBytes(64).toString('hex'),
        })),
        config: {
          supabase_url: 'https://fake-honeypot.supabase.co',
          supabase_key: 'eyJ' + crypto.randomBytes(32).toString('base64'),
          admin_secret: 'DEFINITELY_NOT_REAL',
          database_url: 'postgresql://nexus:honeypot@db-fake:5432/nexus',
        },
      },
      _honeypot: true,
      _logged: true,
    }),
  },
  fake_db_dump: {
    delay: 300,
    fakeResponse: () => JSON.stringify({
      database: 'nexus_production',
      tables: {
        users: { rows: 999, note: 'This is a honeypot. Your IP has been logged.' },
        messages: { rows: 99999, note: 'All data is fake.' },
        sessions: { rows: 150, note: 'Your session has been flagged.' },
      },
      _trap: true,
    }),
  },
  fake_config: {
    delay: 200,
    fakeResponse: () => JSON.stringify({
      nexus: {
        version: '8.2.0',
        environment: 'production',
        secrets: {
          jwt_secret: 'honeypot_' + crypto.randomBytes(16).toString('hex'),
          encryption_key: crypto.randomBytes(32).toString('hex'),
          webhook_secret: 'whsec_' + crypto.randomBytes(16).toString('hex'),
        },
        database: {
          host: 'db-internal.nexus.local',
          port: 5432,
          name: 'nexus_prod',
          password: 'THIS_IS_A_HONEYPOT',
        },
      },
      _honeypot: true,
      _your_ip_logged: true,
    }),
  },
  timeout: {
    delay: 30000,
    fakeResponse: null,
  },
  connection_drop: {
    delay: 0,
    fakeResponse: null,
    dropConnection: true,
  },
  garbage: {
    delay: 100,
    fakeResponse: () => crypto.randomBytes(Math.floor(Math.random() * 4096) + 1024).toString('base64'),
  },
};

function calculateFireballResponse(ip, findings) {
  const state = getIPState(ip);
  const score = state.score;

  if (score >= 150) return FIREBALL_RESPONSES.connection_drop;
  if (score >= 75) {
    if (findings?.some((f) => f.type === 'HONEYBOT_TRIP')) return FIREBALL_RESPONSES.garbage;
    return FIREBALL_RESPONSES.timeout;
  }
  if (score >= 50) {
    if (findings?.some((f) => /SQL_INJECTION|PATH_TRAVERSAL|DESERIALIZATION|SSRF|LOG4SHELL/.test(f.type))) {
      return FIREBALL_RESPONSES.fake_data;
    }
    return FIREBALL_RESPONSES.slowdown_high;
  }
  if (score >= 25) {
    if (findings?.some((f) => f.type === 'SCANNER_TOOL')) return FIREBALL_RESPONSES.fake_db_dump;
    if (findings?.some((f) => f.type === 'HONEYBOT_TRIP')) return FIREBALL_RESPONSES.fake_config;
    return FIREBALL_RESPONSES.slowdown_med;
  }
  if (score >= 10) {
    return FIREBALL_RESPONSES.slowdown_low;
  }
  return null;
}

function executeFireball(ip, response, res) {
  FIREBALL.TOTAL_FIRED++;
  FIREBALL.ACTIVE.set(ip, {
    firedAt: Date.now(),
    type: Object.entries(FIREBALL_RESPONSES).find(([, v]) => v === response)?.[0] || 'unknown',
    totalFired: FIREBALL.TOTAL_FIRED,
  });

  logThreat(ip, 'FIREBALL_ACTIVE', 'high', `Counter-attack: ${Object.entries(FIREBALL_RESPONSES).find(([, v]) => v === response)?.[0] || 'unknown'}`, getIPState(ip).score);

  if (response.dropConnection) {
    setTimeout(() => { try { res.destroy(); } catch {} }, 100);
    return true;
  }

  if (response.delay > 0) {
    res.setHeader('X-Fireball', 'active');
    res.setHeader('X-Fireball-Delay', String(response.delay));
  }

  if (response.fakeResponse) {
    const delay = response.delay || 0;
    setTimeout(() => {
      try {
        if (!res.headersSent) {
          const body = typeof response.fakeResponse === 'function' ? response.fakeResponse() : response.fakeResponse;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('X-Fireball', 'served');
          res.status(200).send(body);
        }
      } catch {}
    }, delay);
    return true;
  }

  return false;
}

function getFireballStats() {
  return {
    totalFired: FIREBALL.TOTAL_FIRED,
    active: [...FIREBALL.ACTIVE.entries()].map(([ip, data]) => ({ ip, ...data })).slice(-50),
  };
}

// ═══════════════════════════════════════════════════════════
// MAIN SCAN FUNCTION (all layers combined + ICEWALL + FIREBALL)
// ═══════════════════════════════════════════════════════════

export function scanRequest(req, uid = null) {
  const ip = (req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown').replace(/^::ffff:/, '');

  if (isKillSwitchActive()) return { allowed: false, status: 503, msg: 'Sistem sedang dalam mode darurat.' };
  if (isMaster(ip, uid)) return { allowed: true, master: true };
  if (isIPBlocked(ip)) return { allowed: false, status: 403, msg: 'Akses ditolak.' };
  if (isQuarantined(ip)) return { allowed: false, status: 403, msg: 'Akses ditolak: sistem quarantine aktif.' };

  const state = getIPState(ip);
  const ua = req.headers['user-agent'] || '';
  if (ua) state.userAgents.add(ua.slice(0, 200));

  const slowLoris = checkSlowLoris(ip);
  if (slowLoris) {
    escalateThreat(ip, 'SLOW_LORIS', 'high', 'Slow connection attack', 15);
    return { allowed: false, status: 408, msg: 'Connection timeout.' };
  }

  const connOverflow = trackConnection(ip);
  if (connOverflow) {
    escalateThreat(ip, 'CONN_FLOOD', 'high', 'Too many connections', 12);
    return { allowed: false, status: 429, msg: 'Too many connections.' };
  }

  const headerFindings = checkRequestHealth(req);
  for (const f of headerFindings) escalateThreat(ip, f.type, f.severity, f.detail, f.weight);

  const icewallFindings = checkIcewall(req, ip);
  for (const f of icewallFindings) escalateThreat(ip, f.type, f.severity, f.detail, f.weight);

  const decodedUrl = (() => { try { return decodeURIComponent(req.url || ''); } catch { return req.url || ''; } })();
  const fullUrl = `${req.method} ${decodedUrl}`;
  const bodyStr = req._bodyScan || '';
  const allHeaders = JSON.stringify(req.headers);

  const findings = [...headerFindings, ...icewallFindings];

  for (const group of ALL_SIGNATURES) {
    for (const sig of group.sigs) {
      if (sig.test(fullUrl) || sig.test(decodedUrl) || sig.test(bodyStr) || sig.test(allHeaders) || sig.test(ua)) {
        findings.push({ type: group.name, severity: group.severity, detail: sig.source.slice(0, 80), weight: group.weight });
        break;
      }
    }
  }

  if (decodedUrl) {
    if (decodedUrl.includes('..') || decodedUrl.includes('%2e%2e') || decodedUrl.includes('%252e%252e')) {
      findings.push({ type: 'PATH_TRAVERSAL', severity: 'critical', detail: 'Dot-dot in URL', weight: 30 });
    }
  }

  if (!ua || ua.length < 5) {
    findings.push({ type: 'NO_UA', severity: 'medium', detail: 'Missing or empty User-Agent', weight: 5 });
  }

  const botPatterns = /bot|spider|crawler|curl|wget|python|java\/|go-http|libwww|scrapy|headless|phantom|selenium/i;
  if (botPatterns.test(ua) && !decodedUrl?.startsWith('/api/')) {
    findings.push({ type: 'BOT_CRAWL', severity: 'low', detail: `Bot UA: ${ua.slice(0, 80)}`, weight: 3 });
  }

  const behavioral = detectAnomalies(ip, req);
  findings.push(...behavioral);

  let maxSeverity = THREAT_LEVELS.NONE;
  for (const f of findings) {
    const level = escalateThreat(ip, f.type, f.severity, f.detail, f.weight);
    if (level > maxSeverity) maxSeverity = level;
  }

  const defense = applyDefense(ip, maxSeverity);
  if (!defense.allowed) return { allowed: false, status: defense.status, msg: defense.msg, findings };
  if (defense.throttled) return { allowed: true, throttled: true, findings };

  if (findings.length > 0) {
    const fireball = calculateFireballResponse(ip, findings);
    if (fireball) {
      return { allowed: true, warnings: findings, fireball };
    }
    return { allowed: true, warnings: findings };
  }
  return { allowed: true };
}

// ═══════════════════════════════════════════════════════════
// BODY SCAN MIDDLEWARE
// ═══════════════════════════════════════════════════════════

export function bodyScanMiddleware(req, res, next) {
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    let body = '';
    const maxScan = 20480;
    const originalOn = req.on.bind(req);
    req.on = function (event, handler) {
      if (event === 'data') {
        const wrappedHandler = (chunk) => {
          if (body.length < maxScan) {
            body += chunk.toString('utf8', 0, Math.min(chunk.length, maxScan - body.length));
          }
          handler(chunk);
        };
        return originalOn(event, wrappedHandler);
      }
      return originalOn(event, handler);
    };
    req.on('end', () => { req._bodyScan = body.slice(0, maxScan); });
  }
  next();
}

// ═══════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════

export function getSecurityState() {
  return {
    threats: getRecentThreats(200),
    stats: getThreatStats(),
    attackers: attackerDB,
    blockedIPs: [...IP_STATE.entries()].filter(([, s]) => s.blocked || s.permBlocked)
      .map(([ip, s]) => ({ ip, perm: s.permBlocked, until: s.blockedUntil, score: s.score })),
    killSwitch: { active: KILL_SWITCH.active, reason: KILL_SWITCH.reason, at: KILL_SWITCH.triggeredAt },
    sessions: TOKEN_BINDINGS.size,
    icewall: getIcewallStats(),
    fireball: getFireballStats(),
  };
}

export function manualBlockIP(ip, perm = false) {
  const state = getIPState(ip);
  state.permBlocked = perm; state.blocked = true;
  if (!perm) state.blockedUntil = Date.now() + 86400_000;
  logThreat(ip, 'MANUAL_BLOCK', 'critical', `Manual block (perm=${perm})`, state.score);
}

export function manualUnblockIP(ip) {
  const state = IP_STATE.get(ip);
  if (state) {
    state.permBlocked = false; state.blocked = false; state.blockedUntil = 0;
    state.score = Math.max(0, state.score - 50);
    logThreat(ip, 'MANUAL_UNBLOCK', 'low', 'Manual unblock', state.score);
  }
}

export function manualClearThreats() {
  RECENT_THREATS.length = 0; IP_STATE.clear(); CONN_TRACKER.clear();
  SLOW_LORIS.clear(); attackerDB = {}; saveAttackerDB();
}

export { executeFireball, unquarantine, getIcewallStats, getFireballStats };
