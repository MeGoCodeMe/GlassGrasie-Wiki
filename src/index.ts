import { Router } from 'itty-router';

const router = Router();

interface WikiEnv {
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_BRANCH: string;
  GITHUB_TOKEN: string;
  MASTER_PASSCODE: string;
  WIKI_TITLE: string;
  WIKI_DESCRIPTION: string;
  WIKI_KV: KVNamespace;
}

const USERS: Record<string, string> = {
  'gertjan@glassgrasie.com': 'xdefNbWnJsmchi0y'
};

const STYLES = {
  dark: { bg: '#0a0a0a', textPrimary: '#eeeeee', textSecondary: '#aaaaaa', textTertiary: '#cccccc', gold: '#c9a87c', goldHover: '#b8965c', cardBg: 'rgba(10,10,10,0.7)', inputBg: '#333333' },
  light: { bg: '#f5f5f5', textPrimary: '#1a1a1a', textSecondary: '#666666', textTertiary: '#999999', gold: '#b8965c', goldHover: '#9d7e4a', cardBg: '#ffffff', inputBg: '#f0f0f0' }
};

const STYLE = { fontFamily: "'Cormorant Garamond', Georgia, serif", ...STYLES.dark };

function parseMarkdown(md: string): string {
  let html = md.replace(/^### (.*?)$/gm, '<h3>$1</h3>').replace(/^## (.*?)$/gm, '<h2>$1</h2>').replace(/^# (.*?)$/gm, '<h1>$1</h1>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/__(.*?)__/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>').replace(/_(.*?)_/g, '<em>$1</em>').replace(/\`\`\`[\s\S]*?\`\`\`/g, (match) => '<pre><code>' + match.replace(/\`\`\`/g, '') + '</code></pre>').replace(/\`(.*?)\`/g, '<code>$1</code>').replace(/\[(.*?)\]\((.*?)\)/g, '<a href="/wiki?note=$2">$1</a>').replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br>');
  return '<p>' + html + '</p>';
}

async function getNoteMeta(filepath: string, env: WikiEnv): Promise<{ lastModified: string } | null> {
  const url = 'https://api.github.com/repos/' + env.GITHUB_OWNER + '/' + env.GITHUB_REPO + '/commits?path=' + encodeURIComponent(filepath) + '&per_page=1';
  try {
    const res = await fetch(url, { headers: { 'Authorization': 'token ' + env.GITHUB_TOKEN, 'Accept': 'application/vnd.github+json' } });
    if (res.ok) {
      const data: any[] = await res.json();
      if (data.length > 0) {
        const date = new Date(data[0].commit.committer.date);
        return { lastModified: date.toLocaleDateString('nl-NL', { year: 'numeric', month: 'long', day: 'numeric' }) };
      }
    }
    return null;
  } catch (e) {
    return null;
  }
}

function generateInviteToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(12))).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function listContentFolder(folder: string, env: WikiEnv): Promise<{ folders: string[], files: { name: string, path: string, type: string }[], debugError?: string } | null> {
  const url = 'https://api.github.com/repos/' + env.GITHUB_OWNER + '/' + env.GITHUB_REPO + '/contents' + (folder ? '/' + encodeURIComponent(folder) : '') + '?ref=' + env.GITHUB_BRANCH;
  console.log('[listContentFolder] folder:', folder, 'url:', url);
  try {
    console.log('[listContentFolder] Fetching URL:', url);
    const res = await fetch(url, {
      headers: {
        'Authorization': 'token ' + env.GITHUB_TOKEN,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'GlassGrasie-Wiki/1.0'
      }
    });
    console.log('[listContentFolder] Response status:', res.status, res.statusText);
    console.log('[listContentFolder] Response headers:', {
      contentType: res.headers.get('content-type'),
      xRateLimit: res.headers.get('x-ratelimit-remaining'),
      xRateLimitReset: res.headers.get('x-ratelimit-reset')
    });
    if (res.ok) {
      const data: any[] = await res.json();
      console.log('[listContentFolder] Successfully parsed JSON, items count:', data.length);
      const folders: string[] = [];
      const files: { name: string, path: string, type: string }[] = [];
      for (const item of data) {
        if (item.type === 'dir' && !item.name.startsWith('.')) {
          folders.push(item.name);
        } else if (item.type === 'file' && (item.name.endsWith('.md') || item.name.endsWith('.html') || item.name.endsWith('.pptx') || item.name.endsWith('.docx') || item.name.endsWith('.svg'))) {
          files.push({ name: item.name, path: item.path, type: item.name.split('.').pop() || '' });
        }
      }
      console.log('[listContentFolder] Parsed result - folders:', folders.length, 'files:', files.length);
      return { folders: folders.sort(), files: files.sort((a, b) => a.name.localeCompare(b.name)) };
    } else {
      const errorBody = await res.text();
      console.error('[listContentFolder] Request failed with status', res.status);
      console.error('[listContentFolder] Response body:', errorBody);
      return { folders: [], files: [], debugError: 'GitHub API returned ' + res.status + ': ' + errorBody.substring(0, 200) };
    }
  } catch (e) {
    console.error('[listContentFolder] Exception caught:', e instanceof Error ? e.message : String(e));
    if (e instanceof Error) console.error('[listContentFolder] Stack:', e.stack);
    return { folders: [], files: [], debugError: 'Exception: ' + (e instanceof Error ? e.message : String(e)) };
  }
}

async function buildSidebar(env: WikiEnv): Promise<string> {
  const content = await listContentFolder('', env);
  if (!content) return '';
  const folders = content.folders.filter(f => f.match(/^\d+-/) || f === 'Assets');
  const items = folders.map(folder => {
    const displayName = folder.replace(/^\d+-/, '');
    return '<li><a href="/wiki?folder=' + encodeURIComponent(folder) + '"><span class="toggle">▸</span> ' + displayName + '</a></li>';
  }).join('');
  return '<ul class="sidebar-nav">' + items + '</ul>';
}

router.get('/', () => {
  const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Glass⏧Grasie</title><style>@import url("https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600&display=swap");*{margin:0;padding:0}body{background:' + STYLE.bg + ';font-family:' + STYLE.fontFamily + ';display:flex;justify-content:center;align-items:center;min-height:100vh;color:' + STYLE.textPrimary + ';padding:60px 20px}.landing{text-align:center;max-width:800px}.logo{font-size:64px;font-weight:300;letter-spacing:2px;margin-bottom:35px}.divider{width:320px;height:1px;background:linear-gradient(to right, transparent, ' + STYLE.gold + ', transparent);margin:0 auto 35px}.tagline{font-size:20px;font-style:italic;color:' + STYLE.gold + ';margin-bottom:45px}.contact{font-size:13px;letter-spacing:1px;color:' + STYLE.textSecondary + ';margin-bottom:50px}.contact a{color:' + STYLE.textSecondary + ';text-decoration:none}.contact a:hover{color:' + STYLE.gold + '}.description{font-size:14px;font-style:italic;color:' + STYLE.textSecondary + '}.footer{margin-top:60px;padding-top:30px;border-top:1px solid rgba(212,175,55,0.1);font-size:12px}.footer a{color:' + STYLE.gold + ';text-decoration:none}</style></head><body><div class="landing"><div class="logo">Glass⏧Grasie</div><div class="divider"></div><div class="tagline">Premium Float Glass Art & Design</div><div class="contact"><a href="https://glassgrasie.com">glassgrasie.com</a> · <a href="mailto:alchemy@glassgrasie.com">alchemy@glassgrasie.com</a> · Rotterdam</div><div class="description">Hier erkennen we dat Grasie gewoon Grasie is.</div><div class="footer"><a href="/login">Private Wiki</a></div></div></body></html>';
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
});

router.get('/login', () => {
  const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Glass⏧Grasie Wiki</title><style>@import url("https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600&display=swap");*{margin:0;padding:0}body{background:' + STYLE.bg + ';font-family:' + STYLE.fontFamily + ';display:flex;justify-content:center;align-items:center;height:100vh;color:' + STYLE.textPrimary + '}.login{text-align:center;max-width:600px;padding:40px 20px}.logo{font-size:56px;font-weight:300;letter-spacing:2px;margin-bottom:30px}.divider{width:250px;height:1px;background:linear-gradient(to right, transparent, ' + STYLE.gold + ', transparent);margin:0 auto 30px}.tagline{font-size:18px;font-style:italic;color:' + STYLE.gold + '}.form-group{margin-bottom:20px}input[type="email"],input[type="password"]{width:100%;max-width:400px;padding:14px 16px;border:1px solid rgba(201,168,124,0.2);background:' + STYLE.inputBg + ';color:' + STYLE.textPrimary + ';font-size:13px;border-radius:0;margin-bottom:12px}input:focus{outline:none;border-color:' + STYLE.gold + '}button{width:100%;max-width:400px;padding:14px 16px;background:transparent;color:' + STYLE.gold + ';border:1px solid ' + STYLE.gold + ';font-size:11px;font-weight:600;letter-spacing:3px;cursor:pointer;text-transform:uppercase}.error{color:#ff6b6b;font-size:12px;margin-top:10px}</style></head><body><div class="login"><div class="logo">Glass⏧Grasie</div><div class="divider"></div><div class="tagline">Premium Float Glass Art & Design</div><form method="POST" action="/auth"><div class="form-group"><input type="email" name="email" placeholder="Email" required autofocus></div><div class="form-group"><input type="password" name="password" placeholder="Password" required></div><button type="submit">Enter</button></form><div id="errorMsg" class="error"></div><div style="margin-top:30px;padding-top:30px;border-top:1px solid rgba(201,168,124,0.1)"><p style="font-size:12px;color:' + STYLE.textSecondary + ';margin-bottom:15px">Or use master passcode</p><form method="POST" action="/auth"><div class="form-group"><input type="password" name="passcode" placeholder="Passcode"></div><button type="submit">Enter</button></form></div></div><script>const params=new URLSearchParams(window.location.search);if(params.get("error")==="invalid"){document.getElementById("errorMsg").textContent="Invalid email or password"}</script></body></html>';
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
});

router.post('/auth', async (req: Request, env: WikiEnv) => {
  const data = await req.formData();
  const email = data.get('email')?.toString() || '';
  const password = data.get('password')?.toString() || '';
  const passcode = data.get('passcode')?.toString() || '';

  let authenticated = false;
  let userType = '';

  if (passcode && passcode === env.MASTER_PASSCODE) {
    authenticated = true;
    userType = 'admin';
  } else if (email && password && USERS[email] && USERS[email] === password) {
    authenticated = true;
    userType = 'user';
  }

  if (authenticated) {
    console.log('[AUTH] Login:', email || 'passcode', 'userType:', userType);
    const token = generateInviteToken();
    const res = new Response('Redirecting...', { status: 302, headers: { 'Location': '/wiki?token=' + token } });
    res.headers.set('Set-Cookie', 'token=' + token + '; Path=/; HttpOnly; Max-Age=2592000; SameSite=Strict');
    res.headers.set('Set-Cookie', 'userType=' + userType + '; Path=/; Max-Age=2592000; SameSite=Strict');
    res.headers.set('Set-Cookie', 'theme=dark; Path=/; Max-Age=31536000; SameSite=Strict');
    await env.WIKI_KV.put('token:' + token, userType, { expirationTtl: 2592000 });
    return res;
  }

  return new Response('Redirecting...', { status: 302, headers: { 'Location': '/login?error=invalid' } });
});

router.post('/admin/invite', async (req: Request, env: WikiEnv) => {
  const cookieToken = req.headers.get('Cookie')?.match(/token=([^;]+)/)?.[1];
  const userType = await env.WIKI_KV.get('token:' + (cookieToken || ''));
  if (userType !== 'admin') return new Response('Unauthorized', { status: 401 });

  const inviteToken = generateInviteToken();
  await env.WIKI_KV.put('token:' + inviteToken, 'user', { expirationTtl: 2592000 });
  const inviteUrl = 'https://revamped.glassgrasie.com/wiki?token=' + inviteToken;
  return new Response(JSON.stringify({ inviteUrl, token: inviteToken }), { headers: { 'Content-Type': 'application/json' } });
});

function isAuthed(req: Request): boolean {
  const token = new URL(req.url).searchParams.get('token');
  const cookieToken = req.headers.get('Cookie')?.match(/token=([^;]+)/)?.[1];
  return !!(token || cookieToken);
}

async function fetchFileFromGitHub(filepath: string, env: WikiEnv): Promise<any> {
  const url = 'https://raw.githubusercontent.com/' + env.GITHUB_OWNER + '/' + env.GITHUB_REPO + '/' + env.GITHUB_BRANCH + '/' + encodeURIComponent(filepath);
  try {
    const res = await fetch(url, { headers: { 'Authorization': 'token ' + env.GITHUB_TOKEN, 'Accept': 'application/vnd.github+json' } });
    if (res.ok) return filepath.endsWith('.md') || filepath.endsWith('.html') ? await res.text() : await res.arrayBuffer();
    return null;
  } catch (e) {
    return null;
  }
}

function getMimeType(filename: string): string {
  if (filename.endsWith('.pptx')) return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  if (filename.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (filename.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filename.endsWith('.md')) return 'text/markdown; charset=utf-8';
  if (filename.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

router.get('/file', async (req: Request, env: WikiEnv) => {
  if (!isAuthed(req)) return new Response('Unauthorized', { status: 401 });

  const filepath = new URL(req.url).searchParams.get('path');
  if (!filepath) return new Response('File not found', { status: 404 });

  const data = await fetchFileFromGitHub('content/' + filepath, env);
  if (!data) return new Response('File not found', { status: 404 });

  const filename = filepath.split('/').pop() || '';
  if (typeof data === 'string') {
    return new Response(data, { headers: { 'Content-Type': getMimeType(filename) } });
  } else {
    return new Response(data, { headers: { 'Content-Type': getMimeType(filename), 'Content-Disposition': 'inline; filename="' + filename + '"' } });
  }
});

router.get('/wiki', async (req: Request, env: WikiEnv) => {
  if (!isAuthed(req)) return new Response('Redirecting...', { status: 302, headers: { 'Location': '/login' } });

  const token = new URL(req.url).searchParams.get('token');
  if (token) {
    const res = new Response('', { status: 302, headers: { 'Location': '/wiki' } });
    const userType = await env.WIKI_KV.get('token:' + token) || 'user';
    res.headers.set('Set-Cookie', 'token=' + token + '; Path=/; HttpOnly; Max-Age=2592000; SameSite=Strict');
    res.headers.set('Set-Cookie', 'userType=' + userType + '; Path=/; Max-Age=2592000; SameSite=Strict');
    res.headers.set('Set-Cookie', 'theme=dark; Path=/; Max-Age=31536000; SameSite=Strict');
    return res;
  }

  const notePath = new URL(req.url).searchParams.get('note');
  const folder = new URL(req.url).searchParams.get('folder') || '';
  const cookieToken = req.headers.get('Cookie')?.match(/token=([^;]+)/)?.[1];
  const theme = req.headers.get('Cookie')?.match(/theme=([^;]+)/)?.[1] || 'dark';
  const userType = await env.WIKI_KV.get('token:' + (cookieToken || '')) || 'user';
  const CURRENT_STYLE = { ...STYLE, ...STYLES[theme as keyof typeof STYLES] };

  const sidebar = await buildSidebar(env);

  if (notePath) {
    const content = await fetchFileFromGitHub('content/' + notePath, env);
    if (!content || typeof content !== 'string') {
      return new Response('Note not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }

    const meta = await getNoteMeta('content/' + notePath, env);
    const displayName = notePath.split('/').pop()?.replace('.md', '').replace(/-/g, ' ') || '';
    const parsedHtml = parseMarkdown(content);
    const parentFolder = notePath.substring(0, notePath.lastIndexOf('/'));

    const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + displayName + '</title><style>@import url("https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600&display=swap");*{margin:0;padding:0;box-sizing:border-box}body{background:' + CURRENT_STYLE.bg + ';font-family:' + CURRENT_STYLE.fontFamily + ';color:' + CURRENT_STYLE.textPrimary + ';display:flex;min-height:100vh}.sidebar{width:240px;background:rgba(0,0,0,0.3);border-right:1px solid rgba(201,168,124,0.1);padding:20px 0;position:fixed;left:0;top:0;height:100vh;overflow-y:auto;z-index:1000}@media(max-width:768px){.sidebar{width:180px}}.sidebar-nav{list-style:none;padding:0;margin:0}.sidebar-nav li{margin:0}.sidebar-nav a{display:block;padding:10px 15px;color:' + CURRENT_STYLE.textSecondary + ';text-decoration:none;font-size:13px;border-left:2px solid transparent;transition:all 0.2s}.sidebar-nav a:hover{color:' + CURRENT_STYLE.gold + ';border-left-color:' + CURRENT_STYLE.gold + '}.toggle{color:' + CURRENT_STYLE.textSecondary + ';font-size:10px;display:inline-block;margin-right:5px}.main{margin-left:240px;padding:40px 20px;flex:1;width:calc(100% - 240px)}@media(max-width:768px){.main{margin-left:180px;width:calc(100% - 180px);padding:20px}}.container{max-width:900px}.header{margin-bottom:30px;display:flex;justify-content:space-between;align-items:flex-start}.back{color:' + CURRENT_STYLE.textSecondary + ';text-decoration:none;font-size:14px}.back:hover{color:' + CURRENT_STYLE.gold + '}h1{font-size:2em;margin:15px 0 5px 0;color:' + CURRENT_STYLE.textPrimary + ';border-bottom:2px solid ' + CURRENT_STYLE.gold + ';padding-bottom:10px;font-weight:400}.meta{color:' + CURRENT_STYLE.textSecondary + ';font-size:13px}.theme-toggle{background:transparent;border:1px solid ' + CURRENT_STYLE.gold + ';color:' + CURRENT_STYLE.gold + ';padding:8px 12px;cursor:pointer;font-size:12px;border-radius:0}.theme-toggle:hover{background:rgba(201,168,124,0.1)}.content{background:' + CURRENT_STYLE.cardBg + ';padding:30px;border:1px solid rgba(201,168,124,0.15);margin-top:20px}a{color:' + CURRENT_STYLE.gold + ';text-decoration:none}a:hover{color:' + CURRENT_STYLE.goldHover + '}</style><script>function toggleTheme(){const newTheme=document.cookie.includes("theme=light")?"dark":"light";document.cookie="theme="+newTheme+"; path=/; max-age=31536000";location.reload()}</script></head><body><div class="sidebar">' + sidebar + '</div><div class="main"><div class="container"><div class="header"><a href="/wiki?folder=' + encodeURIComponent(parentFolder) + '" class="back">&larr; Back</a><button class="theme-toggle" onclick="toggleTheme()">🌙</button></div><h1>' + displayName + '</h1>' + (meta ? '<div class="meta">Last modified: ' + meta.lastModified + '</div>' : '') + '<div class="content">' + parsedHtml + '</div></div></div></body></html>';

    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  const content = await listContentFolder(folder, env);
  if (!content || (content.debugError && content.folders.length === 0)) return new Response('Folder not found - ' + (content?.debugError || 'unknown error'), { status: 404 });

  const folderDisplay = folder ? folder.split('/').pop()?.replace(/^\d+-/, '') : 'Root';
  const fileLinks = content.files.map(f => {
    const filePath = folder ? folder + '/' + f.name : f.name;
    const icon = f.type === 'md' ? '📄' : f.type === 'html' ? '🌐' : f.type === 'pptx' ? '📊' : f.type === 'docx' ? '📝' : f.type === 'svg' ? '🎨' : '📦';
    return '<li>' + icon + ' <a href="/file?path=' + encodeURIComponent(filePath) + '" target="_blank">' + f.name + '</a></li>';
  }).join('');

  const adminLink = userType === 'admin' ? '<div style="margin:20px 0"><a href="/admin?action=invite" style="color:' + CURRENT_STYLE.gold + ';font-size:12px;text-decoration:none">+ Generate invite link</a></div>' : '';

  const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + folderDisplay + '</title><style>@import url("https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600&display=swap");*{margin:0;padding:0;box-sizing:border-box}body{background:' + CURRENT_STYLE.bg + ';font-family:' + CURRENT_STYLE.fontFamily + ';color:' + CURRENT_STYLE.textPrimary + ';display:flex;min-height:100vh}.sidebar{width:240px;background:rgba(0,0,0,0.3);border-right:1px solid rgba(201,168,124,0.1);padding:20px 0;position:fixed;left:0;top:0;height:100vh;overflow-y:auto;z-index:1000}@media(max-width:768px){.sidebar{width:180px}}.sidebar-nav{list-style:none;padding:0;margin:0}.sidebar-nav li{margin:0}.sidebar-nav a{display:block;padding:10px 15px;color:' + CURRENT_STYLE.textSecondary + ';text-decoration:none;font-size:13px;border-left:2px solid transparent;transition:all 0.2s}.sidebar-nav a:hover{color:' + CURRENT_STYLE.gold + ';border-left-color:' + CURRENT_STYLE.gold + '}.toggle{color:' + CURRENT_STYLE.textSecondary + ';font-size:10px;display:inline-block;margin-right:5px}.main{margin-left:240px;padding:40px 20px;flex:1;width:calc(100% - 240px)}@media(max-width:768px){.main{margin-left:180px;width:calc(100% - 180px);padding:20px}}.container{max-width:900px}.header{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}h1{color:' + CURRENT_STYLE.textPrimary + ';margin:0;font-weight:400}.theme-toggle{background:transparent;border:1px solid ' + CURRENT_STYLE.gold + ';color:' + CURRENT_STYLE.gold + ';padding:8px 12px;cursor:pointer;font-size:14px;border-radius:0}.theme-toggle:hover{background:rgba(201,168,124,0.1)}h2{color:' + CURRENT_STYLE.textPrimary + ';margin:20px 0 10px 0;font-weight:400}ul{list-style:none;padding:0;margin:20px 0}li{margin:10px 0}a{color:' + CURRENT_STYLE.gold + ';text-decoration:none}a:hover{color:' + CURRENT_STYLE.goldHover + '}</style><script>function toggleTheme(){const newTheme=document.cookie.includes("theme=light")?"dark":"light";document.cookie="theme="+newTheme+"; path=/; max-age=31536000";location.reload()}</script></head><body><div class="sidebar">' + sidebar + '</div><div class="main"><div class="container"><div class="header"><h1>' + env.WIKI_TITLE + '</h1><button class="theme-toggle" onclick="toggleTheme()">🌙</button></div><h2>' + folderDisplay + ' (' + content.files.length + ')</h2>' + (content.files.length > 0 ? '<ul>' + fileLinks + '</ul>' : '<p style="color:' + CURRENT_STYLE.textSecondary + '">No files found.</p>') + adminLink + '</div></div></body></html>';

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
});

router.get('/admin', async (req: Request, env: WikiEnv) => {
  if (!isAuthed(req)) return new Response('Redirecting...', { status: 302, headers: { 'Location': '/login' } });

  const cookieToken = req.headers.get('Cookie')?.match(/token=([^;]+)/)?.[1];
  const userType = await env.WIKI_KV.get('token:' + (cookieToken || '')) || 'user';
  
  if (userType !== 'admin') return new Response('Unauthorized', { status: 401 });

  const action = new URL(req.url).searchParams.get('action');
  if (action === 'invite') {
    const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Generate Invite</title><style>@import url("https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600&display:swap");*{margin:0;padding:0;box-sizing:border-box}body{background:#0a0a0a;font-family:' + STYLE.fontFamily + ';display:flex;justify-content:center;align-items:center;min-height:100vh;color:#eeeeee;padding:40px 20px}.container{text-align:center;max-width:600px}.logo{font-size:48px;font-weight:300;letter-spacing:2px;margin-bottom:20px}.divider{width:200px;height:1px;background:linear-gradient(to right, transparent, #c9a87c, transparent);margin:0 auto 25px}.tagline{font-size:16px;font-style:italic;color:#c9a87c;margin-bottom:40px}.box{background:rgba(10,10,10,0.7);padding:40px;border:1px solid rgba(201,168,124,0.2)}.box p{color:#cccccc;font-size:14px;margin-bottom:30px}button{width:100%;padding:14px 16px;background:transparent;color:#c9a87c;border:1px solid #c9a87c;font-size:11px;font-weight:600;letter-spacing:3px;cursor:pointer;text-transform:uppercase}#inviteUrl{width:100%;padding:12px 14px;border:1px solid rgba(201,168,124,0.3);background:rgba(255,255,255,0.02);color:#c9a87c;font-family:"Courier New",monospace;font-size:12px;margin:20px 0;text-align:center}.invite-section{margin-top:20px;display:none}.invite-section.show{display:block}.back{display:block;color:#aaaaaa;text-decoration:none;font-size:12px;margin-bottom:30px}</style></head><body><div class="container"><a href="/wiki" class="back">← Back</a><div class="logo">Glass⏧Grasie</div><div class="divider"></div><div class="tagline">Premium Float Glass Art & Design</div><div class="box"><p>Create a shareable invite link for others to access this wiki. The link is valid for 30 days.</p><button onclick="generateInvite()">Generate Invite</button><div id="inviteSection" class="invite-section"><input type="text" id="inviteUrl" readonly><button style="margin-top:10px" onclick="copyToClipboard()">Copy Link</button></div></div></div><script>async function generateInvite(){try{const response=await fetch("/admin/invite",{method:"POST"});const data=await response.json();document.getElementById("inviteUrl").value=data.inviteUrl;document.getElementById("inviteSection").classList.add("show")}catch(e){alert("Error: "+e.message)}}function copyToClipboard(){document.getElementById("inviteUrl").select();document.execCommand("copy");alert("Copied!")}</script></body></html>';
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  return new Response('Redirecting...', { status: 302, headers: { 'Location': '/wiki' } });
});

export default {
  fetch: (req: Request, env: WikiEnv) => router.handle(req, env),
};
