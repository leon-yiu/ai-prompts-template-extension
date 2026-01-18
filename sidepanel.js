// sidepanel.js

const STORAGE_KEY = "promptVault.templates";

const el = (id) => document.getElementById(id);

const listEl = el("list");
const searchInput = el("searchInput");

const titleInput = el("titleInput");
const tagsInput = el("tagsInput");
const bodyInput = el("bodyInput");

const newBtn = el("newBtn");
const saveBtn = el("saveBtn");
const deleteBtn = el("deleteBtn");
const copyBtn = el("copyBtn");

const exportBtn = el("exportBtn");
const importInput = el("importInput");

const statusEl = el("status");

let templates = [];
let activeId = null;

function nowIso() {
  return new Date().toISOString();
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + "-" + Math.random().toString(16).slice(2);
}

function setStatus(msg) {
  statusEl.textContent = msg || "";
  if (msg) setTimeout(() => (statusEl.textContent = ""), 2500);
}

async function storageGet() {
  const data = await chrome.storage.sync.get([STORAGE_KEY]);
  return data[STORAGE_KEY] || [];
}

async function storageSet(value) {
  try {
    await chrome.storage.sync.set({ [STORAGE_KEY]: value });
  } catch (e) {
    // If sync quota ever becomes an issue, switch to local here.
    console.warn("chrome.storage.sync.set failed:", e);
    await chrome.storage.local.set({ [STORAGE_KEY]: value });
  }
}

function normalizeTags(raw) {
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function getActive() {
  return templates.find((t) => t.id === activeId) || null;
}

function filteredTemplates() {
  const q = (searchInput.value || "").trim().toLowerCase();
  if (!q) return templates;

  return templates.filter((t) => {
    const hay = [
      t.title || "",
      (t.tags || []).join(", "),
      t.body || ""
    ].join("\n").toLowerCase();
    return hay.includes(q);
  });
}

async function moveTemplate(id, direction) {
  const visible = filteredTemplates();
  const visibleIndex = visible.findIndex((t) => t.id === id);
  const target = visible[visibleIndex + direction];
  if (!target) return;

  const fromIndex = templates.findIndex((t) => t.id === id);
  const toIndex = templates.findIndex((t) => t.id === target.id);
  if (fromIndex < 0 || toIndex < 0) return;

  const updated = templates.slice();
  [updated[fromIndex], updated[toIndex]] = [updated[toIndex], updated[fromIndex]];
  templates = updated;

  await storageSet(templates);
  renderList();
}

function renderList() {
  const items = filteredTemplates();

  listEl.innerHTML = "";

  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "item";
    empty.style.cursor = "default";
    empty.innerHTML = `
      <div class="itemTitle">No templates yet</div>
      <div class="itemMeta">Click <b>New</b> to create one.</div>
    `;
    listEl.appendChild(empty);
    return;
  }

  items.forEach((t, index) => {
    const div = document.createElement("div");
    div.className = "item" + (t.id === activeId ? " active" : "");
    div.innerHTML = `
      <div class="itemRow">
        <div class="itemTitle">${escapeHtml(t.title || "Untitled")}</div>
        <div class="itemActions">
          <button class="btn btnTiny moveUp" type="button" aria-label="Move up">Up</button>
          <button class="btn btnTiny moveDown" type="button" aria-label="Move down">Down</button>
        </div>
      </div>
      <div class="itemMeta">
        <span>${(t.tags || []).slice(0, 3).map(escapeHtml).join(", ") || "no tags"}</span>
        <span>•</span>
        <span>${formatDate(t.updatedAt || t.createdAt)}</span>
      </div>
    `;
    div.addEventListener("click", () => {
      activeId = t.id;
      loadActiveIntoEditor();
      renderList();
    });
    const moveUpBtn = div.querySelector(".moveUp");
    const moveDownBtn = div.querySelector(".moveDown");
    moveUpBtn.disabled = index === 0;
    moveDownBtn.disabled = index === items.length - 1;
    moveUpBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      moveTemplate(t.id, -1);
    });
    moveDownBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      moveTemplate(t.id, 1);
    });
    listEl.appendChild(div);
  });
}

function loadActiveIntoEditor() {
  const t = getActive();
  if (!t) {
    titleInput.value = "";
    tagsInput.value = "";
    bodyInput.value = "";
    return;
  }
  titleInput.value = t.title || "";
  tagsInput.value = (t.tags || []).join(", ");
  bodyInput.value = t.body || "";
}

function editorToTemplate(existing) {
  const title = titleInput.value.trim();
  const tags = normalizeTags(tagsInput.value);
  const body = bodyInput.value;

  const base = existing || { id: uid(), createdAt: nowIso() };
  return {
    ...base,
    title: title || "Untitled",
    tags,
    body,
    updatedAt: nowIso()
  };
}

async function upsertActive() {
  const existing = getActive();
  const updated = editorToTemplate(existing);

  if (existing) {
    templates = templates.map((t) => (t.id === updated.id ? updated : t));
  } else {
    templates = [updated, ...templates];
    activeId = updated.id;
  }

  await storageSet(templates);
  renderList();
  setStatus("Saved.");
}

async function deleteActive() {
  if (!activeId) return;
  templates = templates.filter((t) => t.id !== activeId);
  activeId = templates[0]?.id || null;
  await storageSet(templates);
  loadActiveIntoEditor();
  renderList();
  setStatus("Deleted.");
}

async function createNew() {
  const t = {
    id: uid(),
    title: "New Template",
    tags: [],
    body: "",
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  templates = [t, ...templates];
  activeId = t.id;
  await storageSet(templates);
  loadActiveIntoEditor();
  renderList();
  titleInput.focus();
  titleInput.select();
}

async function copyActive() {
  const t = getActive();
  const text = (t?.body ?? bodyInput.value ?? "").trim();
  if (!text) return setStatus("Nothing to copy.");
  await navigator.clipboard.writeText(text);
  setStatus("Copied to clipboard.");
}

function exportJson() {
  const payload = {
    exportedAt: nowIso(),
    templates
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `prompt-vault-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();

  URL.revokeObjectURL(url);
  setStatus("Exported.");
}

async function importJson(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);

  const incoming = Array.isArray(parsed) ? parsed : parsed.templates;
  if (!Array.isArray(incoming)) throw new Error("Invalid import format.");

  // Basic sanitation + de-dup by id
  const map = new Map(templates.map((t) => [t.id, t]));
  for (const t of incoming) {
    if (!t || typeof t !== "object") continue;
    const id = typeof t.id === "string" ? t.id : uid();
    map.set(id, {
      id,
      title: String(t.title || "Untitled"),
      tags: Array.isArray(t.tags) ? t.tags.map(String) : [],
      body: String(t.body || ""),
      createdAt: t.createdAt || nowIso(),
      updatedAt: nowIso()
    });
  }

  templates = Array.from(map.values());
  activeId = templates[0]?.id || null;

  await storageSet(templates);
  loadActiveIntoEditor();
  renderList();
  setStatus("Imported.");
}

function formatDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function init() {
  templates = await storageGet();
  activeId = templates[0]?.id || null;
  loadActiveIntoEditor();
  renderList();
}

newBtn.addEventListener("click", createNew);
saveBtn.addEventListener("click", upsertActive);
deleteBtn.addEventListener("click", deleteActive);
copyBtn.addEventListener("click", copyActive);

exportBtn.addEventListener("click", exportJson);
importInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    await importJson(file);
  } catch (err) {
    console.error(err);
    setStatus("Import failed (invalid JSON).");
  } finally {
    importInput.value = "";
  }
});

searchInput.addEventListener("input", renderList);

// Optional: Ctrl/Cmd+S to save
document.addEventListener("keydown", (e) => {
  const isMac = navigator.platform.toLowerCase().includes("mac");
  if ((isMac ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    upsertActive();
  }
});

init().catch((e) => {
  console.error(e);
  setStatus("Failed to load templates.");
});
