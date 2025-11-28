<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>RiderCMS — Operations</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <link rel="stylesheet" href="assets/css/app.css" />
</head>
<body class="wrap">
  <header class="topbar">
    <strong>RiderCMS</strong>
    <nav>
      <a href="scan.html">Scan</a>
      <button id="logoutBtn" class="btn btn-outline">Logout</button>
    </nav>
  </header>

  <div class="grid">
    <section class="card">
      <h2>Context <span id="presenceBadge" class="badge">—</span></h2>
      <div class="row">
        <label>Booth
          <input id="ctxBooth" readonly />
        </label>
        <label>Slot
          <input id="ctxSlot" readonly />
        </label>
      </div>
      <div class="row">
        <label>MSISDN (2547XXXXXXXX)
          <input id="msisdn" placeholder="2547XXXXXXXX" />
        </label>
      </div>
      <div class="row">
        <button id="btnDeposit" class="btn">Deposit</button>
        <button id="btnQuote" class="btn btn-secondary">Collection Quote</button>
        <button id="btnPay" class="btn btn-secondary">Collection Pay</button>
        <button id="btnClose" class="btn btn-outline">Close Session</button>
      </div>
      <div class="row">
        <button id="btnUnlock" class="btn btn-accent">Open Door</button>
      </div>
      <p id="opMsg" class="muted"></p>
    </section>

    <!-- Set Context -->
    <section class="card">
      <h2>Set Context</h2>
      <div class="row">
        <label>Booth
          <input id="boothInput" placeholder="booth001" />
        </label>
        <label>Slot
          <input id="slotInput" placeholder="slot001" />
        </label>
      </div>
      <div class="row">
        <button id="saveContext" class="btn">Save Context</button>
        <p class="muted" style="margin-left:12px">Tip: You can also deep-link with <code>?booth=booth001&amp;slot=slot001</code>.</p>
      </div>
    </section>

    <section class="card">
      <h2>Device ACKs</h2>
      <div id="faultBanner" class="banner"></div>
      <pre id="ackOut" class="panel">—</pre>
    </section>

    <section class="card">
      <h2>Session by MSISDN</h2>
      <pre id="msisdnOut" class="panel">—</pre>
    </section>

    <section class="card">
      <h2>Session by Slot</h2>
      <pre id="slotOut" class="panel">—</pre>
    </section>
  </div>

  <!-- Self-contained page logic (no external operations.js needed) -->
  <script type="module">
    // Import Firebase (cache-busted init)
    import { auth, db } from "./assets/js/firebase-init.js?v=20250916-5";
    import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
    import { ref, set, get, child, onValue, off } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-database.js";
    import { deposit as apiDeposit, collectionQuote, collectionPay, closeSession } from "./assets/js/api.js?v=20250916-1";

    // UI
    const ctxBooth = document.getElementById("ctxBooth");
    const ctxSlot  = document.getElementById("ctxSlot");
    const msisdnEl = document.getElementById("msisdn");
    const msgEl    = document.getElementById("opMsg");
    const btnDeposit = document.getElementById("btnDeposit");
    const btnQuote   = document.getElementById("btnQuote");
    const btnPay     = document.getElementById("btnPay");
    const btnClose   = document.getElementById("btnClose");
    const btnUnlock  = document.getElementById("btnUnlock");
    const ackOut     = document.getElementById("ackOut");
    const msisdnOut  = document.getElementById("msisdnOut");
    const slotOut    = document.getElementById("slotOut");
    const presenceBadge = document.getElementById("presenceBadge");
    const faultBanner   = document.getElementById("faultBanner");
    const boothInput = document.getElementById("boothInput");
    const slotInput  = document.getElementById("slotInput");
    document.getElementById("logoutBtn")?.addEventListener("click", async () => {
      await signOut(auth); location.href = "login.html";
    });

    // Save booth/slot from URL once
    (function primeFromURL(){
      const u = new URL(location.href);
      const b = u.searchParams.get("booth");
      const s = u.searchParams.get("slot");
      if (b) sessionStorage.setItem("booth", b);
      if (s) sessionStorage.setItem("slot",  s);
    })();

    // Load context + reflect in UI
    let booth = sessionStorage.getItem("booth") || "";
    let slot  = sessionStorage.getItem("slot")  || "";
    if (ctxBooth) ctxBooth.value = booth;
    if (ctxSlot)  ctxSlot.value  = slot;
    if (boothInput) boothInput.value = booth;
    if (slotInput)  slotInput.value  = slot;

    // Manual save context
    document.getElementById("saveContext")?.addEventListener("click", () => {
      const b = (boothInput?.value || "").trim();
      const s = (slotInput?.value  || "").trim();
      if (!b || !s) return alert("Enter both booth and slot");
      sessionStorage.setItem("booth", b);
      sessionStorage.setItem("slot",  s);
      location.reload();
    });

    // Helpers
    const MSISDN_RE = /^2547\d{8}$/;
    function setMsg(text, isError=false){ msgEl.textContent = text; msgEl.style.color = isError ? "#ff6b6b" : ""; }
    function requireContext(){ if (!booth || !slot) { setMsg("Missing booth/slot. Use Set Context.", true); return false; } return true; }
    function validateMsisdn(){ const m = msisdnEl.value.trim(); if (!MSISDN_RE.test(m)) { setMsg("MSISDN must be 2547XXXXXXXX.", true); return null; } return m; }
    function safeJson(s){ try { return JSON.parse(s); } catch { return null; } }
    function fmtAgo(ms){ const s=Math.max(0,Math.floor(ms/1000)); if(s<60)return`${s}s ago`; const m=Math.floor(s/60); if(m<60)return`${m}m ago`; const h=Math.floor(m/60); return`${h}h ago`; }

    // Live listeners
    let refs = []; let msisdnRef = null;
    function attachPresence(){
      const pRef = ref(db, `/devicePresence/${booth}/${slot}`);
      onValue(pRef, snap => {
        const v = snap.val();
        if (!v || !v.ts){ presenceBadge.textContent="offline"; presenceBadge.className="badge badge-warn"; return; }
        const ageMs = Date.now() - v.ts*1000; const online = ageMs < 45000;
        presenceBadge.textContent = online ? `online • ${fmtAgo(ageMs)}` : `offline • last ${fmtAgo(ageMs)}`;
        presenceBadge.className = online ? "badge badge-ok" : "badge badge-warn";
      });
      refs.push(pRef);
    }
    function attachFaults(){
      const evRef = ref(db, `/deviceAcks/${booth}/${slot}/events`);
      onValue(evRef, snap => {
        let latest=null; snap.forEach(ch => { const v=ch.val(); if(!latest || (v?.ts||0)>(latest?.ts||0)) latest=v; });
        if (latest?.cmd === "fault") {
          const kind=(latest.result||"fault").toUpperCase();
          const vStr = (latest.voltage!==undefined)?` • V=${latest.voltage}`:"";
          const tStr = (latest.temperature!==undefined)?` • T=${latest.temperature}`:"";
          const when = latest.ts ? new Date(latest.ts*1000).toLocaleString():"";
          faultBanner.innerHTML = `⚠️ <strong>${kind}</strong>${vStr}${tStr} • ${when}`;
          faultBanner.classList.add("show");
        } else { faultBanner.textContent=""; faultBanner.classList.remove("show"); }
      });
      refs.push(evRef);
    }
    function attachCore(){
      if (!requireContext()) return;

      const ackRef  = ref(db, `/deviceAcks/${booth}/${slot}`);
      const slotRef = ref(db, `/sessionsBySlot/${booth}/${slot}`);
      onValue(ackRef,  s => { const v=s.val(); ackOut.textContent  = v ? JSON.stringify(v,null,2) : "—"; });
      onValue(slotRef, s => { const v=s.val(); slotOut.textContent = v ? JSON.stringify(v,null,2) : "—"; });
      refs.push(ackRef, slotRef);

      msisdnEl.addEventListener("input", bindMsisdnListener);
      bindMsisdnListener();

      attachPresence();
      attachFaults();
    }
    function bindMsisdnListener(){
      if (msisdnRef) { off(msisdnRef); msisdnRef=null; }
      const m = msisdnEl.value.trim();
      if (MSISDN_RE.test(m)) {
        msisdnRef = ref(db, `/sessionsByMsisdn/${m}/current`);
        onValue(msisdnRef, s => { const v=s.val(); msisdnOut.textContent = v ? JSON.stringify(v,null,2) : "—"; });
      } else { msisdnOut.textContent = "—"; }
    }
    window.addEventListener("beforeunload", () => { refs.forEach(r => off(r)); if (msisdnRef) off(msisdnRef); });

    // Buttons → HTTPS Functions
    btnDeposit.addEventListener("click", async () => {
      if (!requireContext()) return; const m=validateMsisdn(); if (!m) return;
      setMsg("Processing deposit…");
      try { const res=await apiDeposit(m,booth,slot); setMsg("Deposit OK."); msisdnOut.textContent=JSON.stringify(res,null,2); }
      catch(e){ setMsg(e.message||String(e),true); }
    });

    btnQuote.addEventListener("click", async () => {
      if (!requireContext()) return; const m=validateMsisdn(); if (!m) return;
      setMsg("Requesting collection quote…");
      try {
        const res=await collectionQuote(m,booth,slot);
        msisdnOut.textContent=JSON.stringify(res,null,2);
        const sessionId = res?.sessionId || res?.data?.sessionId;
        if (sessionId) { navigator.clipboard?.writeText(sessionId).catch(()=>{}); setMsg(`Quote OK. sessionId copied: ${sessionId}`); }
        else setMsg("Quote OK.");
      } catch(e){ setMsg(e.message||String(e),true); }
    });

    btnPay.addEventListener("click", async () => {
      setMsg("Attempting collection pay…");
      try {
        const fromMsisdn = safeJson(msisdnOut.textContent) || {};
        const fromSlot   = safeJson(slotOut.textContent)   || {};
        const sessionId =
          fromMsisdn.sessionId || fromMsisdn?.data?.sessionId ||
          fromSlot.sessionId   || fromSlot?.data?.sessionId   ||
          prompt("Enter sessionId:");
        if (!sessionId) { setMsg("No sessionId available.", true); return; }
        const res = await collectionPay(sessionId);
        setMsg('Payment OK (sandbox may show "skipped").'); msisdnOut.textContent=JSON.stringify(res,null,2);
      } catch(e){ setMsg(e.message||String(e),true); }
    });

    btnClose.addEventListener("click", async () => {
      const m=validateMsisdn(); if (!m) return; setMsg("Closing session…");
      try { const res=await closeSession(m); setMsg("Close OK."); msisdnOut.textContent=JSON.stringify(res,null,2); }
      catch(e){ setMsg(e.message||String(e),true); }
    });

    // Open Door (writes openDoorId once)
    btnUnlock.addEventListener("click", async () => {
      if (!requireContext()) return;
      const id = "web-" + Math.random().toString(16).slice(2);
      try {
        setMsg("Sending unlock…");
        await set(ref(db, `/booths/${booth}/slots/${slot}/cmd/openDoorId`), id);
        setMsg(`Unlock sent (id=${id}). Watch Device ACKs for completion.`);
      } catch (e) {
        setMsg(e.message || String(e), true);
      }
    });

    // Require login, then attach
    onAuthStateChanged(auth, (user) => { if (!user) { location.href="login.html"; return; } attachCore(); });
  </script>
</body>
</html>
