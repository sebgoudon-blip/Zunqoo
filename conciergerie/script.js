(function () {
  "use strict";

  var CONFIG = window.SITE_CONFIG || {};

  // ------------------------------------------------------------
  // Données : logements (remplacez par vos biens et vos photos).
  // "photos" accepte des chemins d'images (ex : "images/villa-1.jpg").
  // Sans photo, un visuel coloré est affiché à la place.
  // ------------------------------------------------------------
  var PROPERTIES = [
    { title: "Mas provençal · Piscine · Vue Lance", city: "Nyons", guests: 10, surface: 180, url: "", photos: [] },
    { title: "Maison de pierre · Jacuzzi · Gorges à 5 min", city: "Vallon-Pont-d'Arc", guests: 8, surface: 120, url: "", photos: [] },
    { title: "Studio cosy · Centre historique", city: "Montélimar", guests: 2, surface: 28, url: "", photos: [] },
    { title: "Maison de village · Terrasse · Vue château", city: "Grignan", guests: 4, surface: 70, url: "", photos: [] },
    { title: "Gîte au bord de l'Ardèche · Plage à pied", city: "Ruoms", guests: 6, surface: 65, url: "", photos: [] },
    { title: "T2 avec piscine · Au calme", city: "Dieulefit", guests: 4, surface: 45, url: "", photos: [] },
    { title: "Duplex lumineux · Proche Rhône", city: "Bourg-Saint-Andéol", guests: 5, surface: 60, url: "", photos: [] },
    { title: "Maison de charme · Jardin · Cévennes", city: "Les Vans", guests: 6, surface: 110, url: "", photos: [] }
  ];

  // ------------------------------------------------------------
  // Avis : EXEMPLES À REMPLACER par de vrais avis avant mise en ligne.
  // ------------------------------------------------------------
  var REVIEWS = [
    { name: "Prénom", role: "Propriétaire", city: "Drôme / Ardèche", text: "Avis d'exemple : gestion sérieuse et réactive, je n'ai plus à m'occuper de rien." },
    { name: "Prénom", role: "Investisseur", city: "Drôme / Ardèche", text: "Avis d'exemple : mes réservations ont nettement augmenté dès les premiers mois." },
    { name: "Prénom", role: "Cadre", city: "Drôme / Ardèche", text: "Avis d'exemple : le rapport mensuel me permet de tout suivre à distance." },
    { name: "Prénom", role: "Retraité", city: "Drôme / Ardèche", text: "Avis d'exemple : ménage impeccable, voyageurs ravis, propriétaire serein." },
    { name: "Prénom", role: "Chef d'entreprise", city: "Drôme / Ardèche", text: "Avis d'exemple : une équipe disponible, flexible et vraiment efficace." },
    { name: "Prénom", role: "Propriétaire", city: "Drôme / Ardèche", text: "Avis d'exemple : mon logement est devenu un coup de cœur voyageurs." },
    { name: "Prénom", role: "Infirmière", city: "Drôme / Ardèche", text: "Avis d'exemple : tout est fluide, de l'arrivée des voyageurs au départ." },
    { name: "Prénom", role: "Entrepreneur", city: "Drôme / Ardèche", text: "Avis d'exemple : je gagne plus qu'avant, et sans y passer mes soirées." }
  ];

  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- Configuration : nom, contacts, liens ----------
  function applyConfig() {
    if (CONFIG.brand) {
      $$("[data-brand]").forEach(function (el) { el.textContent = CONFIG.brand; });
      $$(".logo__mark").forEach(function (el) { el.textContent = CONFIG.logoInitials || CONFIG.brand.charAt(0).toUpperCase(); });
    }
    if (CONFIG.phone) $$("[data-phone]").forEach(function (el) { el.textContent = CONFIG.phone; });
    if (CONFIG.email) $$("[data-email]").forEach(function (el) { el.textContent = CONFIG.email; });
    $$("[data-phone-link]").forEach(function (el) { el.href = "tel:" + (CONFIG.phone || "").replace(/\s/g, ""); });
    $$("[data-email-link]").forEach(function (el) { el.href = "mailto:" + (CONFIG.email || ""); });
    $$("[data-booking]").forEach(function (el) {
      el.href = CONFIG.bookingUrl || "#Contact";
      if (/^https?:/.test(el.href) && CONFIG.bookingUrl && CONFIG.bookingUrl.charAt(0) !== "#") {
        el.target = "_blank"; el.rel = "noopener";
      }
    });
    $$("[data-booking-site]").forEach(function (el) {
      el.href = CONFIG.bookingSiteUrl || "#Nos-logements";
      if (CONFIG.bookingSiteUrl && CONFIG.bookingSiteUrl.charAt(0) !== "#") { el.target = "_blank"; el.rel = "noopener"; }
    });
    $$("[data-whatsapp]").forEach(function (el) {
      el.href = "https://wa.me/" + (CONFIG.whatsapp || "") + "?text=" + encodeURIComponent("Bonjour");
    });
    $("#year").textContent = new Date().getFullYear();
  }

  // ---------- Header : fond au scroll + menu mobile ----------
  function initHeader() {
    var header = $("#header");
    var burger = $("#burger");
    var nav = $("#nav");
    var toTop = $("#toTop");

    function onScroll() {
      header.classList.toggle("is-scrolled", window.scrollY > 20);
      toTop.classList.toggle("is-visible", window.scrollY > 600);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    function closeMenu() {
      nav.classList.remove("is-open");
      burger.classList.remove("is-open");
      burger.setAttribute("aria-expanded", "false");
      document.body.classList.remove("no-scroll");
    }
    burger.addEventListener("click", function () {
      var open = !nav.classList.contains("is-open");
      nav.classList.toggle("is-open", open);
      burger.classList.toggle("is-open", open);
      burger.setAttribute("aria-expanded", String(open));
      document.body.classList.toggle("no-scroll", open);
    });
    $$("a", nav).forEach(function (a) { a.addEventListener("click", closeMenu); });
    $(".nav__cta-mobile").addEventListener("click", closeMenu);

    toTop.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });

    // Lien actif selon la section visible
    var links = $$(".nav a[href^='#']");
    var sections = links.map(function (a) { return $(a.getAttribute("href")); }).filter(Boolean);
    if ("IntersectionObserver" in window) {
      var spy = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          links.forEach(function (a) { a.classList.toggle("is-active", a.getAttribute("href") === "#" + e.target.id); });
        });
      }, { rootMargin: "-45% 0px -50% 0px" });
      sections.forEach(function (s) { spy.observe(s); });
    }
  }

  // ---------- Apparition au scroll ----------
  function initReveal() {
    var items = $$(".reveal, .step");
    if (reduceMotion || !("IntersectionObserver" in window)) {
      items.forEach(function (el) { el.classList.add("is-visible"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("is-visible"); io.unobserve(e.target); }
      });
    }, { threshold: 0.15 });
    items.forEach(function (el) { io.observe(el); });
  }

  // ---------- Compteurs animés ----------
  function initCounters() {
    var counters = $$("[data-count]");
    function render(el, value) {
      var prefix = el.getAttribute("data-prefix") || "";
      var suffix = el.getAttribute("data-suffix") || "";
      el.textContent = prefix + Math.round(value).toLocaleString("fr-FR") + suffix;
    }
    function run(el) {
      var target = parseFloat(el.getAttribute("data-count"));
      if (reduceMotion) { render(el, target); return; }
      var start = null, duration = 1600;
      function tick(ts) {
        if (!start) start = ts;
        var p = Math.min((ts - start) / duration, 1);
        render(el, target * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }
    if (!("IntersectionObserver" in window)) { counters.forEach(run); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { run(e.target); io.unobserve(e.target); }
      });
    }, { threshold: 0.5 });
    counters.forEach(function (el) { io.observe(el); });
  }

  // ---------- Onglets services (rotation automatique) ----------
  function initServices() {
    var tabs = $$(".service-tab");
    var panels = $$(".service-panel");
    var current = 0, timer = null;

    function show(i) {
      current = i;
      tabs.forEach(function (t, k) {
        t.classList.toggle("is-active", k === i);
        t.setAttribute("aria-selected", String(k === i));
      });
      panels.forEach(function (p, k) { p.classList.toggle("is-active", k === i); });
    }
    function start() {
      if (reduceMotion) return;
      stop();
      timer = setInterval(function () { show((current + 1) % tabs.length); }, 5000);
    }
    function stop() { if (timer) clearInterval(timer); }

    tabs.forEach(function (t, i) {
      t.addEventListener("click", function () { show(i); start(); });
    });
    var wrap = $(".services");
    wrap.addEventListener("mouseenter", stop);
    wrap.addEventListener("mouseleave", start);
    start();
  }

  // ---------- Cartes fondateurs (flip) ----------
  function initFlip() {
    $$(".flip").forEach(function (card) {
      function toggle() { card.classList.toggle("is-flipped"); }
      $$(".flip__btn", card).forEach(function (b) {
        b.addEventListener("click", function (e) { e.stopPropagation(); toggle(); });
      });
      card.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
      });
    });
  }

  // ---------- Logements : cartes + mini-galeries + carrousel ----------
  var GRADIENTS = [
    ["#5b8cff", "#a3c4ff"], ["#ff8a65", "#ffd0a1"], ["#26c6da", "#a7f3ff"],
    ["#7e57c2", "#c7b3ff"], ["#66bb6a", "#c8f2c9"], ["#ffb300", "#ffe8a3"]
  ];
  var SCENES = ["🏡", "🛋️", "🍳", "🛏️", "🌊", "🏊"];

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function slideHtml(p, i, k) {
    if (p.photos && p.photos.length) {
      return '<div class="pslide"><img src="' + escapeHtml(p.photos[k]) + '" alt="' + escapeHtml(p.title) + '" loading="lazy"></div>';
    }
    var g = GRADIENTS[(i + k) % GRADIENTS.length];
    return '<div class="pslide pslide--placeholder" style="background:linear-gradient(135deg,' + g[0] + "," + g[1] + ')"><span>' + SCENES[(i + k) % SCENES.length] + "</span></div>";
  }

  function renderProperties() {
    var root = $("#properties");
    root.innerHTML = PROPERTIES.map(function (p, i) {
      var count = p.photos && p.photos.length ? p.photos.length : 4;
      var slides = "", dots = "";
      for (var k = 0; k < count; k++) {
        slides += slideHtml(p, i, k);
        dots += '<button class="pdot' + (k === 0 ? " is-active" : "") + '" aria-label="Photo ' + (k + 1) + '"></button>';
      }
      var url = p.url || CONFIG.bookingSiteUrl || "#";
      var external = /^https?:/.test(url);
      return (
        '<article class="property">' +
          '<div class="property__media">' +
            '<div class="property__slides">' + slides + "</div>" +
            '<button class="pnav pnav--prev" aria-label="Photo précédente">‹</button>' +
            '<button class="pnav pnav--next" aria-label="Photo suivante">›</button>' +
            '<div class="property__dots">' + dots + "</div>" +
            '<span class="property__city">📍 ' + escapeHtml(p.city) + "</span>" +
          "</div>" +
          '<div class="property__body">' +
            '<div class="property__meta"><span>👥 ' + p.guests + " voyageurs</span><span>📐 " + p.surface + " m²</span></div>" +
            "<h3>" + escapeHtml(p.title) + "</h3>" +
            '<a class="btn btn--primary btn--block" href="' + escapeHtml(url) + '"' + (external ? ' target="_blank" rel="noopener"' : "") + ">Réserver</a>" +
          "</div>" +
        "</article>"
      );
    }).join("");

    $$(".property", root).forEach(function (card) {
      var track = $(".property__slides", card);
      var dots = $$(".pdot", card);
      var n = dots.length, idx = 0;
      function go(i) {
        idx = (i + n) % n;
        track.style.transform = "translateX(" + -idx * 100 + "%)";
        dots.forEach(function (d, k) { d.classList.toggle("is-active", k === idx); });
      }
      $(".pnav--prev", card).addEventListener("click", function () { go(idx - 1); });
      $(".pnav--next", card).addEventListener("click", function () { go(idx + 1); });
      dots.forEach(function (d, k) { d.addEventListener("click", function () { go(k); }); });

      // Swipe tactile sur la galerie
      var x0 = null;
      track.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; }, { passive: true });
      track.addEventListener("touchend", function (e) {
        if (x0 === null) return;
        var dx = e.changedTouches[0].clientX - x0;
        if (Math.abs(dx) > 40) go(idx + (dx < 0 ? 1 : -1));
        x0 = null;
      });
    });
  }

  function initCarousels() {
    $$("[data-carousel-prev], [data-carousel-next]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-carousel-prev") || btn.getAttribute("data-carousel-next");
        var el = document.getElementById(id);
        var card = el.firstElementChild;
        var step = card ? card.getBoundingClientRect().width + 24 : el.clientWidth * 0.8;
        el.scrollBy({ left: btn.hasAttribute("data-carousel-prev") ? -step : step, behavior: "smooth" });
      });
    });
  }

  // ---------- Avis : défilement infini sur deux lignes ----------
  function renderReviews() {
    function card(r, i) {
      return (
        '<figure class="review">' +
          '<div class="review__stars" aria-label="5 étoiles sur 5">★★★★★</div>' +
          "<blockquote>" + escapeHtml(r.text) + "</blockquote>" +
          "<figcaption>" +
            '<span class="review__avatar" style="background:' + GRADIENTS[i % GRADIENTS.length][0] + '">' + escapeHtml(r.name.charAt(0)) + "</span>" +
            "<span><b>" + escapeHtml(r.name) + "</b><small>" + escapeHtml(r.role) + (r.city ? " · " + escapeHtml(r.city) : "") + "</small></span>" +
          "</figcaption>" +
        "</figure>"
      );
    }
    var half = Math.ceil(REVIEWS.length / 2);
    [[REVIEWS.slice(0, half), "#reviews-row-1"], [REVIEWS.slice(half), "#reviews-row-2"]].forEach(function (pair, r) {
      var html = pair[0].map(function (rv, i) { return card(rv, i + r * half); }).join("");
      // Contenu doublé pour une boucle continue
      $(pair[1]).innerHTML = '<div class="reviews__track">' + html + html + "</div>";
    });
  }

  // ---------- Popup estimation ----------
  function initModal() {
    var modal = $("#estimateModal");
    var lastFocus = null;
    function open() {
      lastFocus = document.activeElement;
      modal.hidden = false;
      requestAnimationFrame(function () { modal.classList.add("is-open"); });
      document.body.classList.add("no-scroll");
      var first = $("input, select", modal);
      if (first) setTimeout(function () { first.focus(); }, 150);
    }
    function close() {
      modal.classList.remove("is-open");
      document.body.classList.remove("no-scroll");
      setTimeout(function () { modal.hidden = true; }, 250);
      if (lastFocus) lastFocus.focus();
    }
    $$("[data-open-estimate]").forEach(function (b) { b.addEventListener("click", open); });
    $$("[data-close-estimate]").forEach(function (b) { b.addEventListener("click", close); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !modal.hidden) close();
    });
  }

  // ---------- Formulaires (validation + envoi) ----------
  function initForms() {
    $$("form[data-form]").forEach(function (form) {
      var wrap = form.parentElement;
      var success = $(".form-state--success", wrap);
      var error = $(".form-state--error", wrap);

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var valid = true;
        $$("[required]", form).forEach(function (input) {
          var ok = input.type === "checkbox" ? input.checked : input.value.trim() !== "" && input.checkValidity();
          var holder = input.closest(".field") || input.closest(".check");
          if (holder) holder.classList.toggle("is-invalid", !ok);
          if (!ok) valid = false;
        });
        if (!valid) {
          var firstBad = $(".is-invalid input, .is-invalid select, .is-invalid textarea", form);
          if (firstBad) firstBad.focus();
          return;
        }

        var btn = $("button[type=submit]", form);
        btn.disabled = true;
        btn.classList.add("is-loading");
        error.hidden = true;

        var data = new FormData(form);
        data.append("formulaire", form.getAttribute("data-form"));

        var send = CONFIG.formEndpoint
          ? fetch(CONFIG.formEndpoint, { method: "POST", body: data, headers: { Accept: "application/json" } })
              .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); })
          : new Promise(function (res) { setTimeout(res, 700); });

        send.then(function () {
          form.hidden = true;
          success.hidden = false;
          form.reset();
        }).catch(function () {
          error.hidden = false;
        }).then(function () {
          btn.disabled = false;
          btn.classList.remove("is-loading");
        });
      });

      $$("input, select, textarea", form).forEach(function (input) {
        input.addEventListener("input", function () {
          var holder = input.closest(".field") || input.closest(".check");
          if (holder) holder.classList.remove("is-invalid");
        });
      });
    });
  }

  // ---------- FAQ : une seule question ouverte à la fois ----------
  function initFaq() {
    var items = $$(".faq-item");
    items.forEach(function (d) {
      d.addEventListener("toggle", function () {
        if (d.open) items.forEach(function (o) { if (o !== d) o.open = false; });
      });
    });
  }

  applyConfig();
  renderProperties();
  renderReviews();
  initHeader();
  initReveal();
  initCounters();
  initServices();
  initFlip();
  initCarousels();
  initModal();
  initForms();
  initFaq();
})();
