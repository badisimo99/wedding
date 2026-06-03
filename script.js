// --- State Management ---
const DEFAULT_CONFIG = {
  names: "Sofia & Russell",
  date: "2026-10-08T17:00:00",
  location: "Marchand Ranch, Cañon City, CO",
  tagline: "Are getting married! Please join us to celebrate our love and new beginnings.",
  theme: "ivory",
  webhookUrl: "https://script.google.com/macros/s/AKfycbyBoqhvZzJRmMYdBirtLQr_3_nPNWvFYxQG6_UUrafPjlSycjUF8uCyDqgVEIxkU9yj/exec"
};

let config = { ...DEFAULT_CONFIG };
let rsvps = [];

// Web Audio API Context and Synthesizer Nodes
let audioCtx = null;
let masterGain = null;
let delayNode = null;
let isAudioPlaying = false;
let padOscs = [];
let chimeTimer = null;

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
});

// --- Configuration Persistence ---
function loadConfig() {
  const saved = localStorage.getItem("wedding_save_the_date_config");
  if (saved) {
    try {
      config = { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
      // Migrate old placeholder defaults automatically
      if (config.names === "Sophia & Julian" || config.names === "Sophia and Julian" || config.date === "2026-09-19T17:00:00") {
        config = { ...DEFAULT_CONFIG };
        saveConfig();
      }
      // Migrate empty or old broken webhooks to the new default automatically
      if (!config.webhookUrl || config.webhookUrl.includes("AKfycbwQr7MGf-06CBBWKcyMp2C46CnkeyTUoY7O68nplw1wdQ3wmeYxEGpNMP20yDhetPUJ")) {
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
  localStorage.setItem("wedding_save_the_date_config", JSON.stringify(config));
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

  editBtn.addEventListener("click", openStudio);
  closeBtn.addEventListener("click", closeStudio);
  overlay.addEventListener("click", closeStudio);

  // Audio Control
  const audioBtn = document.getElementById("audio-btn");
  audioBtn.addEventListener("click", toggleAudio);

  // Design Studio Input Updates (Live Preview)
  document.getElementById("input-names").addEventListener("input", (e) => {
    config.names = e.target.value || "Sophia & Julian";
    document.getElementById("couple-names-preview").innerHTML = formatNames(config.names);
    saveConfig();
  });

  document.getElementById("input-date").addEventListener("input", (e) => {
    config.date = e.target.value || "2026-09-19T17:00:00";
    document.getElementById("wedding-date-preview").innerText = formatDate(config.date);
    startCountdown();
    saveConfig();
  });

  document.getElementById("input-location").addEventListener("input", (e) => {
    config.location = e.target.value || "San Francisco, California";
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
    const guestAddress = document.getElementById("guest-address").value.trim();
    const guestAttendance = document.getElementById("guest-attendance").value;

    if (!guestName || !guestEmail || !guestAddress) return;

    const rsvpObj = {
      name: guestName,
      email: guestEmail,
      address: guestAddress,
      status: guestAttendance,
      timestamp: new Date().toLocaleString()
    };

    rsvps.push(rsvpObj);
    localStorage.setItem("wedding_rsvps", JSON.stringify(rsvps));
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

    // Automatically trigger chime synthesizer on submit for subtle interaction
    playChimeMelody();
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
        document.getElementById("couple-photo").src = event.target.result;
      };
      reader.readAsDataURL(file);
    }
  });
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
  const saved = localStorage.getItem("wedding_rsvps");
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
    listBody.innerHTML = "<tr><td colspan='4' style='text-align:center;'>No RSVPs yet</td></tr>";
    return;
  }

  rsvps.forEach(rsvp => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(rsvp.name)}</td>
      <td>${escapeHtml(rsvp.email)}</td>
      <td>${escapeHtml(rsvp.address || "")}</td>
      <td><span style="font-weight:600; color:var(--accent-color);">${escapeHtml(rsvp.status)}</span></td>
    `;
    listBody.appendChild(tr);
  });
}

function exportRSVPsCSV() {
  if (rsvps.length === 0) {
    alert("No RSVPs to export.");
    return;
  }

  let csvContent = "data:text/csv;charset=utf-8,Name,Email,Address,Attendance,Timestamp\n";
  rsvps.forEach(r => {
    const row = `"${r.name.replace(/"/g, '""')}","${r.email.replace(/"/g, '""')}","${(r.address || "").replace(/"/g, '""')}","${r.status}","${r.timestamp}"`;
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

// --- Procedural Wedding Ambient Synth Audio Engine ---
function toggleAudio() {
  const audioBtn = document.getElementById("audio-btn");
  
  if (!audioCtx) {
    // Initial instantiation
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();
    setupAudioNodes();
  }

  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  if (isAudioPlaying) {
    // Mute/Pause
    masterGain.gain.setValueAtTime(masterGain.gain.value, audioCtx.currentTime);
    masterGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.2); // fade out over 1.2s
    isAudioPlaying = false;
    audioBtn.classList.remove("active");
    clearInterval(chimeTimer);
  } else {
    // Unmute/Play
    masterGain.gain.setValueAtTime(masterGain.gain.value, audioCtx.currentTime);
    masterGain.gain.exponentialRampToValueAtTime(0.3, audioCtx.currentTime + 1.5); // fade in to 30% volume
    isAudioPlaying = true;
    audioBtn.classList.add("active");
    
    // Start procedural pad & melody loop
    startAmbientPad();
    triggerProceduralChimes();
  }
}

function setupAudioNodes() {
  // Master gain
  masterGain = audioCtx.createGain();
  masterGain.gain.setValueAtTime(0, audioCtx.currentTime);

  // Delay node for space/reverb simulation
  delayNode = audioCtx.createDelay();
  delayNode.delayTime.setValueAtTime(0.45, audioCtx.currentTime);

  const delayFeedback = audioCtx.createGain();
  delayFeedback.gain.setValueAtTime(0.35, audioCtx.currentTime);

  // Connect Delay loop
  delayNode.connect(delayFeedback);
  delayFeedback.connect(delayNode);

  // Main routings
  masterGain.connect(audioCtx.destination);
  delayNode.connect(masterGain);
}

function startAmbientPad() {
  // Clear any old oscillators
  padOscs.forEach(osc => {
    try { osc.stop(); } catch(e) {}
  });
  padOscs = [];

  // A romantic open chord: F major 9th or Db major 7th. Let's do Db Major (Db3, Ab3, F4, C5)
  // Frequencies: Db3 = 138.59, Ab3 = 207.65, F4 = 349.23, C5 = 523.25
  const baseFreqs = [138.59, 207.65, 349.23, 523.25];

  baseFreqs.forEach(freq => {
    const osc = audioCtx.createOscillator();
    const oscGain = audioCtx.createGain();
    const lpf = audioCtx.createBiquadFilter();

    // Soft warm triangle/sine blend (triangle sounds warm and organic)
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    
    // Detune slightly for beautiful chorus effect
    osc.detune.setValueAtTime((Math.random() - 0.5) * 8, audioCtx.currentTime);

    // Warm filter sweep (sweeping low pass filter)
    lpf.type = 'lowpass';
    lpf.Q.setValueAtTime(2, audioCtx.currentTime);
    lpf.frequency.setValueAtTime(600, audioCtx.currentTime);

    // Dynamic modulation of the lowpass filter frequency (warm swelling)
    const lfo = audioCtx.createOscillator();
    const lfoGain = audioCtx.createGain();
    lfo.frequency.value = 0.05 + Math.random() * 0.04; // super slow sweep (approx 20 seconds)
    lfoGain.gain.value = 250; // Sweeps filter +/- 250Hz

    lfo.connect(lfoGain);
    lfoGain.connect(lpf.frequency);
    lfo.start();

    // Swelling volume envelopes for the pad voices
    oscGain.gain.setValueAtTime(0.01, audioCtx.currentTime);
    
    // Setup connections
    osc.connect(lpf);
    lpf.connect(oscGain);
    oscGain.connect(masterGain);
    
    osc.start();
    lfo.start();

    // Constant swelling volume modulation
    const swellTime = 8 + Math.random() * 6;
    function swell() {
      if (!isAudioPlaying) return;
      const t = audioCtx.currentTime;
      oscGain.gain.linearRampToValueAtTime(0.04 + Math.random() * 0.06, t + swellTime / 2);
      oscGain.gain.linearRampToValueAtTime(0.01, t + swellTime);
      setTimeout(swell, swellTime * 1000);
    }
    swell();

    // Keep reference to clean up
    padOscs.push(osc);
    padOscs.push(lfo);
  });
}

function triggerProceduralChimes() {
  if (chimeTimer) clearInterval(chimeTimer);

  function playNext() {
    if (!isAudioPlaying) return;
    playChimeMelody();
    // Schedule next chime in 5 to 9 seconds
    const delay = 5000 + Math.random() * 4000;
    chimeTimer = setTimeout(playNext, delay);
  }
  
  // Start the scheduling
  playNext();
}

// Play single notes or a soft pentatonic chime cascade
function playChimeMelody() {
  if (!audioCtx || audioCtx.state === 'suspended' || !masterGain) return;

  // A Major Pentatonic or Db Major Pentatonic scale notes
  // Db pentatonic: Db5 (554.37), Eb5 (622.25), F5 (698.46), Ab5 (830.61), Bb5 (932.33), Db6 (1108.73)
  const scale = [554.37, 622.25, 698.46, 830.61, 932.33, 1108.73];
  
  // Choose 2 to 3 notes to play in sequence (delightful bell chimes)
  const notesCount = Math.floor(Math.random() * 2) + 2; 
  let delayTimeOffset = 0;

  for (let i = 0; i < notesCount; i++) {
    const note = scale[Math.floor(Math.random() * scale.length)];
    triggerBellNote(note, audioCtx.currentTime + delayTimeOffset);
    delayTimeOffset += 0.25 + Math.random() * 0.15; // sweet syncopated rhythm
  }
}

function triggerBellNote(frequency, startTime) {
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();

  osc.type = 'sine'; // pure round bell sound
  osc.frequency.setValueAtTime(frequency, startTime);

  // Highpass filter to strip low muddiness from chimes
  filter.type = 'highpass';
  filter.frequency.setValueAtTime(300, startTime);

  // Gain envelope: instant hit, long ring-out
  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(0.08, startTime + 0.01); // sharp attack
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + 2.5); // long tail decay

  // Connect to delay line and master output
  osc.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(masterGain);
  
  // Also send chimes directly into our echo unit for a dreamy, ambient tail
  if (delayNode) {
    gainNode.connect(delayNode);
  }

  osc.start(startTime);
  osc.stop(startTime + 3.0);
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
  const img = document.getElementById("couple-photo");
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
  c.fillText("www.sofiaandrussellaregettingmarried.com", 600, 1445);

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
