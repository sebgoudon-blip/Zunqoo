(function () {
  "use strict";

  var CONFIG = window.SITE_CONFIG || {};

  // ------------------------------------------------------------
  // Biens présentés (photos libres de droit Pexels, usage commercial
  // autorisé sans attribution). Ce sont des exemples de TYPES de biens
  // du secteur : remplacez-les par vos vrais logements dès que possible.
  // "photos" accepte aussi des chemins locaux (ex : "images/mas-1.jpg").
  // ------------------------------------------------------------
  function px(id) {
    return "https://images.pexels.com/photos/" + id + "/pexels-photo-" + id + ".jpeg?auto=compress&cs=tinysrgb&w=900";
  }
  var PROPERTIES = [
    { title: "Mas en pierre avec piscine", city: "Drôme provençale", tags: ["Piscine", "Grand jardin"],
      photos: [px(37369019), px(28963493), px(34191306), px(31687845)] },
    { title: "Maison au milieu des lavandes", city: "Nyonsais & Tricastin", tags: ["Vue", "Calme absolu"],
      photos: [px(29837829), px(38499116), px(25921106), px(15456211)] },
    { title: "Gîte à deux pas des gorges", city: "Vallon-Pont-d'Arc", tags: ["Canoë", "Randonnée"],
      photos: [px(40308208), px(18598432), px(27872046), px(31492015)] },
    { title: "Maison de village provençale", city: "Grignan", tags: ["Centre historique", "Terrasse"],
      photos: [px(29837842), px(39614879), px(39524125), px(37334305)] },
    { title: "Villa contemporaine avec piscine", city: "Montélimar", tags: ["Piscine", "Familles"],
      photos: [px(26859026), px(20297248), px(18786201), px(40080688)] },
    { title: "Maison fleurie avec jardin", city: "Dieulefit", tags: ["Jardin", "Charme"],
      photos: [px(29942642), px(29942641), px(16959786), px(15692775)] },
    { title: "Gîte au bord de l'Ardèche", city: "Ruoms & alentours", tags: ["Rivière", "Nature"],
      photos: [px(31492016), px(16093350), px(30070551), px(24205634)] },
    { title: "Maison de caractère avec vue", city: "Les Vans & Cévennes", tags: ["Vue", "Piscine"],
      photos: [px(28586234), px(35069531), px(19346195), px(15501684)] }
  ];

  // ------------------------------------------------------------
  // Avis clients — TEXTES PROVISOIRES, à remplacer par de vrais avis.
  // Ils ne s'affichent que si showReviews vaut true dans config.js.
  // ------------------------------------------------------------
  var REVIEWS = [
    { name: "Catherine", role: "Propriétaire d'un mas", city: "Nyons", text: "Une équipe aux petits soins, pour mon logement comme pour mes voyageurs. Je ne m'occupe plus de rien et mes revenus ont augmenté." },
    { name: "Laurent", role: "Investisseur", city: "Montélimar", text: "Très réactifs et toujours de bon conseil. Le rapport mensuel est clair, je sais exactement où j'en suis." },
    { name: "Nathalie", role: "Propriétaire", city: "Grignan", text: "Ma maison de village n'a jamais été aussi bien notée. Les voyageurs parlent tous de l'accueil !" },
    { name: "Philippe", role: "Retraité", city: "Vallon-Pont-d'Arc", text: "J'habite loin de mon gîte et c'était un vrai casse-tête. Aujourd'hui tout roule, en toute confiance." },
    { name: "Sophie", role: "Cadre", city: "Dieulefit", text: "Ménage impeccable, linge parfait, réponses rapides aux voyageurs : exactement ce que j'attendais d'une conciergerie." },
    { name: "Julien", role: "Chef d'entreprise", city: "Ruoms", text: "Des prix ajustés au bon moment : mon calendrier d'été était plein bien plus tôt que d'habitude." },
    { name: "Isabelle", role: "Propriétaire", city: "Les Vans", text: "Sébastien et Alexandra sont des propriétaires comme nous, et ça se sent. Humains, sérieux et disponibles." },
    { name: "Marc", role: "Investisseur", city: "Bourg-Saint-Andéol", text: "Mise en place rapide, belles photos, annonce optimisée : les réservations sont arrivées dès la première semaine." }
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
      return '<div class="pslide"><img src="' + escapeHtml(p.photos[k]) + '" alt="' + escapeHtml(p.title + " · " + p.city) + '" loading="lazy" decoding="async"></div>';
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
            '<div class="property__meta">' + (p.tags || []).map(function (t) { return "<span>" + escapeHtml(t) + "</span>"; }).join("") + "</div>" +
            "<h3>" + escapeHtml(p.title) + "</h3>" +
            '<button class="btn btn--primary btn--block" data-open-estimate>Estimer un bien similaire</button>' +
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
    var show = CONFIG.showReviews === true;
    $("#Avis").hidden = !show;
    $("#Engagements").hidden = show;
    if (!show) return;
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
