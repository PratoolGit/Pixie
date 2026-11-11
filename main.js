const { app, BrowserWindow, ipcMain, protocol, session, screen, shell, desktopCapturer, safeStorage, Menu, clipboard, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, execFile, spawn } = require('child_process');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
]);

const ROOT = path.join(__dirname, 'renderer');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.cjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.task': 'application/octet-stream' };
const ASSETS = path.join(__dirname, 'assets');

let main = null, island = null, islandActive = false;
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

// ---------- settings (API keys encrypted at rest when the OS supports it) ----------
function loadSettings() {
  try {
    const s = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    (s.providers || []).forEach(p => { if (p.apiKey && p.apiKey.startsWith('enc:')) {
      try { p.apiKey = safeStorage.decryptString(Buffer.from(p.apiKey.slice(4), 'base64')); } catch { p.apiKey = ''; } } });
    return s;
  } catch { return null; }
}
function saveSettings(s) {
  const copy = JSON.parse(JSON.stringify(s));
  (copy.providers || []).forEach(p => { if (p.apiKey && safeStorage.isEncryptionAvailable())
    p.apiKey = 'enc:' + safeStorage.encryptString(p.apiKey).toString('base64'); });
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(copy, null, 2));
}

// ---------- windows ----------
const webPrefs = { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false };

function createMain() {
  main = new BrowserWindow({ width: 920, height: 760, minWidth: 560, minHeight: 540, backgroundColor: '#ffe9f1', title: 'Pixie',
    icon: path.join(__dirname, 'build', 'icon.png'), autoHideMenuBar: true, show: false, webPreferences: webPrefs });
  main.loadURL('app://pixie/index.html?mode=main');
  main.once('ready-to-show', () => { main.show(); islandActive = false; });
  main.on('minimize', showIsland);
  main.on('restore', hideIsland);
  main.on('closed', () => app.quit());
}

function ensureIsland() {
  if (island) return;
  const b = screen.getPrimaryDisplay().bounds, W = 560, H = 200;
  island = new BrowserWindow({ width: W, height: H, x: Math.round(b.x + (b.width - W) / 2), y: b.y, transparent: true, frame: false,
    resizable: false, alwaysOnTop: true, skipTaskbar: true, hasShadow: false, show: false, webPreferences: webPrefs });
  island.setAlwaysOnTop(true, 'screen-saver');
  island.setIgnoreMouseEvents(true, { forward: true });
  island.loadURL('app://pixie/index.html?mode=island');
}
function broadcastActive() {
  if (main && !main.isDestroyed()) main.webContents.send('active', !islandActive);
  if (island && !island.isDestroyed()) island.webContents.send('active', islandActive);
}
function showIsland() { ensureIsland(); islandActive = true; island.showInactive(); broadcastActive(); }
function hideIsland() { islandActive = false; if (island) island.hide(); broadcastActive(); }

// ---------- app lifecycle ----------
const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();
app.on('second-instance', () => { if (main) { if (main.isMinimized()) main.restore(); main.focus(); } });

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  protocol.handle('app', async req => {
    const u = new URL(req.url);
    let p = decodeURIComponent(u.pathname); if (p === '/' || p === '') p = '/index.html';
    let base = ROOT, rel = p;
    if (p.startsWith('/assets/')) { base = ASSETS; rel = p.slice(7); }
    const file = path.normalize(path.join(base, rel));
    if (!file.startsWith(base)) return new Response('forbidden', { status: 403 });
    try {
      const buf = await fs.promises.readFile(file);
      return new Response(buf, { headers: { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' } });
    } catch { return new Response('not found', { status: 404 }); }
  });
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(['media', 'mediaKeySystem', 'clipboard-sanitized-write'].includes(perm)));
  createMain();
});
app.on('window-all-closed', () => app.quit());

// ---------- IPC ----------
ipcMain.handle('settings:get', () => loadSettings());
ipcMain.handle('settings:set', (e, s) => {
  saveSettings(s);
  BrowserWindow.getAllWindows().forEach(w => { if (w.webContents.id !== e.sender.id) w.webContents.send('settings:changed', s); });
  return true;
});
ipcMain.handle('state:active', e => (island && e.sender.id === island.webContents.id) ? islandActive : !islandActive);
ipcMain.on('island:ignore', (_e, ignore) => { if (island) island.setIgnoreMouseEvents(!!ignore, { forward: true }); });
ipcMain.on('window:restore', () => { if (main) { main.restore(); main.show(); main.focus(); } hideIsland(); });

// Network proxy so the renderer never hits CORS and API keys stay out of page JS fetches.
ipcMain.handle('net:fetch', async (_e, o) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), o.timeout || 15000);
  try {
    const headers = { ...(o.headers || {}) };
    let body;
    if (o.audioB64) {
      const fd = new FormData();
      fd.append('file', new Blob([Buffer.from(o.audioB64, 'base64')], { type: o.audioType || 'audio/webm' }), o.audioName || 'audio.webm');
      for (const [k, v] of Object.entries(o.fields || {})) fd.append(k, v);
      body = fd;
    } else if (o.json) { body = JSON.stringify(o.json); headers['Content-Type'] = 'application/json'; }
    const t0 = Date.now();
    const r = await fetch(o.url, { method: o.method || (body ? 'POST' : 'GET'), headers, body, signal: ctrl.signal });
    const ms = Date.now() - t0;
    if (o.binary) { const b = Buffer.from(await r.arrayBuffer()); return { ok: r.ok, status: r.status, ms, b64: b.toString('base64'), type: r.headers.get('content-type') }; }
    return { ok: r.ok, status: r.status, ms, text: await r.text() };
  } catch (err) { return { ok: false, status: 0, error: err.name === 'AbortError' ? 'timeout' : String(err.message || err) }; }
  finally { clearTimeout(timer); }
});

// ---------- overlay window (spatial HUD + highlight boxes), click-through ----------
let overlay = null, overlayTimer = null;
function ensureOverlay() {
  if (overlay && !overlay.isDestroyed()) return overlay;
  const b = screen.getPrimaryDisplay().bounds;
  overlay = new BrowserWindow({ x: b.x, y: b.y, width: b.width, height: b.height, transparent: true, frame: false, resizable: false, movable: false, alwaysOnTop: true,
    skipTaskbar: true, focusable: false, hasShadow: false, show: false, webPreferences: webPrefs });
  overlay.setAlwaysOnTop(true, 'screen-saver'); overlay.setIgnoreMouseEvents(true);
  overlay.loadURL('app://pixie/index.html?mode=hud'); overlay.once('ready-to-show', () => overlay.showInactive());
  overlay.on('closed', () => { overlay = null; }); return overlay;
}
let hudOn = false;
ipcMain.on('hud:set', (_e, on) => { hudOn = !!on; if (on) ensureOverlay(); else if (overlay && !overlayTimer) { overlay.close(); } });
ipcMain.on('hud:data', (_e, m) => { if (!hudOn && m.t === 'hand') return; const w = ensureOverlay(); if (w.webContents.isLoading()) return; w.webContents.send('hud', m);
  if (m.t === 'highlight') { clearTimeout(overlayTimer); overlayTimer = setTimeout(() => { overlayTimer = null; if (!hudOn && overlay) overlay.close(); else overlay?.webContents.send('hud', { t: 'clear' }); }, m.ms || 20000); }
  if (m.t === 'clear' && !hudOn) setTimeout(() => { if (!overlayTimer && overlay) overlay.close(); }, 300); });

// ---------- Windows automation (PowerShell, no extra installs) ----------
const WIN = process.platform === 'win32';
const PRELUDE = `
$ErrorActionPreference='Stop'
Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes,System.Windows.Forms
Add-Type @"
using System; using System.Text; using System.Runtime.InteropServices;
public class PX {
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern IntPtr GetTopWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint c);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
 [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, int d, UIntPtr e);
 public static IntPtr Target(uint pid) {
  IntPtr h = GetTopWindow(IntPtr.Zero);
  while (h != IntPtr.Zero) {
   if (IsWindowVisible(h) && !IsIconic(h)) {
    StringBuilder sb = new StringBuilder(256); GetWindowText(h, sb, 256); uint p; GetWindowThreadProcessId(h, out p);
    string t = sb.ToString();
    if (t.Length > 0 && p != pid && t != "Program Manager" && t != "Windows Input Experience" && t != "Settings" ) return h;
   }
   h = GetWindow(h, 2);
  }
  return IntPtr.Zero;
 }
}
"@
function Focus($h){ if([PX]::GetForegroundWindow() -ne $h){ if([PX]::IsIconic($h)){ [PX]::ShowWindow($h,9)|Out-Null }; [PX]::SetForegroundWindow($h)|Out-Null; Start-Sleep -Milliseconds 90 } }
function Rect($e){ try{ $c=$e.Current; $r=$c.BoundingRectangle; if([double]::IsInfinity($r.X)){return $null}; [pscustomobject]@{n=[string]$c.Name;t=$c.ControlType.ProgrammaticName.Replace('ControlType.','');x=[int]$r.X;y=[int]$r.Y;w=[int]$r.Width;h=[int]$r.Height} }catch{ $null } }
`;
const PS = (body, timeout = 15000) => new Promise(res => {
  if (!WIN) return res({ ok: false, error: 'Windows only' });
  const enc = Buffer.from(PRELUDE + body, 'utf16le').toString('base64');
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', enc], { timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, out, errout) => {
    if (err) return res({ ok: false, error: String(errout || err.message).slice(0, 300) });
    try { res(JSON.parse(out.trim() || '{"ok":true}')); } catch { res({ ok: true, raw: out.trim().slice(0, 500) }); }
  });
});
const SCAN = focus => `
$h=[PX]::Target(${process.pid}); if($h -eq [IntPtr]::Zero){ '{"ok":false,"error":"no target window"}'; exit }
${focus ? 'Focus $h' : ''}
$win=[System.Windows.Automation.AutomationElement]::FromHandle($h)
$types='Button','Hyperlink','MenuItem','TabItem','ListItem','CheckBox','RadioButton','Edit','ComboBox','SplitButton','TreeItem','Document'
$cs=@(); foreach($t in $types){ $cs+=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::$t) }
$or=New-Object System.Windows.Automation.OrCondition([System.Windows.Automation.Condition[]]$cs)
$els=@(); $n=0
foreach($e in $win.FindAll([System.Windows.Automation.TreeScope]::Descendants,$or)){ if($n -ge 450){break}; try{ if($e.Current.IsOffscreen){continue} }catch{continue}; $r=Rect $e; if($r -and $r.w -gt 4 -and $r.h -gt 4){ if(-not $r.n){ $r.n=[string]$e.Current.AutomationId }; $els+=$r; $n++ } }
$f=$null; try{ $f=Rect ([System.Windows.Automation.AutomationElement]::FocusedElement) }catch{}
$sb=New-Object System.Text.StringBuilder 256; [void][PX]::GetWindowText($h,$sb,256)
[pscustomobject]@{ok=$true;hwnd=[int64]$h;title=$sb.ToString();focused=$f;els=@($els)} | ConvertTo-Json -Depth 4 -Compress`;
const KEYS_VK = { volume_up: 175, volume_down: 174, volume_mute: 173, media_next: 176, media_prev: 177, media_play: 179 };
const SPECIAL = { enter: '{ENTER}', tab: '{TAB}', esc: '{ESC}', escape: '{ESC}', delete: '{DEL}', backspace: '{BACKSPACE}', up: '{UP}', down: '{DOWN}', left: '{LEFT}', right: '{RIGHT}', home: '{HOME}', end: '{END}', pageup: '{PGUP}', pagedown: '{PGDN}', space: ' ' };
for (let i = 1; i <= 12; i++) SPECIAL['f' + i] = `{F${i}}`;
function toSendKeys(combo) {
  const parts = String(combo).toLowerCase().split('+').map(x => x.trim()).filter(Boolean); const key = parts.pop(); let pre = '';
  for (const m of parts) { if (m === 'ctrl' || m === 'control') pre += '^'; else if (m === 'alt') pre += '%'; else if (m === 'shift') pre += '+'; else return null; }
  const k = SPECIAL[key] || (/^[a-z0-9]$/.test(key) ? key : null); return k ? pre + k : null;
}

// ---------- persistent PowerShell host: compiled once, then every task is a ~10 ms message instead of a new process ----------
const HOST_LOOP = `
[Console]::InputEncoding=[Text.Encoding]::UTF8; [Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
$script:types='Button','Hyperlink','MenuItem','TabItem','ListItem','CheckBox','RadioButton','Edit','ComboBox','SplitButton','TreeItem','Document'
$script:wsh=New-Object -ComObject WScript.Shell
function Out-Line($o){ [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress -Depth 5)); [Console]::Out.Flush() }
function Resolve-Win($a){ if($a.hwnd){ return [IntPtr][int64]$a.hwnd }; return [PX]::Target([uint32]$a.pid) }
[Console]::Out.WriteLine('{"id":0,"ready":true}'); [Console]::Out.Flush()
while(($line=[Console]::In.ReadLine()) -ne $null){
  $id=0; $res=@{ok=$false}; $nr=$false
  try{
    $r=ConvertFrom-Json $line; $id=$r.id; $a=$r.args; $nr=[bool]$r.nr
    switch($r.cmd){
      'ping' { $res=@{ok=$true} }
      'target' { $h=[PX]::Target([uint32]$a.pid); $res=@{ok=($h -ne [IntPtr]::Zero); hwnd=[int64]$h} }
      'scan' {
        $h=[PX]::Target([uint32]$a.pid)
        if($h -eq [IntPtr]::Zero){ $res=@{ok=$false;error='no target window'} }
        else {
          if($a.focus){ Focus $h }
          $win=[System.Windows.Automation.AutomationElement]::FromHandle($h)
          $cr=New-Object System.Windows.Automation.CacheRequest
          foreach($p in @([System.Windows.Automation.AutomationElement]::NameProperty,[System.Windows.Automation.AutomationElement]::BoundingRectangleProperty,[System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.AutomationElement]::IsOffscreenProperty,[System.Windows.Automation.AutomationElement]::AutomationIdProperty)){ $cr.Add($p) }
          $cs=@(); foreach($t in $script:types){ $cs+=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::$t) }
          $or=New-Object System.Windows.Automation.OrCondition([System.Windows.Automation.Condition[]]$cs)
          $cr.Push(); try{ $col=$win.FindAll([System.Windows.Automation.TreeScope]::Descendants,$or) } finally { $cr.Pop() }
          $els=New-Object System.Collections.ArrayList
          foreach($e in $col){ if($els.Count -ge 450){break}
            try{ $c=$e.Cached; if($c.IsOffscreen){continue}; $q=$c.BoundingRectangle
              if([double]::IsInfinity($q.X) -or $q.Width -le 4 -or $q.Height -le 4){continue}
              $nm=[string]$c.Name; if(-not $nm){ $nm=[string]$c.AutomationId }
              [void]$els.Add(@{n=$nm;t=$c.ControlType.ProgrammaticName.Replace('ControlType.','');x=[int]$q.X;y=[int]$q.Y;w=[int]$q.Width;h=[int]$q.Height}) }catch{}
          }
          $f=$null; try{ $fe=[System.Windows.Automation.AutomationElement]::FocusedElement; $fq=$fe.Current.BoundingRectangle; $f=@{n=[string]$fe.Current.Name;t=$fe.Current.ControlType.ProgrammaticName.Replace('ControlType.','');x=[int]$fq.X;y=[int]$fq.Y;w=[int]$fq.Width;h=[int]$fq.Height} }catch{}
          $sb=New-Object System.Text.StringBuilder 256; [void][PX]::GetWindowText($h,$sb,256)
          $res=@{ok=$true;hwnd=[int64]$h;title=$sb.ToString();focused=$f;els=@($els.ToArray())}
        }
      }
      'click' {
        if($a.hwnd){ Focus ([IntPtr][int64]$a.hwnd) }
        if($a.x -ne $null){ [PX]::SetCursorPos([int]$a.x,[int]$a.y)|Out-Null; Start-Sleep -Milliseconds 20 }
        $dn=0x0002; $up=0x0004; if($a.button -eq 'right'){ $dn=0x0008; $up=0x0010 }
        [PX]::mouse_event($dn,0,0,0,[UIntPtr]::Zero); [PX]::mouse_event($up,0,0,0,[UIntPtr]::Zero)
        if($a.double){ [PX]::mouse_event($dn,0,0,0,[UIntPtr]::Zero); [PX]::mouse_event($up,0,0,0,[UIntPtr]::Zero) }
        $res=@{ok=$true}
      }
      'move' { [PX]::SetCursorPos([int]$a.x,[int]$a.y)|Out-Null; $res=@{ok=$true} }
      'down' { if($a.x -ne $null){ [PX]::SetCursorPos([int]$a.x,[int]$a.y)|Out-Null }; [PX]::mouse_event(0x0002,0,0,0,[UIntPtr]::Zero); $res=@{ok=$true} }
      'up' { [PX]::mouse_event(0x0004,0,0,0,[UIntPtr]::Zero); $res=@{ok=$true} }
      'key' {
        if($a.hwnd){ Focus ([IntPtr][int64]$a.hwnd) }
        if($a.vk){ $script:wsh.SendKeys([string][char][int]$a.vk) } else { [System.Windows.Forms.SendKeys]::SendWait([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($a.b64))) }
        $res=@{ok=$true}
      }
      'scroll' { [PX]::mouse_event(0x0800,0,0,[int]$a.amount,[UIntPtr]::Zero); $res=@{ok=$true} }
      'window' {
        $h=[IntPtr]::Zero; $title=''
        if($a.title){ $p=Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -like ('*'+$a.title+'*') } | Select-Object -First 1
          if(-not $p){ $p=Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.ProcessName -like ('*'+$a.title+'*') } | Select-Object -First 1 }
          if($p){ $h=$p.MainWindowHandle; $title=$p.MainWindowTitle } } else { $h=[PX]::Target([uint32]$a.pid) }
        if($h -eq [IntPtr]::Zero){ $res=@{ok=$false;error='window not found'} }
        else { switch($a.act){ 'focus'{ if([PX]::IsIconic($h)){[PX]::ShowWindow($h,9)|Out-Null}; [PX]::SetForegroundWindow($h)|Out-Null } 'min'{ [PX]::ShowWindow($h,6)|Out-Null } 'max'{ [PX]::ShowWindow($h,3)|Out-Null } 'restore'{ [PX]::ShowWindow($h,9)|Out-Null } 'close'{ Focus $h; [System.Windows.Forms.SendKeys]::SendWait('%{F4}') } }; $res=@{ok=$true;title=$title} }
      }
      'system' {
        switch($a.what){
          'minimize_all' { (New-Object -ComObject Shell.Application).MinimizeAll(); $res=@{ok=$true} }
          'lock' { rundll32.exe user32.dll,LockWorkStation; $res=@{ok=$true} }
          'battery' { $b=Get-CimInstance Win32_Battery; if($b){ $res=@{ok=$true;pct=[int]$b.EstimatedChargeRemaining;charging=($b.BatteryStatus -eq 2)} } else { $res=@{ok=$true;pct=$null} } }
        }
      }
    }
  } catch { $res=@{ok=$false;error=[string]$_.Exception.Message} }
  if(-not $nr){ $res['id']=$id; Out-Line $res }
}`;
let host = null, hostBroken = false, hostSeq = 0, hostReady = false; const hostPending = new Map();
function startHost() {
  if (host || hostBroken || !WIN) return;
  try {
    const enc = Buffer.from(PRELUDE + HOST_LOOP, 'utf16le').toString('base64');
    host = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', enc], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    host.stdout.setEncoding('utf8'); let buf = '';
    host.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue;
      try { const m = JSON.parse(line); if (m.ready) { hostReady = true; continue; } const p = hostPending.get(m.id); if (p) { hostPending.delete(m.id); clearTimeout(p.t); p.res(m); } } catch {} } });
    host.stderr.on('data', () => {}); host.on('error', () => { host = null; hostBroken = true; });
    host.on('exit', () => { host = null; hostReady = false; for (const p of hostPending.values()) { clearTimeout(p.t); p.res({ ok: false, hostFail: true, error: 'host exited' }); } hostPending.clear(); });
  } catch { host = null; hostBroken = true; }
}
let hostFails = 0;
function hostCall(cmd, args = {}, timeout) {
  return new Promise(res => {
    if (!WIN || hostBroken) return res({ ok: false, hostFail: true, error: WIN ? 'host unavailable' : 'Windows only' });
    startHost(); if (!host) return res({ ok: false, hostFail: true, error: 'host unavailable' });
    const id = ++hostSeq, t = setTimeout(() => { hostPending.delete(id); if (++hostFails >= 3) { hostBroken = true; try { host.kill(); } catch {} } res({ ok: false, hostFail: true, error: 'timeout' }); }, timeout || (hostReady ? 15000 : 30000));
    hostPending.set(id, { res, t }); try { host.stdin.write(JSON.stringify({ id, cmd, args: { ...args, pid: process.pid } }) + '\n'); } catch { clearTimeout(t); hostPending.delete(id); res({ ok: false, hostFail: true, error: 'write failed' }); }
  }).then(r => { if (!r.hostFail) hostFails = 0; return r; });
}
ipcMain.on('agent:warm', () => { if (WIN) { startHost(); } });
ipcMain.on('ptr', (_e, m) => { if (!WIN || hostBroken) return; startHost(); try { host?.stdin.write(JSON.stringify({ id: 0, cmd: m.cmd, nr: true, args: { x: m.x, y: m.y, pid: process.pid } }) + '\n'); } catch {} });
ipcMain.on('net:warm', (_e, urls) => { (urls || []).slice(0, 8).forEach(u => { try { fetch(u, { method: 'HEAD' }).catch(() => {}); } catch {} }); });
const APPS = { notepad: 'notepad', calculator: 'calc', paint: 'mspaint', explorer: 'explorer', files: 'explorer', terminal: 'wt', settings: 'ms-settings:', camera: 'microsoft.windows.camera:',
  vscode: 'code', code: 'code', chrome: 'chrome', edge: 'msedge', firefox: 'firefox', spotify: 'spotify:', word: 'winword', excel: 'excel', powerpoint: 'powerpnt', taskmanager: 'taskmgr',
  whatsapp: 'whatsapp:', discord: 'discord:', teams: 'msteams:', slack: 'slack:', zoom: 'zoommtg:', steam: 'steam:', store: 'ms-windows-store:', clock: 'ms-clock:', calendar: 'outlookcal:', mail: 'outlookmail:', photos: 'ms-photos:', snippingtool: 'ms-screenclip:' };
const SITES = { youtube: 'https://youtube.com', google: 'https://google.com', github: 'https://github.com', gmail: 'https://mail.google.com', twitter: 'https://x.com', x: 'https://x.com', reddit: 'https://reddit.com',
  netflix: 'https://netflix.com', maps: 'https://maps.google.com', chatgpt: 'https://chatgpt.com', instagram: 'https://instagram.com', facebook: 'https://facebook.com', linkedin: 'https://linkedin.com', amazon: 'https://amazon.com', wikipedia: 'https://wikipedia.org', drive: 'https://drive.google.com', whatsappweb: 'https://web.whatsapp.com' };
const FOLDERS = { documents: 'documents', downloads: 'downloads', desktop: 'desktop', pictures: 'pictures', music: 'music', videos: 'videos' };

async function viaHost(name, args) {
  switch (name) {
    case 'target': return hostCall('target');
    case 'scan': { const r = await hostCall('scan', { focus: !!args.focus }, 25000); if (r.els && !Array.isArray(r.els)) r.els = [r.els]; return r; }
    case 'click': return hostCall('click', { x: args.x, y: args.y, hwnd: args.hwnd, double: !!args.double, button: args.button });
    case 'scroll': return hostCall('scroll', { amount: Math.max(-2400, Math.min(2400, Number(args.amount) || -360)) });
    case 'window': return hostCall('window', { act: args.act, title: args.title });
    case 'system': return ['minimize_all', 'lock', 'battery'].includes(args.what) ? hostCall('system', { what: args.what }) : null;
    case 'key': { if (KEYS_VK[args.key]) return hostCall('key', { vk: KEYS_VK[args.key] }); const sk = toSendKeys(args.combo); if (!sk) return { ok: false, error: 'bad key combo' }; return hostCall('key', { b64: Buffer.from(sk).toString('base64'), hwnd: args.hwnd }); }
    case 'paste': { clipboard.writeText(String(args.text || '')); let r = await hostCall('key', { b64: Buffer.from('^v').toString('base64'), hwnd: args.hwnd }); if (r.ok && args.enter) r = await hostCall('key', { b64: Buffer.from('{ENTER}').toString('base64') }); return r; }
    case 'selection': { const before = clipboard.readText(); clipboard.writeText(''); const r = await hostCall('key', { b64: Buffer.from('^c').toString('base64'), hwnd: args.hwnd }); if (r.hostFail) return r; await new Promise(z => setTimeout(z, 120)); const text = clipboard.readText(); if (!text) clipboard.writeText(before); return { ok: !!text, text, error: text ? undefined : 'nothing selected' }; }
    default: return null;
  }
}
ipcMain.handle('agent:run', async (_e, { name, args = {} }) => {
  try {
    if (WIN && !hostBroken) { const r = await viaHost(name, args); if (r && !r.hostFail) return r; }
    switch (name) {
      case 'open_url': { const u = String(args.url || ''); if (!/^https?:\/\//i.test(u)) return { ok: false, error: 'bad url' }; await shell.openExternal(u); return { ok: true }; }
      case 'web_search': await shell.openExternal('https://www.google.com/search?q=' + encodeURIComponent(String(args.query || ''))); return { ok: true };
      case 'open_app': {
        const key = String(args.app || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (APPS[key]) { if (!WIN) return { ok: false, error: 'Windows only' }; exec(`start "" "${APPS[key]}"`, { shell: 'cmd.exe' }); return { ok: true, kind: 'app' }; }
        if (SITES[key]) { await shell.openExternal(SITES[key]); return { ok: true, kind: 'site' }; }
        return { ok: false, error: 'unknown app' };
      }
      case 'open_folder': { const f = FOLDERS[String(args.folder || '').toLowerCase()]; if (!f) return { ok: false, error: 'unknown folder' }; await shell.openPath(app.getPath(f)); return { ok: true }; }
      case 'key': {
        if (KEYS_VK[args.key]) return PS(`(New-Object -ComObject WScript.Shell).SendKeys([char]${KEYS_VK[args.key]}); '{"ok":true}'`);
        const sk = toSendKeys(args.combo); if (!sk) return { ok: false, error: 'bad key combo' };
        const b64 = Buffer.from(sk).toString('base64');
        return PS(`${args.hwnd ? `Focus ([IntPtr]${Number(args.hwnd)})` : ''}; [System.Windows.Forms.SendKeys]::SendWait([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64}'))); '{"ok":true}'`);
      }
      case 'scroll': { const amt = Math.max(-2400, Math.min(2400, Number(args.amount) || -360)); return PS(`[PX]::mouse_event(0x0800,0,0,${amt},[UIntPtr]::Zero); '{"ok":true}'`); }
      case 'window': return { ok: false, error: 'window control needs the PowerShell host' };
      case 'target': return PS(`$h=[PX]::Target(${process.pid}); [pscustomobject]@{ok=($h -ne [IntPtr]::Zero);hwnd=[int64]$h}|ConvertTo-Json -Compress`);
      case 'scan': { const r = await PS(SCAN(!!args.focus), 25000); if (r.els && !Array.isArray(r.els)) r.els = [r.els]; return r; }
      case 'click': {
        const x = Math.round(+args.x), y = Math.round(+args.y); if (!Number.isFinite(x) || !Number.isFinite(y)) { if (args.x === undefined) return PS('[PX]::mouse_event(0x0002,0,0,0,[UIntPtr]::Zero); [PX]::mouse_event(0x0004,0,0,0,[UIntPtr]::Zero); \'{"ok":true}\''); return { ok: false, error: 'bad point' }; }
        return PS(`${args.hwnd ? `Focus ([IntPtr]${Number(args.hwnd)})` : ''}; [PX]::SetCursorPos(${x},${y})|Out-Null; Start-Sleep -Milliseconds 50; [PX]::mouse_event(0x0002,0,0,0,[UIntPtr]::Zero); [PX]::mouse_event(0x0004,0,0,0,[UIntPtr]::Zero); ${args.double ? '[PX]::mouse_event(0x0002,0,0,0,[UIntPtr]::Zero); [PX]::mouse_event(0x0004,0,0,0,[UIntPtr]::Zero);' : ''} '{"ok":true}'`);
      }
      case 'paste': { // put text on the clipboard, focus the target window, Ctrl+V (+ optional Enter)
        clipboard.writeText(String(args.text || ''));
        return PS(`${args.hwnd ? `Focus ([IntPtr]${Number(args.hwnd)})` : ''}; [System.Windows.Forms.SendKeys]::SendWait('^v'); ${args.enter ? "Start-Sleep -Milliseconds 120; [System.Windows.Forms.SendKeys]::SendWait('{ENTER}');" : ''} '{"ok":true}'`);
      }
      case 'selection': { // copy the current selection of the target window and return it
        const before = clipboard.readText(); clipboard.writeText('');
        const r = await PS(`${args.hwnd ? `Focus ([IntPtr]${Number(args.hwnd)})` : ''}; [System.Windows.Forms.SendKeys]::SendWait('^c'); Start-Sleep -Milliseconds 200; '{"ok":true}'`);
        const text = clipboard.readText(); if (!text) clipboard.writeText(before); return { ok: !!text, text, error: text ? undefined : 'nothing selected' };
      }
      case 'clipboard_read': return { ok: true, text: clipboard.readText().slice(0, 4000) };
      case 'clipboard_write': clipboard.writeText(String(args.text || '')); return { ok: true };
      case 'note': { const dir = path.join(app.getPath('documents'), 'Pixie'); fs.mkdirSync(dir, { recursive: true }); const f = path.join(dir, 'notes.txt'); fs.appendFileSync(f, `[${new Date().toLocaleString()}] ${String(args.text || '')}\n`); return { ok: true, file: f }; }
      case 'notify': new Notification({ title: String(args.title || 'Pixie'), body: String(args.body || '') }).show(); return { ok: true };
      case 'system': {
        if (args.what === 'minimize_all') return PS(`(New-Object -ComObject Shell.Application).MinimizeAll(); '{"ok":true}'`);
        if (args.what === 'lock') { exec('rundll32.exe user32.dll,LockWorkStation'); return { ok: true }; }
        if (args.what === 'battery') return PS(`$b=Get-CimInstance Win32_Battery; if($b){ [pscustomobject]@{ok=$true;pct=[int]$b.EstimatedChargeRemaining;charging=($b.BatteryStatus -eq 2)}|ConvertTo-Json -Compress }else{ '{"ok":true,"pct":null}' }`);
        return { ok: false, error: 'unknown system action' };
      }
      case 'screenshot': { const img = await grabScreen(1920, 1080); const dir = path.join(app.getPath('pictures'), 'Pixie'); fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, 'screenshot-' + Date.now() + '.png'); fs.writeFileSync(file, img.toPNG()); shell.showItemInFolder(file); return { ok: true, file }; }
      default: return { ok: false, error: 'unknown action' };
    }
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
});
async function grabScreen(w, h) { const src = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: w, height: h } }); if (!src.length) throw new Error('no screen'); return src[0].thumbnail; }
ipcMain.handle('screen:capture', async () => { try { return 'data:image/jpeg;base64,' + (await grabScreen(1280, 720)).toJPEG(70).toString('base64'); } catch { return null; } });
