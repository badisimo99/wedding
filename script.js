// --- Mobile Debug Overlay (Runs only when ?debug=true is present in the URL query string) ---
(function() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has("debug")) {
    const debugOverlay = document.createElement("div");
    debugOverlay.style.position = "fixed";
    debugOverlay.style.bottom = "0";
    debugOverlay.style.left = "0";
    debugOverlay.style.width = "100%";
    debugOverlay.style.maxHeight = "180px";
    debugOverlay.style.overflowY = "auto";
    debugOverlay.style.backgroundColor = "rgba(0, 0, 0, 0.9)";
    debugOverlay.style.color = "#ff4d4d";
    debugOverlay.style.fontSize = "11px";
    debugOverlay.style.fontFamily = "monospace";
    debugOverlay.style.padding = "8px";
    debugOverlay.style.zIndex = "999999";
    debugOverlay.style.borderTop = "2px solid #ff4d4d";
    debugOverlay.id = "mobile-debug-overlay";
    
    // Create clear button
    const clearBtn = document.createElement("button");
    clearBtn.innerText = "Clear logs";
    clearBtn.style.position = "absolute";
    clearBtn.style.top = "2px";
    clearBtn.style.right = "8px";
    clearBtn.style.backgroundColor = "#ff4d4d";
    clearBtn.style.color = "#000";
    clearBtn.style.border = "none";
    clearBtn.style.padding = "2px 6px";
    clearBtn.style.fontSize = "9px";
    clearBtn.style.borderRadius = "3px";
    clearBtn.style.cursor = "pointer";
    clearBtn.onclick = (e) => {
      e.stopPropagation();
      debugOverlay.innerHTML = "";
      debugOverlay.appendChild(clearBtn);
    };
    debugOverlay.appendChild(clearBtn);
    
    document.body.appendChild(debugOverlay);

    const logToOverlay = (msg) => {
      const line = document.createElement("div");
      line.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
      line.style.borderBottom = "1px solid rgba(255,255,255,0.1)";
      line.style.padding = "2px 0";
      debugOverlay.appendChild(line);
      debugOverlay.scrollTop = debugOverlay.scrollHeight;
    };

    window.addEventListener("error", (e) => {
      logToOverlay(`ERROR: ${e.message} at ${e.filename}:${e.lineno}`);
    });
    window.addEventListener("unhandledrejection", (e) => {
      logToOverlay(`REJECTION: ${e.reason}`);
    });

    const originalConsoleError = console.error;
    console.error = function(...args) {
      logToOverlay(`CONSOLE.ERROR: ${args.join(" ")}`);
      originalConsoleError.apply(console, args);
    };

    const originalConsoleLog = console.log;
    console.log = function(...args) {
      logToOverlay(`LOG: ${args.join(" ")}`);
      originalConsoleLog.apply(console, args);
    };
    
    logToOverlay("Debugger initialized. URL: " + window.location.href);
  }
})();

// --- Safe LocalStorage Wrapper (Prevents DOMException crashes in Private Browsing / embedded webviews) ---
const safeStorage = {
  getItem(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn("localStorage.getItem failed for key:", key, e);
      return null;
    }
  },
  setItem(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (e) {
      console.warn("localStorage.setItem failed for key:", key, e);
      return false;
    }
  },
  removeItem(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (e) {
      console.warn("localStorage.removeItem failed for key:", key, e);
      return false;
    }
  }
};

// --- State Management ---
const DEFAULT_CONFIG = {
  names: "Sofia & Russell",
  date: "2026-10-08T17:00:00",
  location: "Marchand Ranch, Cañon City, CO",
  tagline: "We're getting hitched! Please join us to celebrate our love as we take this exciting next step in our journey.",
  theme: "ivory",
  webhookUrl: "https://script.google.com/macros/s/AKfycbzvR7KAfAh2Jld9AAloryj9W8npzj3S2DcH-TWJJPdD-T59W2h7yF4lzRw2BWws-_hW/exec"
};

let config = { ...DEFAULT_CONFIG };
let rsvps = [];

// Web Audio API Context and Synthesizer Nodes
let audioCtx = null;
let masterGain = null;
let isAudioPlaying = false;
let loopTimer = null;
let scheduledNodes = [];
let delayNodeL = null;
let delayNodeR = null;
let feedbackGainL = null;
let feedbackGainR = null;
let convolverNode = null;
let reverbGain = null;
let preDelayNode = null;
let schedulerInterval = null;
let violinFilterL = null, violinFilterR = null;
let violaFilterL = null, violaFilterR = null;
let celloFilterL = null, celloFilterR = null;
let globalBowingLFO = null, globalBowingGain = null;



// Canvas Particles
let canvas = null;
let ctx = null;
let animationId = null;
let particles = [];

// Initialize configuration, particles, and RSVPs
document.addEventListener("DOMContentLoaded", () => {
  loadConfig();
  loadRSVPs();
  initCanvas();
  setupEventListeners();
  startCountdown();
  renderRSVPTable();

  // Show edit cog and share button ONLY if the visitor is accessing from localhost/127.0.0.1 (development)
  // or if their public IP strictly matches your editor IP address (198.181.63.200).
  const editBtn = document.getElementById("edit-btn");
  const shareBtn = document.getElementById("share-btn");
  
  if (editBtn) editBtn.style.display = "none";
  if (shareBtn) shareBtn.style.display = "none";

  const urlParams = new URLSearchParams(window.location.search);
  const isEditorParam = urlParams.has("edit") || urlParams.has("admin");
  if (isEditorParam) {
    safeStorage.setItem("wedding_is_editor", "true");
  }

  const isLocalhost = window.location.hostname === "localhost" || 
                      window.location.hostname === "127.0.0.1" || 
                      window.location.protocol === "file:";

  if (isLocalhost) {
    const isEditor = isEditorParam || safeStorage.getItem("wedding_is_editor") === "true";
    if (isEditor) {
      if (editBtn) editBtn.style.display = "flex";
      if (shareBtn) shareBtn.style.display = "flex";
    }
  } else {
    // Production: Strictly require the IP check to pass, preventing bypass via URL params or localStorage on other IPs
    fetch("https://api.ipify.org?format=json")
      .then(res => res.json())
      .then(data => {
        if (data.ip === "198.181.63.200") {
          if (editBtn) editBtn.style.display = "flex";
          if (shareBtn) shareBtn.style.display = "flex";
        }
      })
      .catch(err => console.log("IP validation check omitted or blocked"));
  }
});

// --- Configuration Persistence ---
function loadConfig() {
  const saved = safeStorage.getItem("wedding_save_the_date_config");
  if (saved) {
    try {
      config = { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
      // Migrate old placeholder defaults automatically
      if (config.names === "Sophia & Julian" || config.names === "Sophia and Julian" || config.date === "2026-09-19T17:00:00") {
        config = { ...DEFAULT_CONFIG };
        saveConfig();
      }
      // Migrate old tagline automatically
      if (config.tagline === "Are getting married! Please join us to celebrate our love and new beginnings." ||
          config.tagline === "Are getting hitched! Please join us to celebrate our love and the next step this exciting new journey." ||
          config.tagline === "Are getting hitched! Please join us to celebrate our love as we take this exciting next step in our journey." ||
          config.tagline.includes("Are getting hitched") ||
          config.tagline.includes("Are getting married") ||
          config.tagline.includes("Sofia & Russell Are getting hitched") ||
          config.tagline.includes("Sofia & Russell We're getting hitched")) {
        config.tagline = DEFAULT_CONFIG.tagline;
        saveConfig();
      }
      // Migrate empty or old broken webhooks to the new default automatically
      if (!config.webhookUrl || 
          config.webhookUrl.includes("AKfycbwQr7MGf-06CBBWKcyMp2C46CnkeyTUoY7O68nplw1wdQ3wmeYxEGpNMP20yDhetPUJ") ||
          config.webhookUrl.includes("AKfycbyBoqhvZzJRmMYdBirtLQr_3_nPNWvFYxQG6_UUrafPjlSycjUF8uCyDqgVEIxkU9yj") ||
          config.webhookUrl.includes("AKfycbxYoL9g8ccwMuXLYnjOOXxHdIyIsgma0nydzhcGZMmsOoOBYntceaDlk2V2TToS9Apo")) {
        config.webhookUrl = DEFAULT_CONFIG.webhookUrl;
        saveConfig();
      }
    } catch (e) {
      config = { ...DEFAULT_CONFIG };
    }
  } else {
    config = { ...DEFAULT_CONFIG };
  }
  
  // Set values on UI
  document.getElementById("couple-names-preview").innerHTML = formatNames(config.names);
  document.getElementById("wedding-date-preview").innerText = formatDate(config.date);
  document.getElementById("wedding-location-preview").innerText = config.location;
  document.getElementById("wedding-tagline-preview").innerText = config.tagline;

  // Set theme on body
  document.body.setAttribute("data-theme", config.theme);
  
  // Populate Studio Inputs
  document.getElementById("input-names").value = config.names;
  document.getElementById("input-date").value = config.date;
  document.getElementById("input-location").value = config.location;
  document.getElementById("input-tagline").value = config.tagline;
  document.getElementById("input-webhook").value = config.webhookUrl || "";
  
  // Select theme swatch in sidebar
  document.querySelectorAll(".theme-opt").forEach(opt => {
    if (opt.getAttribute("data-theme-val") === config.theme) {
      opt.classList.add("active");
    } else {
      opt.classList.remove("active");
    }
  });

  resetParticles();
}

function saveConfig() {
  safeStorage.setItem("wedding_save_the_date_config", JSON.stringify(config));
}

function formatNames(nameStr) {
  if (!nameStr) return "";
  // Format "A & B" or "A and B" to put the "&" on its own italicized line
  const parts = nameStr.split(/\s+&\s+|\s+and\s+/i);
  if (parts.length === 2) {
    return `${escapeHtml(parts[0])} <span class="and">&</span> ${escapeHtml(parts[1])}`;
  }
  return escapeHtml(nameStr);
}

function formatDate(dateStr) {
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const d = parseDate(dateStr);
  if (isNaN(d.getTime())) return "October 8, 2026";
  return d.toLocaleDateString('en-US', options);
}

function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function parseDate(dateStr) {
  if (!dateStr) return new Date();
  // Safari / iOS date string parsing compatibility: replace dash with slash and T with space
  const cleaned = dateStr.replace(/-/g, "/").replace("T", " ");
  const d = new Date(cleaned);
  if (!isNaN(d.getTime())) return d;
  
  // Fallback manual parser for ISO-like strings (e.g. YYYY-MM-DDTHH:mm:ss)
  const parts = dateStr.split(/[-T:\s]/);
  if (parts.length >= 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const hours = parseInt(parts[3], 10) || 0;
    const minutes = parseInt(parts[4], 10) || 0;
    const seconds = parseInt(parts[5], 10) || 0;
    return new Date(year, month, day, hours, minutes, seconds);
  }
  return new Date(dateStr);
}

// --- Event Listeners Setup ---
function setupEventListeners() {
  // Toggle Design Studio Panel
  const editBtn = document.getElementById("edit-btn");
  const closeBtn = document.getElementById("close-btn");
  const overlay = document.getElementById("studio-overlay");
  const panel = document.getElementById("studio-panel");

  function openStudio() {
    overlay.classList.add("active");
    panel.classList.add("active");
  }

  function closeStudio() {
    overlay.classList.remove("active");
    panel.classList.remove("active");
  }

  if (editBtn) editBtn.addEventListener("click", openStudio);
  if (closeBtn) closeBtn.addEventListener("click", closeStudio);
  if (overlay) overlay.addEventListener("click", closeStudio);

  // Audio Control
  const audioBtn = document.getElementById("audio-btn");
  audioBtn.addEventListener("click", toggleAudio);

  // Design Studio Input Updates (Live Preview)
  document.getElementById("input-names").addEventListener("input", (e) => {
    config.names = e.target.value || "Sofia & Russell";
    document.getElementById("couple-names-preview").innerHTML = formatNames(config.names);
    saveConfig();
  });

  document.getElementById("input-date").addEventListener("input", (e) => {
    config.date = e.target.value || "2026-10-08T17:00:00";
    document.getElementById("wedding-date-preview").innerText = formatDate(config.date);
    startCountdown();
    saveConfig();
  });

  document.getElementById("input-location").addEventListener("input", (e) => {
    config.location = e.target.value || "Marchand Ranch, Cañon City, CO";
    document.getElementById("wedding-location-preview").innerText = config.location;
    saveConfig();
  });

  document.getElementById("input-tagline").addEventListener("input", (e) => {
    config.tagline = e.target.value || DEFAULT_CONFIG.tagline;
    document.getElementById("wedding-tagline-preview").innerText = config.tagline;
    saveConfig();
  });

  document.getElementById("input-webhook").addEventListener("input", (e) => {
    config.webhookUrl = e.target.value.trim();
    saveConfig();
  });

  // Theme Picker
  document.querySelectorAll(".theme-opt").forEach(opt => {
    opt.addEventListener("click", () => {
      document.querySelectorAll(".theme-opt").forEach(o => o.classList.remove("active"));
      opt.classList.add("active");
      
      const chosenTheme = opt.getAttribute("data-theme-val");
      config.theme = chosenTheme;
      document.body.setAttribute("data-theme", chosenTheme);
      saveConfig();
      resetParticles();
    });
  });

  // RSVP Form submission
  const rsvpForm = document.getElementById("rsvp-form");
  rsvpForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const guestName = document.getElementById("guest-name").value.trim();
    const guestEmail = document.getElementById("guest-email").value.trim();
    const guestPhone = document.getElementById("guest-phone").value.trim();
    const guestAddress = document.getElementById("guest-address").value.trim();
    const guestAttendance = document.getElementById("guest-attendance").value;
    const guestPlusOne = document.getElementById("guest-plusone").checked;
    const guestKids = parseInt(document.getElementById("guest-kids").value, 10) || 0;

    if (!guestName || !guestEmail || !guestPhone || !guestAddress) return;

    const rsvpObj = {
      name: guestName,
      email: guestEmail,
      phone: guestPhone,
      address: guestAddress,
      status: guestAttendance,
      plusOne: guestPlusOne ? "Yes" : "No",
      kids: guestKids,
      timestamp: new Date().toLocaleString()
    };

    rsvps.push(rsvpObj);
    safeStorage.setItem("wedding_rsvps", JSON.stringify(rsvps));
    renderRSVPTable();

    // Send to Google Sheets if Webhook is defined
    if (config.webhookUrl) {
      fetch(config.webhookUrl, {
        method: "POST",
        mode: "no-cors",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(rsvpObj)
      }).catch(err => console.error("Error syncing with Google Sheets:", err));
    }

    // Show success state
    rsvpForm.style.display = "none";
    const successMsg = document.getElementById("rsvp-success-message");
    successMsg.style.display = "block";
    successMsg.innerHTML = `<strong>Thank you, ${escapeHtml(guestName)}!</strong><br>Your RSVP has been saved. We'll send update details to ${escapeHtml(guestEmail)}.`;
  });

  // RSVP CSV Export
  document.getElementById("export-csv-btn").addEventListener("click", exportRSVPsCSV);

  // Card Image Export
  document.getElementById("download-img-btn").addEventListener("click", downloadCardImage);

  // Photo Uploader Change
  document.getElementById("input-photo").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = function(event) {
        const couplePhoto2 = document.getElementById("couple-photo-2") || document.getElementById("couple-photo");
        if (couplePhoto2) {
          couplePhoto2.src = event.target.result;
        }
      };
      reader.readAsDataURL(file);
    }
  });

  // Lock Editor (Switch to Guest View)
  const lockEditorBtn = document.getElementById("lock-editor-btn");
  if (lockEditorBtn) {
    lockEditorBtn.addEventListener("click", () => {
      safeStorage.removeItem("wedding_is_editor");
      // Redirect to clean URL without parameters so editor is locked/hidden
      window.location.href = window.location.href.split('?')[0];
    });
  }

  // Setup Share Modal Dialog listeners
  setupShareEventListeners();
}

// --- Live Countdown ---
let countdownInterval = null;
function startCountdown() {
  if (countdownInterval) clearInterval(countdownInterval);

  const daysVal = document.getElementById("days");
  const hoursVal = document.getElementById("hours");
  const minutesVal = document.getElementById("minutes");
  const secondsVal = document.getElementById("seconds");

  function update() {
    const targetDate = parseDate(config.date).getTime();
    const now = new Date().getTime();
    const distance = targetDate - now;

    if (distance < 0) {
      daysVal.innerText = "00";
      hoursVal.innerText = "00";
      minutesVal.innerText = "00";
      secondsVal.innerText = "00";
      clearInterval(countdownInterval);
      return;
    }

    const d = Math.floor(distance / (1000 * 60 * 60 * 24));
    const h = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const m = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const s = Math.floor((distance % (1000 * 60)) / 1000);

    daysVal.innerText = String(d).padStart(2, '0');
    hoursVal.innerText = String(h).padStart(2, '0');
    minutesVal.innerText = String(m).padStart(2, '0');
    secondsVal.innerText = String(s).padStart(2, '0');
  }

  update();
  countdownInterval = setInterval(update, 1000);
}

// --- RSVP Table & Local Database Logic ---
function loadRSVPs() {
  const saved = safeStorage.getItem("wedding_rsvps");
  if (saved) {
    try {
      rsvps = JSON.parse(saved);
    } catch (e) {
      rsvps = [];
    }
  }
}

function renderRSVPTable() {
  const listBody = document.getElementById("rsvp-list-body");
  if (!listBody) return;
  listBody.innerHTML = "";

  if (rsvps.length === 0) {
    listBody.innerHTML = "<tr><td colspan='7' style='text-align:center;'>No RSVPs yet</td></tr>";
    return;
  }

  rsvps.forEach(rsvp => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(rsvp.name)}</td>
      <td>${escapeHtml(rsvp.email)}</td>
      <td>${escapeHtml(rsvp.phone || "")}</td>
      <td>${escapeHtml(rsvp.address || "")}</td>
      <td><span style="font-weight:600; color:var(--accent-color);">${escapeHtml(rsvp.status)}</span></td>
      <td>${escapeHtml(rsvp.plusOne || "No")}</td>
      <td>${escapeHtml(rsvp.kids !== undefined ? rsvp.kids : "0")}</td>
    `;
    listBody.appendChild(tr);
  });
}

function exportRSVPsCSV() {
  if (rsvps.length === 0) {
    alert("No RSVPs to export.");
    return;
  }

  let csvContent = "data:text/csv;charset=utf-8,Name,Email,Phone,Address,Attendance,Plus One,Kids,Timestamp\n";
  rsvps.forEach(r => {
    const row = `"${r.name.replace(/"/g, '""')}","${r.email.replace(/"/g, '""')}","${(r.phone || "").replace(/"/g, '""')}","${(r.address || "").replace(/"/g, '""')}","${r.status}","${r.plusOne || "No"}","${r.kids !== undefined ? r.kids : 0}","${r.timestamp}"`;
    csvContent += row + "\n";
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `wedding_rsvps_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// String Ensemble Melody System (Web Audio API)
const NOTE_FREQS = {
  // Octave 2 (Cello lower range)
  "C2": 65.41, "C#2": 69.30, "Db2": 69.30, "D2": 73.42, "D#2": 77.78, "Eb2": 77.78, "E2": 82.41, "F2": 87.31, "F#2": 92.50, "Gb2": 92.50, "G2": 98.00, "G#2": 103.83, "Ab2": 103.83, "A2": 110.00, "A#2": 116.54, "Bb2": 116.54, "B2": 123.47,
  // Octave 3 (Viola and Cello middle range)
  "C3": 130.81, "C#3": 138.59, "Db3": 138.59, "D3": 146.83, "D#3": 155.56, "Eb3": 155.56, "E3": 164.81, "F3": 174.61, "F#3": 185.00, "Gb3": 185.00, "G3": 196.00, "G#3": 207.65, "Ab3": 207.65, "A3": 220.00, "A#3": 233.08, "Bb3": 233.08, "B3": 246.94,
  // Octave 4 (Violin and Viola range)
  "C4": 261.63, "C#4": 277.18, "D4": 293.66, "D#4": 311.13, "Eb4": 311.13, "E4": 329.63, "F4": 349.23, "F#4": 369.99, "G4": 392.00, "G#4": 415.30, "A4": 440.00, "A#4": 466.16, "Bb4": 466.16, "B4": 493.88,
  // Octave 5 (Violin higher range)
  "C5": 523.25, "C#5": 554.37, "D5": 587.33, "D#5": 622.25, "Eb5": 622.25, "E5": 659.25, "F5": 698.46
};

// Violin melody line
const MELODY = [
  // Measure 1
  { note: "F4",  beat: 0.0, duration: 0.9 },
  { note: "Bb4", beat: 1.0, duration: 0.65 },
  { note: "Bb4", beat: 1.75, duration: 0.2 },
  // Measure 2
  { note: "Bb4", beat: 2.0, duration: 1.4 },
  // Measure 3
  { note: "F4",  beat: 4.0, duration: 0.9 },
  { note: "C5",  beat: 5.0, duration: 0.65 },
  { note: "A4",  beat: 5.75, duration: 0.2 },
  // Measure 4
  { note: "Bb4", beat: 6.0, duration: 1.4 },

  // Measure 5
  { note: "F4",  beat: 8.0, duration: 0.9 },
  { note: "Bb4", beat: 9.0, duration: 0.65 },
  { note: "Eb5", beat: 9.75, duration: 0.2 },
  // Measure 6
  { note: "Eb5", beat: 10.0, duration: 0.9 },
  { note: "D5",  beat: 11.0, duration: 0.4 },
  { note: "C5",  beat: 11.75, duration: 0.2 },
  // Measure 7
  { note: "Bb4", beat: 12.0, duration: 0.9 },
  { note: "A4",  beat: 13.0, duration: 0.65 },
  { note: "Bb4", beat: 13.75, duration: 0.2 },
  // Measure 8
  { note: "C5",  beat: 14.0, duration: 1.4 },

  // Measure 9
  { note: "F4",  beat: 16.0, duration: 0.9 },
  { note: "Bb4", beat: 17.0, duration: 0.65 },
  { note: "Bb4", beat: 17.75, duration: 0.2 },
  // Measure 10
  { note: "Bb4", beat: 18.0, duration: 1.4 },
  // Measure 11
  { note: "F4",  beat: 20.0, duration: 0.9 },
  { note: "C5",  beat: 21.0, duration: 0.65 },
  { note: "A4",  beat: 21.75, duration: 0.2 },
  // Measure 12
  { note: "Bb4", beat: 22.0, duration: 1.4 },

  // Measure 13
  { note: "F4",  beat: 24.0, duration: 0.9 },
  { note: "Bb4", beat: 25.0, duration: 0.65 },
  { note: "D5",  beat: 25.75, duration: 0.2 },
  // Measure 14
  { note: "F5",  beat: 26.0, duration: 0.9 },
  { note: "D5",  beat: 27.0, duration: 0.65 },
  { note: "Bb4", beat: 27.75, duration: 0.2 },
  // Measure 15
  { note: "G4",  beat: 28.0, duration: 0.9 },
  { note: "C5",  beat: 29.0, duration: 0.65 },
  { note: "D5",  beat: 29.75, duration: 0.2 },
  // Measure 16
  { note: "Bb4", beat: 30.0, duration: 1.4 }
];

// Viola harmony backing line
const VIOLA_LINE = [
  // Measure 1 & 2
  { note: "D3",  beat: 0.0, duration: 3.8 },
  // Measure 3 & 4
  { note: "C3",  beat: 4.0, duration: 1.8 },
  { note: "C3",  beat: 5.75, duration: 0.2 },
  { note: "D3",  beat: 6.0, duration: 1.8 },
  // Measure 5 & 6
  { note: "D3",  beat: 8.0, duration: 1.8 },
  { note: "G3",  beat: 10.0, duration: 1.8 },
  // Measure 7 & 8
  { note: "A3",  beat: 12.0, duration: 1.8 },
  { note: "A3",  beat: 14.0, duration: 1.8 },
  // Measure 9 & 10
  { note: "D3",  beat: 16.0, duration: 3.8 },
  // Measure 11 & 12
  { note: "C3",  beat: 20.0, duration: 1.8 },
  { note: "C3",  beat: 21.75, duration: 0.2 },
  { note: "D3",  beat: 22.0, duration: 1.8 },
  // Measure 13 & 14
  { note: "D3",  beat: 24.0, duration: 1.8 },
  { note: "F3",  beat: 26.0, duration: 1.8 },
  // Measure 15 & 16
  { note: "G3",  beat: 28.0, duration: 1.8 },
  { note: "D3",  beat: 30.0, duration: 1.8 }
];

// Cello bass backing line
const CELLO_LINE = [
  // Measure 1 & 2
  { note: "Bb2", beat: 0.0, duration: 3.8 },
  // Measure 3 & 4
  { note: "F2",  beat: 4.0, duration: 1.8 },
  { note: "F2",  beat: 5.75, duration: 0.2 },
  { note: "Bb2", beat: 6.0, duration: 1.8 },
  // Measure 5 & 6
  { note: "Bb2", beat: 8.0, duration: 1.8 },
  { note: "Eb2", beat: 10.0, duration: 1.8 },
  // Measure 7 & 8
  { note: "F2",  beat: 12.0, duration: 1.8 },
  { note: "F2",  beat: 14.0, duration: 1.8 },
  // Measure 9 & 10
  { note: "Bb2", beat: 16.0, duration: 3.8 },
  // Measure 11 & 12
  { note: "F2",  beat: 20.0, duration: 1.8 },
  { note: "F2",  beat: 21.75, duration: 0.2 },
  { note: "Bb2", beat: 22.0, duration: 1.8 },
  // Measure 13 & 14
  { note: "Bb2", beat: 24.0, duration: 1.8 },
  { note: "Bb2", beat: 26.0, duration: 1.8 },
  // Measure 15 & 16
  { note: "Eb2", beat: 28.0, duration: 1.8 },
  { note: "Bb2", beat: 30.0, duration: 1.8 }
];

const LOOP_DURATION_BEATS = 32;

function createCathedralImpulseResponse(audioCtx, duration = 3.6, decay = 2.4) {
  let sampleRate = audioCtx.sampleRate || 44100;
  if (isNaN(sampleRate) || sampleRate <= 0) {
    sampleRate = 44100;
  }
  const length = Math.max(1000, Math.floor(sampleRate * duration));

  try {
    const impulse = audioCtx.createBuffer(2, length, sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    let lastOutL = 0;
    let lastOutR = 0;

    for (let i = 0; i < length; i++) {
      // Generate stereo de-correlated white noise
      const noiseL = Math.random() * 2 - 1;
      const noiseR = Math.random() * 2 - 1;
      
      // Exponential envelope decay
      const envelope = Math.exp(-i / (sampleRate * (decay / 6.0)));
      
      // Simulate high-frequency absorption over time using a 1-pole lowpass filter
      // that gets progressively dampening as the tail decays
      const progress = i / length;
      const alpha = 0.04 + 0.92 * progress;
      
      lastOutL = (1 - alpha) * lastOutL + alpha * noiseL;
      lastOutR = (1 - alpha) * lastOutR + alpha * noiseR;

      left[i] = lastOutL * envelope * 0.70;
      right[i] = lastOutR * envelope * 0.70;
    }
    return impulse;
  } catch (err) {
    console.error("Failed to create impulse response buffer:", err);
    return null;
  }
}

function initAudioContext() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    
    // Safari AudioContext initialization workaround (Double-Initialize trick)
    try {
      const tempCtx = new AudioContextClass();
      if (tempCtx.close) {
        tempCtx.close().catch(() => {});
      }
    } catch (e) {
      console.warn("Safari double-initialize workaround temp context failed:", e);
    }

    audioCtx = new AudioContextClass();

    // Track state change to keep UI in sync if the OS suspends or interrupts the context
    let previousState = audioCtx.state;
    audioCtx.addEventListener("statechange", () => {
      const currentState = audioCtx.state;
      if (currentState === "suspended" || currentState === "interrupted") {
        if (previousState === "running" && isAudioPlaying) {
          isAudioPlaying = false;
          const audioBtn = document.getElementById("audio-btn");
          if (audioBtn) audioBtn.classList.remove("active");
          if (schedulerInterval) {
            clearInterval(schedulerInterval);
            schedulerInterval = null;
          }
          scheduledNodes.forEach(node => {
            try { node.stop(); } catch (e) {}
          });
          scheduledNodes = [];
        }
      }
      previousState = currentState;
    });
    
    // iOS Web Audio API Unlocker (play a tiny silent buffer matching sampleRate to avoid NotSupportedError on Safari)
    try {
      let unlockSR = audioCtx.sampleRate || 44100;
      if (isNaN(unlockSR) || unlockSR <= 0) {
        unlockSR = 44100;
      }
      const silentBuffer = audioCtx.createBuffer(1, 1, unlockSR);
      const silentSource = audioCtx.createBufferSource();
      silentSource.buffer = silentBuffer;
      silentSource.connect(audioCtx.destination);
      if (silentSource.start) silentSource.start(0);
    } catch (unlockErr) {
      console.warn("Failed to play silent Web Audio unlock buffer:", unlockErr);
    }
    
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.35;
    masterGain.connect(audioCtx.destination);

    // 1. Setup Procedural Cathedral Convolution Reverb Send Effect
    convolverNode = audioCtx.createConvolver();
    try {
      const impulseBuffer = createCathedralImpulseResponse(audioCtx, 4.0, 2.8);
      if (impulseBuffer) {
        convolverNode.buffer = impulseBuffer;
      }
    } catch (convolverErr) {
      console.warn("Failed to initialize convolver buffer statically:", convolverErr);
    }

    preDelayNode = audioCtx.createDelay(0.5);
    preDelayNode.delayTime.value = 0.050; // 50ms pre-delay

    reverbGain = audioCtx.createGain();
    reverbGain.gain.value = 0.32; // 32% wet mix

    // Connect convolution reverb chain
    preDelayNode.connect(convolverNode);
    convolverNode.connect(reverbGain);
    reverbGain.connect(masterGain);

    // 2. Setup Stereo Ping-Pong Delay as a subtle secondary echo texture
    delayNodeL = audioCtx.createDelay(1.0);
    delayNodeR = audioCtx.createDelay(1.0);
    
    delayNodeL.delayTime.value = 0.35;
    delayNodeR.delayTime.value = 0.50;
    
    feedbackGainL = audioCtx.createGain();
    feedbackGainR = audioCtx.createGain();
    
    feedbackGainL.gain.value = 0.40;
    feedbackGainR.gain.value = 0.40;
    
    delayNodeL.connect(feedbackGainL);
    feedbackGainL.connect(delayNodeR);
    
    delayNodeR.connect(feedbackGainR);
    feedbackGainR.connect(delayNodeL);
    
    let panDelayL = null;
    let panDelayR = null;
    try {
      if (audioCtx.createStereoPanner) {
        panDelayL = audioCtx.createStereoPanner();
        panDelayR = audioCtx.createStereoPanner();
      }
    } catch (e) {
      console.warn("Delay channel stereo panners failed to create/initialize:", e);
    }
    
    const delayDryWet = audioCtx.createGain();
    delayDryWet.gain.value = 0.06; // Subtle 6% wet ping-pong echo

    if (panDelayL && panDelayR) {
      panDelayL.pan.value = -0.8;
      panDelayR.pan.value = 0.8;
      
      delayNodeL.connect(panDelayL);
      panDelayL.connect(delayDryWet);
      
      delayNodeR.connect(panDelayR);
      panDelayR.connect(delayDryWet);
    } else {
      delayNodeL.connect(delayDryWet);
      delayNodeR.connect(delayDryWet);
    }
    
    delayDryWet.connect(masterGain);

    // 3. Setup Global Channel Strips (Consolidated click-free processing)
    // Violin Channel strip (L/R): Lowpass -> Highshelf EQ -> Lowshelf EQ -> Output
    violinFilterL = audioCtx.createBiquadFilter();
    violinFilterL.type = "lowpass";
    violinFilterL.frequency.value = 1400;
    violinFilterL.Q.value = 1.0;

    violinFilterR = audioCtx.createBiquadFilter();
    violinFilterR.type = "lowpass";
    violinFilterR.frequency.value = 1400;
    violinFilterR.Q.value = 1.0;

    const violinHighL = audioCtx.createBiquadFilter();
    violinHighL.type = "highshelf";
    violinHighL.frequency.value = 6000;
    violinHighL.gain.value = 3.5;

    const violinHighR = audioCtx.createBiquadFilter();
    violinHighR.type = "highshelf";
    violinHighR.frequency.value = 6000;
    violinHighR.gain.value = 3.5;

    const violinLowL = audioCtx.createBiquadFilter();
    violinLowL.type = "lowshelf";
    violinLowL.frequency.value = 200;
    violinLowL.gain.value = -4.0;

    const violinLowR = audioCtx.createBiquadFilter();
    violinLowR.type = "lowshelf";
    violinLowR.frequency.value = 200;
    violinLowR.gain.value = -4.0;

    violinFilterL.connect(violinHighL);
    violinHighL.connect(violinLowL);
    violinLowL.connect(masterGain);
    if (preDelayNode) violinLowL.connect(preDelayNode);

    violinFilterR.connect(violinHighR);
    violinHighR.connect(violinLowR);
    violinLowR.connect(masterGain);
    if (preDelayNode) violinLowR.connect(preDelayNode);

    // Viola Channel strip (L/R): Lowpass -> Mid Warmth EQ -> Output
    violaFilterL = audioCtx.createBiquadFilter();
    violaFilterL.type = "lowpass";
    violaFilterL.frequency.value = 950;
    violaFilterL.Q.value = 1.0;

    violaFilterR = audioCtx.createBiquadFilter();
    violaFilterR.type = "lowpass";
    violaFilterR.frequency.value = 950;
    violaFilterR.Q.value = 1.0;

    const violaPeakL = audioCtx.createBiquadFilter();
    violaPeakL.type = "peaking";
    violaPeakL.frequency.value = 250;
    violaPeakL.Q.value = 1.0;
    violaPeakL.gain.value = 2.5;

    const violaPeakR = audioCtx.createBiquadFilter();
    violaPeakR.type = "peaking";
    violaPeakR.frequency.value = 250;
    violaPeakR.Q.value = 1.0;
    violaPeakR.gain.value = 2.5;

    violaFilterL.connect(violaPeakL);
    violaPeakL.connect(masterGain);
    if (preDelayNode) violaPeakL.connect(preDelayNode);

    violaFilterR.connect(violaPeakR);
    violaPeakR.connect(masterGain);
    if (preDelayNode) violaPeakR.connect(preDelayNode);

    // Cello Channel strip (L/R): Lowpass -> Bass Boost EQ -> Highshelf EQ -> Output
    celloFilterL = audioCtx.createBiquadFilter();
    celloFilterL.type = "lowpass";
    celloFilterL.frequency.value = 650;
    celloFilterL.Q.value = 1.0;

    celloFilterR = audioCtx.createBiquadFilter();
    celloFilterR.type = "lowpass";
    celloFilterR.frequency.value = 650;
    celloFilterR.Q.value = 1.0;

    const celloPeakL = audioCtx.createBiquadFilter();
    celloPeakL.type = "peaking";
    celloPeakL.frequency.value = 90;
    celloPeakL.Q.value = 1.2;
    celloPeakL.gain.value = 4.5;

    const celloPeakR = audioCtx.createBiquadFilter();
    celloPeakR.type = "peaking";
    celloPeakR.frequency.value = 90;
    celloPeakR.Q.value = 1.2;
    celloPeakR.gain.value = 4.5;

    const celloHighL = audioCtx.createBiquadFilter();
    celloHighL.type = "highshelf";
    celloHighL.frequency.value = 4000;
    celloHighL.gain.value = -3.0;

    const celloHighR = audioCtx.createBiquadFilter();
    celloHighR.type = "highshelf";
    celloHighR.frequency.value = 4000;
    celloHighR.gain.value = -3.0;

    celloFilterL.connect(celloPeakL);
    celloPeakL.connect(celloHighL);
    celloHighL.connect(masterGain);
    if (preDelayNode) celloHighL.connect(preDelayNode);

    celloFilterR.connect(celloPeakR);
    celloPeakR.connect(celloHighR);
    celloHighR.connect(masterGain);
    if (preDelayNode) celloHighR.connect(preDelayNode);

    // 4. Setup Global Bowing Pressure Modulation LFO
    globalBowingLFO = audioCtx.createOscillator();
    globalBowingLFO.type = "sine";
    globalBowingLFO.frequency.value = 0.28; // 0.28Hz slow breathing

    globalBowingGain = audioCtx.createGain();
    globalBowingGain.gain.value = 110; // Modulate cutoffs ±110Hz

    globalBowingLFO.connect(globalBowingGain);
    
    // Connect modulator to all Lowpass filter cutoffs
    globalBowingGain.connect(violinFilterL.frequency);
    globalBowingGain.connect(violinFilterR.frequency);
    globalBowingGain.connect(violaFilterL.frequency);
    globalBowingGain.connect(violaFilterR.frequency);
    globalBowingGain.connect(celloFilterL.frequency);
    globalBowingGain.connect(celloFilterR.frequency);

    globalBowingLFO.start();
  } catch (err) {
    console.error("Failed to initialize Web Audio API:", err);
  }
}

function triggerStringNoteScheduled(freq, startTime, duration, instrument = "violin") {
  if (!audioCtx) return null;

  const oscillators = [];

  // Detuning factors and gains for 3 chorus-detuned voice oscillators to optimize mobile Safari performance
  const detunes = [1.0, 0.996, 1.004];
  const relativeGains = [0.26, 0.18, 0.18];

  // Set instrument-specific parameters
  let attackTime = 0.22;
  let releaseTime = 0.85;
  let vibratoDepth = 0.004; // subtle pitch depth
  let vibratoSpeed = 5.6;
  let vibratoDelay = 0.35;
  let instrumentGain = 0.16;

  if (instrument === "cello") {
    attackTime = 0.38;
    releaseTime = 1.30;
    vibratoDepth = 0.0035;
    vibratoSpeed = 4.8;
    vibratoDelay = 0.5;
    instrumentGain = 0.20;
  } else if (instrument === "viola") {
    attackTime = 0.28;
    releaseTime = 1.00;
    vibratoDepth = 0.004;
    vibratoSpeed = 5.2;
    vibratoDelay = 0.4;
    instrumentGain = 0.15;
  } else {
    // violin
    attackTime = 0.18;
    releaseTime = 0.75;
    vibratoDepth = 0.0045;
    vibratoSpeed = 5.8;
    vibratoDelay = 0.25;
    instrumentGain = 0.13;
  }

  // 1. Natural Vibrato LFO with delayed onset (humanized expression)
  const lfo = audioCtx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.setValueAtTime(vibratoSpeed, startTime);

  const lfoGain = audioCtx.createGain();
  lfoGain.gain.setValueAtTime(0, startTime);
  lfoGain.gain.setValueAtTime(0, startTime + vibratoDelay * 0.4);
  lfoGain.gain.linearRampToValueAtTime(freq * vibratoDepth, startTime + vibratoDelay);
  lfoGain.gain.setValueAtTime(freq * vibratoDepth, startTime + duration);
  lfoGain.gain.linearRampToValueAtTime(0, startTime + duration + releaseTime);
  lfo.connect(lfoGain);

  // Master Gain for Left/Right channels (Smooth Linear Attack & Release Envelopes)
  const gainL = audioCtx.createGain();
  const gainR = audioCtx.createGain();

  gainL.gain.setValueAtTime(0, startTime);
  gainL.gain.linearRampToValueAtTime(instrumentGain, startTime + attackTime);
  gainL.gain.setValueAtTime(instrumentGain, startTime + duration);
  gainL.gain.linearRampToValueAtTime(0, startTime + duration + releaseTime);

  gainR.gain.setValueAtTime(0, startTime);
  gainR.gain.linearRampToValueAtTime(instrumentGain, startTime + attackTime);
  gainR.gain.setValueAtTime(instrumentGain, startTime + duration);
  gainR.gain.linearRampToValueAtTime(0, startTime + duration + releaseTime);

  // Stereo panning to position instruments in the virtual orchestra space
  let panL = null;
  let panR = null;
  try {
    if (audioCtx.createStereoPanner) {
      panL = audioCtx.createStereoPanner();
      panR = audioCtx.createStereoPanner();
    }
  } catch (e) {
    console.warn("Note stereo panners failed to create/initialize:", e);
  }
  
  let panPosL = -0.3;
  let panPosR = 0.3;
  if (instrument === "cello") {
    panPosL = 0.25;
    panPosR = 0.45;
  } else if (instrument === "viola") {
    panPosL = -0.1;
    panPosR = 0.2;
  } else {
    panPosL = -0.45;
    panPosR = -0.25;
  }

  if (panL) panL.pan.setValueAtTime(panPosL, startTime);
  if (panR) panR.pan.setValueAtTime(panPosR, startTime);

  // Connect panned envelope outputs to the global mixing channel strips and delays
  if (panL) {
    gainL.connect(panL);
    if (instrument === "cello") {
      panL.connect(celloFilterL);
    } else if (instrument === "viola") {
      panL.connect(violaFilterL);
    } else {
      panL.connect(violinFilterL);
    }
    if (delayNodeL) panL.connect(delayNodeL);
  } else {
    if (instrument === "cello") {
      gainL.connect(celloFilterL);
    } else if (instrument === "viola") {
      gainL.connect(violaFilterL);
    } else {
      gainL.connect(violinFilterL);
    }
    if (delayNodeL) gainL.connect(delayNodeL);
  }

  if (panR) {
    gainR.connect(panR);
    if (instrument === "cello") {
      panR.connect(celloFilterR);
    } else if (instrument === "viola") {
      panR.connect(violaFilterR);
    } else {
      panR.connect(violinFilterR);
    }
    if (delayNodeR) panR.connect(delayNodeR);
  } else {
    if (instrument === "cello") {
      gainR.connect(celloFilterR);
    } else if (instrument === "viola") {
      gainR.connect(violaFilterR);
    } else {
      gainR.connect(violinFilterR);
    }
    if (delayNodeR) gainR.connect(delayNodeR);
  }

  const stopTime = startTime + duration + releaseTime + 0.1;

  // 2. Synthesize Bow Scrape Noise Transient (~70ms bandpass white noise burst)
  let sampleRate = audioCtx.sampleRate || 44100;
  if (isNaN(sampleRate) || sampleRate <= 0) {
    sampleRate = 44100;
  }
  const noiseLength = Math.max(100, Math.floor(sampleRate * 0.07));
  
  try {
    const noiseBuffer = audioCtx.createBuffer(1, noiseLength, sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseLength; i++) {
      noiseData[i] = Math.random() * 2 - 1;
    }

    const noiseNode = audioCtx.createBufferSource();
    noiseNode.buffer = noiseBuffer;

    const noiseFilter = audioCtx.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.setValueAtTime(1100, startTime);
    noiseFilter.Q.setValueAtTime(1.5, startTime);

    const noiseGain = audioCtx.createGain();
    noiseGain.gain.setValueAtTime(0, startTime);
    noiseGain.gain.linearRampToValueAtTime(instrumentGain * 0.14, startTime + 0.005);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.06);

    noiseNode.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(gainL);
    noiseGain.connect(gainR);

    noiseNode.start(startTime);
    noiseNode.stop(startTime + 0.08);
    noiseNode.stopTime = startTime + 0.08;
    oscillators.push(noiseNode);
  } catch (err) {
    console.error("Failed to synthesize bow scrape noise transient:", err);
  }

  // 3. Triangle Core Voice (warm acoustic body core)
  const oscTri = audioCtx.createOscillator();
  oscTri.type = "triangle";
  oscTri.frequency.setValueAtTime(freq, startTime);
  lfoGain.connect(oscTri.frequency);

  const voiceGainTri = audioCtx.createGain();
  voiceGainTri.gain.setValueAtTime(0.22, startTime);
  oscTri.connect(voiceGainTri);

  voiceGainTri.connect(gainL);
  voiceGainTri.connect(gainR);

  oscTri.start(startTime);
  oscTri.stop(stopTime);
  oscTri.stopTime = stopTime;
  oscillators.push(oscTri);

  // 4. Detuned Sawtooth Voices (provides organic bowed friction and brilliance)
  detunes.forEach((detune, idx) => {
    const osc = audioCtx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(freq * detune, startTime);
    lfoGain.connect(osc.frequency);

    const voiceGain = audioCtx.createGain();
    voiceGain.gain.setValueAtTime(relativeGains[idx], startTime);
    osc.connect(voiceGain);

    if (idx % 2 === 0) {
      voiceGain.connect(gainL);
    } else {
      voiceGain.connect(gainR);
    }

    osc.start(startTime);
    osc.stop(stopTime);
    osc.stopTime = stopTime;
    oscillators.push(osc);
  });

  // 5. Third Harmonic Sine Voice (adds hollow acoustic depth)
  const oscSine = audioCtx.createOscillator();
  oscSine.type = "sine";
  oscSine.frequency.setValueAtTime(freq * 3.0, startTime);
  lfoGain.connect(oscSine.frequency);

  const voiceGainSine = audioCtx.createGain();
  voiceGainSine.gain.setValueAtTime(0.06, startTime);
  oscSine.connect(voiceGainSine);

  voiceGainSine.connect(gainL);
  voiceGainSine.connect(gainR);

  oscSine.start(startTime);
  oscSine.stop(stopTime);
  oscSine.stopTime = stopTime;
  oscillators.push(oscSine);

  lfo.start(startTime);
  lfo.stop(stopTime);
  lfo.stopTime = stopTime;
  oscillators.push(lfo);

  return oscillators;
}

function startScheduler() {
  const tempo = 84;
  const beatDuration = 60 / tempo;
  const loopLengthTime = LOOP_DURATION_BEATS * beatDuration;
  const scheduleAheadTime = 0.250; // schedule 250ms in advance
  const schedulerIntervalMs = 50;  // check every 50ms


  // Initialize loop timeline pointer
  let currentLoopStartAudioTime = audioCtx.currentTime + 0.05;

  function scheduleEvents() {
    const now = audioCtx.currentTime;
    const lookaheadTime = now + scheduleAheadTime;

    // Helper to find and schedule notes for a line
    const scheduleLineNotes = (line, instrument) => {
      line.forEach(step => {
        // We check two potential loop iterations for scheduling:
        // 1. The current loop iteration:
        const t1 = currentLoopStartAudioTime + step.beat * beatDuration;
        // 2. The next loop iteration (in case we are near the boundary and scheduling ahead):
        const t2 = currentLoopStartAudioTime + loopLengthTime + step.beat * beatDuration;

        [t1, t2].forEach(noteTime => {
          // Schedule only if the note time is within our lookahead window
          if (noteTime >= now && noteTime < lookaheadTime) {
            // Check if this note was already scheduled for this specific loop iteration
            if (!step.scheduledTimes) step.scheduledTimes = [];
            if (step.scheduledTimes.some(t => Math.abs(t - noteTime) < 0.01)) {
              return; // already scheduled
            }

            step.scheduledTimes.push(noteTime);

            // Humanize timing (±6ms) and pitch (±1.5 cents)
            const timeOffset = (Math.random() - 0.5) * 0.012;
            const pitchOffset = 1 + (Math.random() - 0.5) * 0.0015;
            const finalNoteTime = noteTime + timeOffset;
            const freq = NOTE_FREQS[step.note] * pitchOffset;
            const duration = step.duration * beatDuration;

            if (freq) {
              const nodes = triggerStringNoteScheduled(freq, finalNoteTime, duration, instrument);
              if (nodes) {
                scheduledNodes.push(...nodes);
              }
            }
          }
        });
      });
    };

    // Schedule each instrument part
    scheduleLineNotes(MELODY, "violin");
    scheduleLineNotes(VIOLA_LINE, "viola");
    scheduleLineNotes(CELLO_LINE, "cello");

    // Clean up old note times to keep memory footprint flat
    const cleanupThreshold = now - 10;
    const cleanTimes = line => {
      line.forEach(step => {
        if (step.scheduledTimes) {
          step.scheduledTimes = step.scheduledTimes.filter(t => t > cleanupThreshold);
        }
      });
    };
    cleanTimes(MELODY);
    cleanTimes(VIOLA_LINE);
    cleanTimes(CELLO_LINE);

    // Filter scheduledNodes array to prevent memory leaks
    scheduledNodes = scheduledNodes.filter(node => {
      return node.stopTime && node.stopTime > now;
    });

    // Advance the loop start time pointer once we cross the boundary of the current loop
    // A while loop is used to robustly catch up if the tab was suspended/backgrounded
    while (now >= currentLoopStartAudioTime + loopLengthTime) {
      currentLoopStartAudioTime += loopLengthTime;
    }
  }

  // Run first execution immediately, then poll
  scheduleEvents();
  schedulerInterval = setInterval(scheduleEvents, schedulerIntervalMs);
}

function toggleAudio() {
  const audioBtn = document.getElementById("audio-btn");

  if (isAudioPlaying) {
    isAudioPlaying = false;
    audioBtn.classList.remove("active");
    
    // Clear lookahead scheduler interval
    if (schedulerInterval) {
      clearInterval(schedulerInterval);
      schedulerInterval = null;
    }
    
    // Stop all active scheduled nodes
    scheduledNodes.forEach(node => {
      try {
        node.stop();
      } catch (e) {
        // Already stopped
      }
    });
    scheduledNodes = [];
  } else {
    isAudioPlaying = true;
    audioBtn.classList.add("active");
    
    // iOS Silent Switch Bypass: Play a tiny silent WAV via HTMLAudioElement to route Web Audio to the main media output
    try {
      const silentAudio = new Audio();
      silentAudio.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAAA";
      silentAudio.play().catch(e => console.log("Silent switch bypass rejected:", e));
    } catch (err) {
      console.log("Silent switch bypass omitted:", err);
    }

    if (audioCtx && audioCtx.state === "closed") {
      audioCtx = null;
    }

    if (!audioCtx) {
      initAudioContext();
    }
    
    scheduledNodes = [];
    
    if (audioCtx && audioCtx.state !== "running") {
      audioCtx.resume().then(() => {
        startScheduler();
      }).catch(err => {
        console.error("Failed to resume AudioContext on mobile:", err);
        startScheduler(); // Fallback start anyway
      });
    } else {
      startScheduler();
    }
  }
}

// --- Canvas Dynamic Particles ---
function initCanvas() {
  canvas = document.getElementById("particle-canvas");
  ctx = canvas.getContext("2d");
  
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  loopParticles();
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  resetParticles();
}

function resetParticles() {
  if (!canvas) return;
  particles = [];
  const maxParticles = window.innerWidth < 600 ? 25 : 55;
  const theme = config.theme;

  for (let i = 0; i < maxParticles; i++) {
    particles.push(createParticle(theme, true));
  }
}

function createParticle(theme, randomizeY = false) {
  const w = canvas.width;
  const h = canvas.height;

  const particle = {
    x: Math.random() * w,
    y: randomizeY ? Math.random() * h : -20, // Spawn offscreen or randomly initially
    speedY: 0.3 + Math.random() * 0.6,
    speedX: (Math.random() - 0.5) * 0.4,
    size: 1 + Math.random() * 3,
    alpha: 0.1 + Math.random() * 0.8,
    angle: Math.random() * Math.PI * 2,
    angleVelocity: (Math.random() - 0.5) * 0.02,
    wiggleAmp: 0.2 + Math.random() * 0.8,
    wiggleSpeed: 0.005 + Math.random() * 0.01,
    wiggleTime: Math.random() * 100,
    pulseSpeed: 0.02 + Math.random() * 0.03,
    color: ""
  };

  if (theme === "midnight") {
    // twining glowing stars
    particle.size = 1 + Math.random() * 2.5;
    particle.speedY = 0.02 + Math.random() * 0.06; // barely moving down
    particle.speedX = (Math.random() - 0.5) * 0.03;
    particle.color = `rgba(165, 180, 252, ${particle.alpha})`;
  } else if (theme === "forest") {
    // Eucalyptus leaves
    particle.size = 6 + Math.random() * 12; // larger leaf shape
    particle.speedY = 0.5 + Math.random() * 0.8;
    particle.speedX = -0.2 - Math.random() * 0.4; // drift slightly left
    particle.color = `rgba(167, 243, 208, ${0.15 + Math.random() * 0.3})`;
  } else {
    // Classic ivory gold sparkles
    particle.size = 1.5 + Math.random() * 3.5;
    particle.speedY = 0.2 + Math.random() * 0.5;
    particle.color = `rgba(197, 160, 89, ${0.2 + Math.random() * 0.55})`;
  }

  return particle;
}

function loopParticles() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  const theme = config.theme;
  particles.forEach((p, idx) => {
    // Update movement
    p.y += p.speedY;
    p.wiggleTime += p.wiggleSpeed;
    p.x += p.speedX + Math.sin(p.wiggleTime) * p.wiggleAmp;
    p.angle += p.angleVelocity;

    // Draw
    ctx.save();
    if (theme === "midnight") {
      // twinkling stars
      p.alpha += Math.sin(p.wiggleTime * 1.5) * 0.01;
      if (p.alpha < 0.1) p.alpha = 0.1;
      if (p.alpha > 0.95) p.alpha = 0.95;

      ctx.fillStyle = `rgba(248, 250, 252, ${p.alpha})`;
      ctx.beginPath();
      // Draw a small four-point star shape
      const cx = p.x;
      const cy = p.y;
      const spikes = 4;
      const outerRadius = p.size;
      const innerRadius = p.size * 0.35;
      let rot = Math.PI / 2 * 3;
      let x = cx;
      let y = cy;
      const step = Math.PI / spikes;

      ctx.beginPath();
      ctx.moveTo(cx, cy - outerRadius);
      for (let i = 0; i < spikes; i++) {
        x = cx + Math.cos(rot) * outerRadius;
        y = cy + Math.sin(rot) * outerRadius;
        ctx.lineTo(x, y);
        rot += step;

        x = cx + Math.cos(rot) * innerRadius;
        y = cy + Math.sin(rot) * innerRadius;
        ctx.lineTo(x, y);
        rot += step;
      }
      ctx.lineTo(cx, cy - outerRadius);
      ctx.closePath();
      // add a glowing glow
      ctx.shadowBlur = 4;
      ctx.shadowColor = "rgba(165, 180, 252, 0.6)";
      ctx.fill();

    } else if (theme === "forest") {
      // eucalyptus leaf drawing
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      
      // Draw simple organic leaf shape
      ctx.moveTo(0, -p.size);
      ctx.quadraticCurveTo(p.size * 0.4, 0, 0, p.size);
      ctx.quadraticCurveTo(-p.size * 0.4, 0, 0, -p.size);
      ctx.fill();

    } else {
      // Classic Gold dust circles with soft glow
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.shadowBlur = p.size > 2.5 ? 3 : 0;
      ctx.shadowColor = "rgba(197, 160, 89, 0.4)";
      ctx.fill();
    }
    ctx.restore();

    // Reset if particle moves out of viewport
    if (p.y > canvas.height + 20 || p.x < -20 || p.x > canvas.width + 20) {
      particles[idx] = createParticle(theme, false);
    }
  });

  animationId = requestAnimationFrame(loopParticles);
}

// --- Shareable Image Exporter (Canvas) ---
function downloadCardImage() {
  const canvasImg = document.createElement("canvas");
  canvasImg.width = 1200;
  canvasImg.height = 1600;
  const c = canvasImg.getContext("2d");

  const theme = config.theme;
  
  // Set backgrounds
  let bgGradient = c.createLinearGradient(0, 0, 0, 1600);
  let accentColor = "#c5a059";
  let textColor = "#2d2a26";
  let secColor = "#5c5852";
  let borderAlpha = 0.25;

  if (theme === "midnight") {
    bgGradient.addColorStop(0, "#0a0b12");
    bgGradient.addColorStop(1, "#121422");
    accentColor = "#a5b4fc";
    textColor = "#f8fafc";
    secColor = "#cbd5e1";
    borderAlpha = 0.25;
  } else if (theme === "forest") {
    bgGradient.addColorStop(0, "#141c18");
    bgGradient.addColorStop(1, "#1d2822");
    accentColor = "#a7f3d0";
    textColor = "#f4fbf7";
    secColor = "#cbdad1";
    borderAlpha = 0.25;
  } else {
    bgGradient.addColorStop(0, "#fbf9f4");
    bgGradient.addColorStop(1, "#f4efe6");
    accentColor = "#c5a059";
    textColor = "#2d2a26";
    secColor = "#5c5852";
    borderAlpha = 0.25;
  }

  c.fillStyle = bgGradient;
  c.fillRect(0, 0, 1200, 1600);

  // Outer gold borders
  c.strokeStyle = accentColor;
  c.lineWidth = 2;
  c.strokeRect(30, 30, 1140, 1540);

  // Inner dashed borders
  c.strokeStyle = `rgba(${theme === "midnight" ? "165,180,252" : theme === "forest" ? "167,243,208" : "197,160,89"}, ${borderAlpha})`;
  c.lineWidth = 1;
  c.setLineDash([8, 8]);
  c.strokeRect(50, 50, 1100, 1500);
  c.setLineDash([]); // Reset

  // Draw corner illustrations
  drawCanvasDecorations(c, theme, accentColor);

  // Draw texts
  c.textAlign = "center";
  c.textBaseline = "middle";

  // Pre-title: "SAVE THE DATE"
  c.fillStyle = accentColor;
  c.font = "bold 26px Montserrat, sans-serif";
  c.fillText("SAVE THE DATE", 600, 110);

  // Couple names: Sophia & Julian
  c.fillStyle = textColor;
  c.font = "300 90px 'Cormorant Garamond', serif";
  
  const nameParts = config.names.split(/\s+&\s+|\s+and\s+/i);
  if (nameParts.length === 2) {
    c.fillText(nameParts[0], 600, 200);
    
    c.fillStyle = accentColor;
    c.font = "italic 300 64px 'Cormorant Garamond', serif";
    c.fillText("&", 600, 270);
    
    c.fillStyle = textColor;
    c.font = "300 90px 'Cormorant Garamond', serif";
    c.fillText(nameParts[1], 600, 340);
  } else {
    c.fillText(config.names, 600, 270);
  }

  // Tagline text
  c.fillStyle = secColor;
  c.font = "300 28px Montserrat, sans-serif";
  const taglineWords = config.tagline.split(" ");
  let line = "";
  let tagY = 405;
  for (let n = 0; n < taglineWords.length; n++) {
    let testLine = line + taglineWords[n] + " ";
    let metrics = c.measureText(testLine);
    if (metrics.width > 800 && n > 0) {
      c.fillText(line, 600, tagY);
      line = taglineWords[n] + " ";
      tagY += 40;
    } else {
      line = testLine;
    }
  }
  c.fillText(line, 600, tagY);

  // Draw the Photo with Arched Clip Mask
  const img = document.getElementById("couple-photo-1") || document.getElementById("couple-photo");
  if (img && img.naturalWidth > 0) {
    const px = 350;
    const py = 480;
    const pw = 500;
    const ph = 620;
    const r = 250; // top rounded radius

    c.save();
    c.beginPath();
    c.moveTo(px, py + ph);
    c.lineTo(px, py + r);
    c.arc(px + r, py + r, r, Math.PI, 0, false);
    c.lineTo(px + pw, py + ph);
    c.closePath();
    c.clip();

    c.drawImage(img, px, py, pw, ph);
    c.restore();

    // Photo Border
    c.strokeStyle = accentColor;
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(px, py + ph);
    c.lineTo(px, py + r);
    c.arc(px + r, py + r, r, Math.PI, 0, false);
    c.lineTo(px + pw, py + ph);
    c.closePath();
    c.stroke();
  }

  // Divider Line and Heart
  c.strokeStyle = `rgba(${theme === "midnight" ? "165,180,252" : theme === "forest" ? "167,243,208" : "197,160,89"}, ${borderAlpha})`;
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(480, 1140);
  c.lineTo(720, 1140);
  c.stroke();

  // Heart icon
  c.fillStyle = accentColor;
  c.beginPath();
  const hx = 600, hy = 1140;
  c.arc(hx - 10, hy - 10, 10, 0, Math.PI, true);
  c.arc(hx + 10, hy - 10, 10, 0, Math.PI, true);
  c.lineTo(hx, hy + 10);
  c.closePath();
  c.fill();

  // Wedding Date
  c.fillStyle = textColor;
  c.font = "300 48px 'Cormorant Garamond', serif";
  c.fillText(formatDate(config.date), 600, 1200);

  // Location
  c.fillStyle = secColor;
  c.font = "400 26px Montserrat, sans-serif";
  c.fillText(config.location.toUpperCase(), 600, 1270);

  // Invitation info
  c.fillStyle = accentColor;
  c.font = "300 22px Montserrat, sans-serif";
  c.fillText("FORMAL INVITATION TO FOLLOW", 600, 1370);

  // Website URL
  c.fillStyle = textColor;
  c.font = "italic 300 24px 'Cormorant Garamond', serif";
  c.fillText("sofiaandrussellaregettingmarried.vercel.app", 600, 1445);

  // Convert to image and trigger download
  const link = document.createElement("a");
  link.download = `save_the_date_${config.names.toLowerCase().replace(/[^a-z0-9]/g, "_")}.png`;
  link.href = canvasImg.toDataURL("image/png");
  link.click();
}

function drawCanvasDecorations(c, theme, accentColor) {
  c.save();
  c.fillStyle = accentColor;
  c.strokeStyle = accentColor;
  
  if (theme === "midnight") {
    // Twinkling stars in corners
    drawStar(c, 150, 150, 30, 12);
    drawStar(c, 1050, 150, 35, 14);
    drawStar(c, 150, 1450, 25, 10);
    drawStar(c, 1050, 1450, 40, 16);
    
    drawStar(c, 250, 300, 10, 4);
    drawStar(c, 950, 320, 12, 5);
    drawStar(c, 300, 1300, 14, 5);
    drawStar(c, 900, 1280, 10, 4);
  } else if (theme === "forest") {
    // Sage branches
    drawEucalyptusBranch(c, 100, 100, Math.PI / 4, 1.2);
    drawEucalyptusBranch(c, 1100, 100, Math.PI * 3/4, 1.2);
    drawEucalyptusBranch(c, 100, 1500, -Math.PI / 4, 1.2);
    drawEucalyptusBranch(c, 1100, 1500, -Math.PI * 3/4, 1.2);
  } else {
    // Ivory floral
    drawGoldBranch(c, 120, 120, Math.PI / 4);
    drawGoldBranch(c, 1080, 120, Math.PI * 3/4);
    drawGoldBranch(c, 120, 1480, -Math.PI / 4);
    drawGoldBranch(c, 1080, 1480, -Math.PI * 3/4);
  }
  c.restore();
}

function drawStar(c, cx, cy, outerRadius, innerRadius) {
  const spikes = 4;
  let rot = Math.PI / 2 * 3;
  let x = cx;
  let y = cy;
  const step = Math.PI / spikes;

  c.beginPath();
  c.moveTo(cx, cy - outerRadius);
  for (let i = 0; i < spikes; i++) {
    x = cx + Math.cos(rot) * outerRadius;
    y = cy + Math.sin(rot) * outerRadius;
    c.lineTo(x, y);
    rot += step;

    x = cx + Math.cos(rot) * innerRadius;
    y = cy + Math.sin(rot) * innerRadius;
    c.lineTo(x, y);
    rot += step;
  }
  c.lineTo(cx, cy - outerRadius);
  c.closePath();
  c.fill();
}

function drawGoldBranch(c, x, y, rotation) {
  c.save();
  c.translate(x, y);
  c.rotate(rotation);
  
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(0, 0);
  c.quadraticCurveTo(80, 80, 160, 160);
  c.stroke();
  
  const leafPositions = [40, 80, 120, 160];
  leafPositions.forEach((pos) => {
    drawLeaf(c, pos - 15, pos - 5, pos - 35, pos + 15, 25);
    drawLeaf(c, pos + 5, pos - 15, pos + 25, pos - 35, 25);
  });
  
  c.restore();
}

function drawEucalyptusBranch(c, x, y, rotation, scale) {
  c.save();
  c.translate(x, y);
  c.rotate(rotation);
  c.scale(scale, scale);
  
  c.lineWidth = 4;
  c.beginPath();
  c.moveTo(0, 0);
  c.quadraticCurveTo(100, 50, 200, 200);
  c.stroke();
  
  const leafPos = [50, 100, 150, 200];
  leafPos.forEach(pos => {
    c.beginPath();
    c.arc(pos - 10, pos + 10, 30, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.arc(pos + 10, pos - 10, 25, 0, Math.PI * 2);
    c.fill();
  });
  
  c.restore();
}

function drawLeaf(c, sx, sy, ex, ey, size) {
  c.beginPath();
  c.moveTo(sx, sy);
  c.quadraticCurveTo((sx + ex)/2 + size, (sy + ey)/2 - size, ex, ey);
  c.quadraticCurveTo((sx + ex)/2 - size, (sy + ey)/2 + size, sx, sy);
  c.fill();
}

// --- Share Modal Dialog Event Listeners & Actions ---
function setupShareEventListeners() {
  const shareModal = document.getElementById("share-modal");
  const shareBtn = document.getElementById("share-btn");
  const adminShareBtn = document.getElementById("admin-share-btn");
  const closeShareBtn = document.getElementById("close-share-btn");
  const shareLinkInput = document.getElementById("share-link-input");

  function getCleanShareUrl() {
    // Return clean URL without query parameters like ?edit=true or ?admin=true
    return window.location.href.split('?')[0];
  }

  function openShareModal() {
    if (!shareModal) return;
    shareLinkInput.value = getCleanShareUrl();
    shareModal.showModal();
    // Trigger CSS opacity and scale animations via simple flow repaint/class
    setTimeout(() => {
      shareModal.classList.add("open");
    }, 10);
  }

  function closeShareModal() {
    if (!shareModal) return;
    shareModal.classList.remove("open");
    // Wait for the transition duration to finish before closing natively
    setTimeout(() => {
      shareModal.close();
    }, 300);
  }

  if (shareBtn) shareBtn.addEventListener("click", openShareModal);
  if (adminShareBtn) adminShareBtn.addEventListener("click", openShareModal);
  if (closeShareBtn) closeShareBtn.addEventListener("click", closeShareModal);

  // Close when clicking dialog backdrop
  if (shareModal) {
    shareModal.addEventListener("click", (e) => {
      const rect = shareModal.getBoundingClientRect();
      const isInDialog = (
        rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
        rect.left <= e.clientX && e.clientX <= rect.left + rect.width
      );
      if (!isInDialog) {
        closeShareModal();
      }
    });
  }

  // Share via native SMS (mobile-friendly)
  const smsBtn = document.getElementById("share-sms-btn");
  if (smsBtn) {
    smsBtn.addEventListener("click", () => {
      const textMessage = "Sofia & Russell's Wedding Save the Date! 📅 October 8, 2026. View details and RSVP at: https://sofiaandrussellaregettingmarried.vercel.app/";
      window.open(`sms:?&body=${encodeURIComponent(textMessage)}`, "_blank");
    });
  }

  // Share via native Email
  const emailBtn = document.getElementById("share-email-btn");
  if (emailBtn) {
    emailBtn.addEventListener("click", () => {
      const subject = "Save the Date: Sofia & Russell's Wedding! 💌";
      const bodyMessage = "Sofia & Russell's Wedding Save the Date! 📅 October 8, 2026. View details and RSVP at: https://sofiaandrussellaregettingmarried.vercel.app/";
      window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyMessage)}`, "_blank");
    });
  }

  // Copy Link (modal grid button and inline copy button)
  function copyLinkText(buttonEl) {
    const shareUrl = getCleanShareUrl();
    navigator.clipboard.writeText(shareUrl).then(() => {
      const originalText = buttonEl.innerHTML;
      buttonEl.innerHTML = "Copied! 📋";
      buttonEl.style.background = "#10b981"; // Success Green HSL background
      buttonEl.style.borderColor = "#10b981";
      buttonEl.style.color = "#ffffff";
      
      setTimeout(() => {
        buttonEl.innerHTML = originalText;
        buttonEl.style.background = "";
        buttonEl.style.borderColor = "";
        buttonEl.style.color = "";
      }, 2000);
    }).catch(err => {
      console.error("Failed to copy link: ", err);
      // Fallback copy logic for older devices
      shareLinkInput.select();
      document.execCommand("copy");
      buttonEl.innerHTML = "Copied! 📋";
      setTimeout(() => {
        buttonEl.innerHTML = originalText;
      }, 2000);
    });
  }

  const copyBtn = document.getElementById("share-copy-btn");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => copyLinkText(copyBtn));
  }

  const copyInlineBtn = document.getElementById("share-link-copy-inline");
  if (copyInlineBtn) {
    copyInlineBtn.addEventListener("click", () => copyLinkText(copyInlineBtn));
  }

  // Download PNG option
  const downloadBtn = document.getElementById("share-download-btn");
  if (downloadBtn) {
    downloadBtn.addEventListener("click", () => {
      closeShareModal();
      downloadCardImage();
    });
  }
}
