const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- Footer year ----------
document.getElementById("year").textContent = new Date().getFullYear();

// ---------- Moving type background ----------
(function buildTypeBackground() {
  const host = document.getElementById("bg-type");
  const words = ["FLINNCH", "WEB", "AI", "AUTOMATION"];
  // Each row starts on a different word and moves at a different, slow speed.
  const rows = [
    { offset: 0, dur: 140, reverse: false },
    { offset: 2, dur: 170, reverse: true },
    { offset: 1, dur: 150, reverse: false },
    { offset: 3, dur: 180, reverse: true },
  ];
  rows.forEach((row) => {
    const rowEl = document.createElement("div");
    rowEl.className = "bg-row" + (row.reverse ? " reverse" : "");
    const track = document.createElement("div");
    track.className = "bg-track";
    track.style.setProperty("--dur", row.dur + "s");
    // Build one full set, then duplicate it so the -50% loop is seamless.
    const set = [];
    for (let r = 0; r < 3; r++) {
      words.forEach((_, i) => set.push(words[(i + row.offset) % words.length]));
    }
    const html = set.map((w) => `<span>${w}</span>`).join("");
    track.innerHTML = html + html;
    rowEl.appendChild(track);
    host.appendChild(rowEl);
  });
})();

// ---------- Scroll progress bar ----------
const progress = document.getElementById("progress");
let ticking = false;
function updateProgress() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const p = max > 0 ? window.scrollY / max : 0;
  progress.style.transform = `scaleX(${p})`;
  ticking = false;
}
window.addEventListener(
  "scroll",
  () => {
    if (!ticking) {
      requestAnimationFrame(updateProgress);
      ticking = true;
    }
  },
  { passive: true }
);
updateProgress();

// ---------- Selector panel (shared by Capabilities + Work) ----------
function mountSelector(root, items, renderDetail, onMount) {
  let active = 0;
  root.innerHTML = `<div class="list" role="tablist"></div><div class="detail" role="tabpanel"></div>`;
  const list = root.querySelector(".list");
  const detail = root.querySelector(".detail");

  function paint() {
    list.innerHTML = items
      .map(
        (it, i) => `
        <button class="item ${i === active ? "active" : ""}" role="tab" aria-selected="${i === active}" data-i="${i}" type="button">
          <span class="n">${String(i + 1).padStart(2, "0")}</span>
          <span class="txt">
            <span class="ttl">${it.title}</span>
            ${it.eyebrow ? `<span class="sub">${it.eyebrow}</span>` : ""}
          </span>
        </button>`
      )
      .join("");
    detail.innerHTML = `<div class="fade">${renderDetail(items[active])}</div>`;
    if (onMount) onMount(detail, items[active]);
  }

  list.addEventListener("click", (e) => {
    const btn = e.target.closest(".item");
    if (!btn) return;
    active = Number(btn.dataset.i);
    paint();
  });

  paint();
}

// ---------- Swipe helper (touch + mouse drag) ----------
function addSwipe(target, onNext, onPrev) {
  let startX = null;
  let moved = false;
  target.addEventListener("pointerdown", (e) => {
    startX = e.clientX;
    moved = false;
  });
  target.addEventListener("pointermove", (e) => {
    if (startX !== null && Math.abs(e.clientX - startX) > 8) moved = true;
  });
  target.addEventListener("pointerup", (e) => {
    if (startX === null) return;
    const dx = e.clientX - startX;
    startX = null;
    if (Math.abs(dx) > 40) (dx < 0 ? onNext : onPrev)();
  });
  target.addEventListener("pointercancel", () => { startX = null; });
  // Lets click handlers ignore the click that ends a drag.
  return { wasDrag: () => moved };
}

// ---------- Lightbox (full-screen image viewer) ----------
const lightbox = (function () {
  const el = document.createElement("div");
  el.className = "lightbox";
  el.hidden = true;
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-label", "Image viewer");
  el.innerHTML = `
    <button class="lb-btn lb-close" type="button" aria-label="Close (Esc)">×</button>
    <button class="lb-btn lb-nav prev" type="button" aria-label="Previous image">‹</button>
    <figure class="lb-figure">
      <img class="lb-img" alt="" draggable="false" />
      <figcaption class="lb-cap"><span class="lb-title"></span><span class="lb-count"></span></figcaption>
    </figure>
    <button class="lb-btn lb-nav next" type="button" aria-label="Next image">›</button>`;
  document.body.appendChild(el);

  const figure = el.querySelector(".lb-figure");
  const img = el.querySelector(".lb-img");
  const titleEl = el.querySelector(".lb-title");
  const countEl = el.querySelector(".lb-count");
  const closeBtn = el.querySelector(".lb-close");
  const prevBtn = el.querySelector(".lb-nav.prev");
  const nextBtn = el.querySelector(".lb-nav.next");

  let state = null;
  let opener = null;
  let hideTimer = null;

  function show() {
    const { images, index, title, onChange } = state;
    const n = images.length;
    img.src = images[index].src;
    img.alt = images[index].alt;
    titleEl.textContent = title;
    countEl.textContent = n > 1 ? `${index + 1} / ${n}` : "";
    prevBtn.hidden = nextBtn.hidden = n < 2;
    if (n > 1) {
      // Preload the neighbours so arrow-key browsing feels instant.
      new Image().src = images[(index + 1) % n].src;
      new Image().src = images[(index - 1 + n) % n].src;
    }
    if (onChange) onChange(index);
  }

  function go(d) {
    if (!state) return;
    const n = state.images.length;
    if (n < 2) return;
    state.index = (state.index + d + n) % n;
    show();
  }

  function open(images, index, title, onChange) {
    clearTimeout(hideTimer);
    state = { images, index, title, onChange };
    opener = document.activeElement;
    el.hidden = false;
    void el.offsetWidth; // force reflow so the open transition plays
    el.classList.add("open");
    document.body.style.overflow = "hidden";
    show();
    closeBtn.focus();
  }

  function close() {
    if (!state) return;
    state = null;
    el.classList.remove("open");
    document.body.style.overflow = "";
    hideTimer = setTimeout(() => { el.hidden = true; }, reduceMotion ? 0 : 280);
    if (opener && opener.focus) opener.focus();
  }

  closeBtn.addEventListener("click", close);
  prevBtn.addEventListener("click", () => go(-1));
  nextBtn.addEventListener("click", () => go(1));
  // Click on the dark backdrop (or the gap around the image) closes it.
  el.addEventListener("click", (e) => {
    if (e.target === el || e.target === figure) close();
  });
  addSwipe(figure, () => go(1), () => go(-1));

  document.addEventListener("keydown", (e) => {
    if (!state) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowRight") go(1);
    else if (e.key === "ArrowLeft") go(-1);
    else if (e.key === "Tab") {
      // Keep keyboard focus inside the viewer while it is open.
      const focusable = [closeBtn, prevBtn, nextBtn].filter((b) => !b.hidden);
      const i = focusable.indexOf(document.activeElement);
      const next = e.shiftKey ? (i <= 0 ? focusable.length - 1 : i - 1) : (i + 1) % focusable.length;
      e.preventDefault();
      focusable[next].focus();
    }
  });

  return { open, close };
})();

// ---------- Image carousel (project screenshots) ----------
function normalizeImages(project) {
  return (project.images || []).map((im, i) => {
    const base = { alt: `${project.title} screenshot ${i + 1}` };
    return typeof im === "string" ? { ...base, src: im } : { ...base, ...im };
  });
}

function carouselHTML(project) {
  const images = normalizeImages(project);
  if (!images.length) return "";
  const multi = images.length > 1;
  return `
    <div class="carousel" role="group" aria-roledescription="carousel" aria-label="${project.title} screenshots">
      <div class="car-viewport">
        <div class="car-track">
          ${images.map((im) => `
            <div class="car-slide" data-src="${im.src}">
              <img src="${im.src}" alt="${im.alt}" draggable="false" />
            </div>`).join("")}
        </div>
        <button class="car-zoom" type="button" aria-label="View fullscreen">⤢</button>
        ${multi ? `
          <button class="car-btn prev" type="button" aria-label="Previous image">‹</button>
          <button class="car-btn next" type="button" aria-label="Next image">›</button>` : ""}
      </div>
      ${multi ? `<div class="car-dots">${images.map((_, i) =>
        `<button class="dot ${i === 0 ? "active" : ""}" type="button" aria-label="Go to image ${i + 1}"></button>`
      ).join("")}</div>` : ""}
    </div>`;
}

function initCarousel(root, project) {
  const wrap = root.querySelector(".carousel");
  if (!wrap) return;
  const images = normalizeImages(project);
  const n = images.length;
  const viewport = wrap.querySelector(".car-viewport");
  const track = wrap.querySelector(".car-track");
  const dots = wrap.querySelectorAll(".dot");
  let index = 0;

  function go(i) {
    index = (i + n) % n;
    track.style.transform = `translateX(-${index * 100}%)`;
    dots.forEach((d, k) => d.classList.toggle("active", k === index));
  }

  wrap.querySelector(".car-btn.prev")?.addEventListener("click", () => go(index - 1));
  wrap.querySelector(".car-btn.next")?.addEventListener("click", () => go(index + 1));
  dots.forEach((d, k) => d.addEventListener("click", () => go(k)));

  const openViewer = () => lightbox.open(images, index, project.title, go);
  wrap.querySelector(".car-zoom").addEventListener("click", openViewer);

  const swipe = addSwipe(viewport, () => go(index + 1), () => go(index - 1));
  viewport.addEventListener("click", (e) => {
    if (e.target.closest("button") || swipe.wasDrag()) return;
    openViewer();
  });

  // If a path is wrong, say so in the slide instead of showing a broken icon.
  wrap.querySelectorAll(".car-slide img").forEach((im) => {
    im.addEventListener("error", () => im.parentElement.classList.add("broken"));
  });
}

// ---------- Capabilities ----------
const capabilities = [
  {
    title: "Web Applications",
    desc: "A website or app built around how your business actually works — not a generic template that almost fits.",
    tags: ["Built for your business", "Fast", "Reliable"],
    examples: [
      "A booking system for your service business",
      "A dashboard where your team sees everything in one place",
      "An online store or marketplace built around your products",
    ],
  },
  {
    title: "AI Integration",
    desc: "AI that actually helps — answering questions, reading documents, spotting things — not AI added just to say you have it.",
    tags: ["Saves time", "Answers customers", "Reads documents for you"],
    examples: [
      "A chatbot that answers customer questions using your own information",
      "Automatically summarizing customer messages or support tickets",
      "Pulling the important details out of forms, emails, or documents",
    ],
  },
  {
    title: "Automation",
    desc: "Connecting the tools you already use, so information moves between them on its own — no more copying and pasting.",
    tags: ["No manual work", "Runs itself", "Fewer mistakes"],
    examples: [
      "A form submission automatically creates a record and notifies your team",
      "Invoices sent out on a schedule without anyone doing it by hand",
      "Your booking system and accounting software stay in sync automatically",
    ],
  },
  {
    title: "Custom Tools",
    desc: "A tool built around one specific problem in your business — usually replacing something your team currently manages by hand in a spreadsheet.",
    tags: ["Just for your team", "Replaces spreadsheets", "Simple to use"],
    examples: [
      "A simple panel for your team to manage bookings, orders, or content",
      "A dashboard that shows what's happening in your business at a glance",
      "Software that replaces a spreadsheet you update manually every week",
    ],
  },
  {
    title: "Consulting",
    desc: "Before spending money building something, a short conversation to figure out what's actually worth building — and what isn't.",
    tags: ["No commitment", "Clear plan", "Honest advice"],
    examples: [
      "A review of what you're using now, and where time is being wasted",
      "A clear recommendation on what to build first",
      "Honest advice on what you don't need yet",
    ],
  },
];

mountSelector(document.getElementById("cap-panel"), capabilities, (cap) => `
  <h3>${cap.title}</h3>
  <p class="desc">${cap.desc}</p>
  <div class="tags">${cap.tags.map((t) => `<span class="tag">${t}</span>`).join("")}</div>
  <div class="examples-label">EXAMPLES</div>
  <ul class="examples">${cap.examples.map((e) => `<li>${e}</li>`).join("")}</ul>
`);

// ---------- Selected work ----------
// Replace url with each project's real link.
// images: list of screenshot paths (files live under /public, so
// "/assets/projects/estatebro/1.png" means public/assets/projects/estatebro/1.png).
// One image = a single zoomable picture, several = a carousel, none = no picture.
const projects = [
  {
    eyebrow: "FULL-STACK WEB APPLICATION",
    title: "EstateBro",
    images: ["project_images/realestate/estate_1.png","project_images/realestate/estate_2.png","project_images/realestate/estate_3.png","project_images/realestate/estate_4.png"],
    desc: "Real estate platform for property discovery and management — authentication, advanced search and listing management.",
    url: "https://estatebro123.onrender.com/",
  },
  {
    eyebrow: "EDTECH WEB APPLICATION",
    title: "KanaQuest",
    images: ["project_images/kana/kana_1.png","project_images/kana/kana_2.png","project_images/kana/kana_3.png","project_images/kana/kana_4.png"],
    desc: "Interactive Japanese learning platform for Hiragana, Katakana and Kanji — lessons, quizzes and progress tracking.",
    url: "https://kanaquest123.onrender.com/",
  },
  {
    eyebrow: "AI AUTOMATION",
    title: "Kestrel Lead Extractor",
   images: ["project_images/kestrel/kestrel_1.png","project_images/kestrel/kestrel_2.png","project_images/kestrel/kestrel_3.png","project_images/kestrel/kestrel_4.png"],
    desc: "AI-powered lead intake that turns free-text inquiries into structured CRM data.",
    url: "https://kestrel-demo-lead-extractor.onrender.com/",
  },
  // {
  //   eyebrow: "WEB APPLICATION",
  //   title: "Finance Management",
  // images: ["project_images/finance/finance_1.png","project_images/finance/finance_2.png","project_images/finance/finance_3.png","project_images/finance/finance_4.png"],
  //   desc: "Personal finance app backed by Firebase and Firestore for organizing financial data.",
  //   url: "#",
  // },
  {
    eyebrow: "DEVELOPER TOOL",
    title: "GitStats",
  images: ["project_images/gitstat/gitstat_1.png","project_images/gitstat/gitstat_2.png","project_images/gitstat/gitstat_3.png","project_images/gitstat/gitstat_4.png"],
    desc: "Terminal-inspired GitHub profile explorer — repositories, languages, activity and commit stats.",
    url: "https://tanaynaik07.github.io/gitstats/",
  },
  {
    eyebrow: "PRODUCTIVITY WEB APP",
    title: "Founder's Diary",
  images: ["project_images/playbook/playbook_1.png","project_images/playbook/playbook_2.png","project_images/playbook/playbook_3.png","project_images/playbook/playbook_4.png"],
    desc: "A personal workspace for tracking projects, goals, experiments, lessons and decisions in one place — with a timeline that builds itself from everything you log, and data that syncs across devices.",
    url: "https://tanaynaik07.github.io/playbook/",
  },
];

mountSelector(document.getElementById("work-panel"), projects, (p) => `
  <div class="eyebrow">${p.eyebrow}</div>
  <h3>${p.title}</h3>
  ${carouselHTML(p)}
  <p class="desc">${p.desc}</p>
  <a class="work-link" href="${p.url}">View project ↗</a>
`, initCarousel);

// ---------- Lab: gently cycle the active step ----------
(function labCycle() {
  const steps = document.querySelectorAll("#lab-flow .lab-step");
  if (!steps.length || reduceMotion) return;
  let i = 0;
  steps[0].classList.add("active");
  setInterval(() => {
    steps[i].classList.remove("active");
    i = (i + 1) % steps.length;
    steps[i].classList.add("active");
  }, 2200);
})();

// ---------- Scroll reveal ----------
(function reveal() {
  const els = document.querySelectorAll(".reveal");
  if (reduceMotion || !("IntersectionObserver" in window)) {
    els.forEach((el) => el.classList.add("in"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -6% 0px" }
  );
  els.forEach((el) => io.observe(el));
})();

// ---------- Contact form ----------
const form = document.getElementById("contact-form");
const statusEl = document.getElementById("form-status");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  statusEl.textContent = "Sending…";
  statusEl.className = "form-status";

  const payload = {
    name: document.getElementById("name").value,
    email: document.getElementById("email").value,
    message: document.getElementById("message").value,
  };

  try {
    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (data.ok) {
      statusEl.textContent = "Sent — we'll get back to you soon.";
      statusEl.className = "form-status success";
      form.reset();
    } else {
      statusEl.textContent = data.error || "Something went wrong. Try again.";
      statusEl.className = "form-status error";
    }
  } catch (err) {
    statusEl.textContent = "Couldn't reach the server. Try again in a moment.";
    statusEl.className = "form-status error";
  }
});