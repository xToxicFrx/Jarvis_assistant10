// ============================================================
// OBSIDIAN — Zugriff auf deinen Vault-Ordner direkt im Browser.
//
// Nutzt die "File System Access API" (nur Chrome/Edge). Der Browser
// fragt EINMAL nach dem Ordner; den Zugriff merken wir uns in einer
// kleinen Browser-Datenbank (IndexedDB), damit du ihn nicht jedes Mal
// neu auswählen musst.
//
// Kann: Vault auswählen, Markdown durchsuchen, Notiz an die Daily Note
// anhängen, neue Notiz anlegen.
// ============================================================

const Obsidian = (() => {
  let handle = null; // der Ordner-Verweis

  // ---------- kleine IndexedDB, um den Ordner-Verweis zu speichern ----------
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("jarvis-db", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("handles");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function storeHandle(h) {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction("handles", "readwrite");
      tx.objectStore("handles").put(h, "vault");
      tx.oncomplete = () => resolve();
    });
  }
  async function loadHandle() {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction("handles", "readonly");
      const g = tx.objectStore("handles").get("vault");
      g.onsuccess = () => resolve(g.result || null);
      g.onerror = () => resolve(null);
    });
  }

  // ---------- Verfügbarkeit prüfen ----------
  function isSupported() {
    return typeof window.showDirectoryPicker === "function";
  }

  // ---------- Ordner auswählen (braucht einen Klick vom Benutzer) ----------
  async function pick() {
    if (!isSupported()) throw new Error("Dein Browser kann das nicht. Nimm Chrome oder Edge.");
    handle = await window.showDirectoryPicker({ id: "jarvis-vault", mode: "readwrite" });
    await handle.requestPermission({ mode: "readwrite" });
    await storeHandle(handle);
    return handle;
  }

  // ---------- Gespeicherten Zugriff wiederherstellen ----------
  // Gibt true zurück, wenn der Vault (wieder) nutzbar ist.
  async function reconnect() {
    if (!isSupported()) return false;
    if (!handle) handle = await loadHandle();
    if (!handle) return false;
    const opts = { mode: "readwrite" };
    let perm = await handle.queryPermission(opts);
    if (perm === "granted") return true;
    // Erneut fragen (klappt nur direkt nach einem Klick)
    perm = await handle.requestPermission(opts);
    return perm === "granted";
  }

  function connected() { return !!handle; }

  // ---------- Markdown-Dateien rekursiv durchsuchen ----------
  async function search(query, maxResults = 5) {
    if (!handle) throw new Error("Kein Vault verbunden.");
    const q = (query || "").toLowerCase();
    const results = [];
    let scanned = 0;

    async function walk(dir, path) {
      for await (const entry of dir.values()) {
        if (results.length >= maxResults || scanned > 2000) return;
        if (entry.kind === "directory") {
          if (entry.name.startsWith(".")) continue; // .obsidian etc. überspringen
          await walk(entry, path + entry.name + "/");
        } else if (entry.name.toLowerCase().endsWith(".md")) {
          scanned++;
          const text = await (await entry.getFile()).text();
          const nameHit = entry.name.toLowerCase().includes(q);
          const bodyHit = text.toLowerCase().includes(q);
          if (nameHit || bodyHit) {
            // kurzen Ausschnitt rund um den Treffer holen
            let snippet = text.slice(0, 220);
            const idx = text.toLowerCase().indexOf(q);
            if (idx > -1) snippet = text.slice(Math.max(0, idx - 60), idx + 160);
            results.push({ name: path + entry.name, snippet: snippet.replace(/\s+/g, " ").trim() });
          }
        }
      }
    }
    await walk(handle, "");
    return results;
  }

  // ---------- An die Daily Note anhängen (YYYY-MM-DD.md im Vault-Root) ----------
  async function appendToDaily(text) {
    if (!handle) throw new Error("Kein Vault verbunden.");
    const d = new Date();
    const name = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}.md`;
    const fileHandle = await handle.getFileHandle(name, { create: true });

    // bisherigen Inhalt lesen (falls Datei schon existiert)
    let existing = "";
    try { existing = await (await fileHandle.getFile()).text(); } catch (e) {}

    const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const addition = `${existing ? "\n" : ""}- ${time} ${text}`;

    const w = await fileHandle.createWritable();
    await w.write(existing + addition);
    await w.close();
    return name;
  }

  // ---------- Neue Notiz anlegen ----------
  async function createNote(title, content) {
    if (!handle) throw new Error("Kein Vault verbunden.");
    const safe = title.replace(/[\\/:*?"<>|]/g, "-").trim() || "Neue Notiz";
    const name = safe.endsWith(".md") ? safe : safe + ".md";
    const fileHandle = await handle.getFileHandle(name, { create: true });
    const w = await fileHandle.createWritable();
    await w.write(content || "");
    await w.close();
    return name;
  }

  // ---------- Alle Markdown-Dateien einsammeln (mit Cache) ----------
  let _cache = null, _cacheTime = 0;
  async function allFiles(force = false) {
    if (!handle) throw new Error("Kein Vault verbunden.");
    if (!force && _cache && Date.now() - _cacheTime < 30000) return _cache;
    const files = [];
    async function walk(dir, path) {
      for await (const entry of dir.values()) {
        if (files.length > 5000) return;
        if (entry.kind === "directory") {
          if (entry.name.startsWith(".")) continue;
          await walk(entry, path + entry.name + "/");
        } else if (entry.name.toLowerCase().endsWith(".md")) {
          files.push({ entry, path: path + entry.name });
        }
      }
    }
    await walk(handle, "");
    _cache = files; _cacheTime = Date.now();
    return files;
  }

  // ---------- Eine ganze Notiz lesen (bestes Treffer-Match) ----------
  async function readNote(query) {
    const files = await allFiles();
    const q = (query || "").toLowerCase();
    // 1. exakter/teilweiser Dateiname, sonst 2. Inhaltstreffer
    let hit = files.find((f) => f.path.toLowerCase().includes(q));
    if (!hit) {
      for (const f of files) {
        const text = await (await f.entry.getFile()).text();
        if (text.toLowerCase().includes(q)) { hit = f; break; }
      }
    }
    if (!hit) return null;
    const text = await (await hit.entry.getFile()).text();
    return { name: hit.path, content: text.slice(0, 4000) };
  }

  // ---------- Kürzlich bearbeitete Notizen ----------
  async function recent(n = 5) {
    const files = await allFiles();
    const withTime = [];
    for (const f of files) {
      const file = await f.entry.getFile();
      withTime.push({ path: f.path, modified: file.lastModified });
    }
    withTime.sort((a, b) => b.modified - a.modified);
    return withTime.slice(0, n);
  }

  // ---------- Statistiken über den Vault ----------
  async function stats() {
    const files = await allFiles();
    let folders = new Set(), tags = {};
    for (const f of files) {
      const slash = f.path.lastIndexOf("/");
      if (slash > -1) folders.add(f.path.slice(0, slash));
    }
    // Tags nur aus den ersten ~80 Notizen sammeln (schnell)
    for (const f of files.slice(0, 80)) {
      const text = await (await f.entry.getFile()).text();
      (text.match(/(^|\s)#([\wäöüß-]{2,30})/g) || []).forEach((m) => {
        const tag = m.trim().replace(/^#/, "");
        tags[tag] = (tags[tag] || 0) + 1;
      });
    }
    const topTags = Object.entries(tags).sort((a, b) => b[1] - a[1]).slice(0, 8).map((x) => x[0]);
    return { notes: files.length, folders: folders.size, tags: topTags };
  }

  // ---------- Offene Aufgaben einsammeln (Markdown-Checkboxen "- [ ]") ----------
  // Für die Decision Engine: liefert offene To-dos aus dem zweiten Gehirn.
  async function openTasks(max = 25) {
    if (!handle) return [];
    const files = await allFiles();
    // Zuletzt geänderte Dateien zuerst (frische Aufgaben sind relevanter).
    const withTime = [];
    for (const f of files.slice(0, 120)) {
      try { withTime.push({ f, m: (await f.entry.getFile()).lastModified }); } catch (e) {}
    }
    withTime.sort((a, b) => b.m - a.m);

    const tasks = [];
    const seen = new Set();
    const re = /^\s*[-*]\s\[ \]\s+(.+?)\s*$/gm;
    for (const { f } of withTime.slice(0, 60)) {
      if (tasks.length >= max) break;
      let text = "";
      try { text = await (await f.entry.getFile()).text(); } catch (e) { continue; }
      let m;
      while ((m = re.exec(text)) && tasks.length < max) {
        // Markdown-Reste (Links, Fett, Tags am Ende) leicht säubern
        const raw = m[1].replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, "$1").replace(/[*_`]/g, "").trim();
        const key = raw.toLowerCase();
        if (raw && !seen.has(key)) { seen.add(key); tasks.push({ text: raw, file: f.path }); }
      }
    }
    return tasks;
  }

  // ---------- An eine bestimmte Notiz anhängen (anlegen falls nötig) ----------
  async function appendToNote(query, text) {
    const found = await readNote(query);
    let name;
    if (found) name = found.name.split("/").pop();
    else name = (query.endsWith(".md") ? query : query + ".md").replace(/[\\/:*?"<>|]/g, "-");
    const fileHandle = await handle.getFileHandle(name, { create: true });
    let existing = "";
    try { existing = await (await fileHandle.getFile()).text(); } catch (e) {}
    const w = await fileHandle.createWritable();
    await w.write(existing + (existing ? "\n" : "") + text);
    await w.close();
    _cache = null; // Cache verwerfen
    return name;
  }

  return {
    isSupported, pick, reconnect, connected,
    search, appendToDaily, createNote,
    readNote, recent, stats, appendToNote, openTasks,
  };
})();
