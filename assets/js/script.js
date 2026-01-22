// ============================================
// KODE JAVASCRIPT - SISTEM PEMILIHAN DENGAN SUPABASE
// ============================================

console.log("🚀 Sistem Pemilihan dengan Supabase dimulai...");

// ===== KONFIGURASI SUPABASE =====
const SUPABASE_URL = "https://kjwwzpwhibydoibpprar.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtqd3d6cHdoaWJ5ZG9pYnBwcmFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxMjY5NTAsImV4cCI6MjA4MzcwMjk1MH0.Qpa0eA_FH6pMQqoDOX2f6o29stIF2t_Esw7VEFiNTEY";

let supabase;
let supabaseChannel;
let candidates = [];
let votes = [];
let currentUser = null;
let selectedClass = null;
let selectedPaslon = {};
let settings = {};
let logos = {};

// Helper untuk render logo aman (Global)
const getLogoHtml = (logo, org, size = "50px") => {
  const orgName = org === "best" ? "BEST" : org === "dps" ? "DPS" : "PMR";
  const orgColor =
    org === "best"
      ? "var(--purple)"
      : org === "dps"
        ? "var(--orange)"
        : "var(--pink)";

  if (!logo) {
    const icon = org === "best" ? "👑" : org === "dps" ? "⚖️" : "❤️";
    return `<div style="width: ${size}; height: ${size}; border-radius: 50%; background: ${orgColor}; display: flex; align-items: center; justify-content: center; color: white; font-size: 1.5rem;">${icon}</div>`;
  }

  // Jika logo adalah URL (http/data:image)
  if (logo.startsWith("http") || logo.startsWith("data:image")) {
    return `<img src="${logo}" alt="${orgName}" style="width: ${size}; height: ${size}; border-radius: 50%; object-fit: cover;">`;
  }

  // Jika logo adalah raw SVG string yang belum ter-encode
  if (logo.trim().startsWith("<svg")) {
    try {
      const encodedSvg = "data:image/svg+xml;base64," + btoa(logo);
      return `<img src="${encodedSvg}" alt="${orgName}" style="width: ${size}; height: ${size}; border-radius: 50%; object-fit: cover;">`;
    } catch (e) {
      console.error("Error encoding SVG:", e);
      return `<div style="width: ${size}; height: ${size}; background: #eee; border-radius: 50%; display:flex; align-items:center; justify-content:center;">Error</div>`;
    }
  }

  // Fallback
  return `<img src="${logo}" alt="${orgName}" style="width: ${size}; height: ${size}; border-radius: 50%; object-fit: cover;">`;
};

// ===== INISIALISASI SUPABASE DENGAN REAL-TIME =====
async function initSupabase() {
  try {
    // Cek apakah library Supabase tersedia
    if (
      !window.supabase ||
      typeof window.supabase.createClient !== "function"
    ) {
      console.warn("⚠️ Library Supabase tidak tersedia. Mode offline aktif.");
      return false;
    }

    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log("✅ Supabase berhasil diinisialisasi");

    // Setup langganan real-time - Non-blocking agar tidak hang
    setupRealtimeSubscriptions().catch((err) =>
      console.error("Error setup real-time:", err),
    );

    return true;
  } catch (error) {
    console.error("❌ Gagal menginisialisasi Supabase:", error);
    return false;
  }
}

// ===== SETUP REAL-TIME SUBSCRIPTIONS =====
async function setupRealtimeSubscriptions() {
  try {
    // Subscribe ke perubahan pada tabel candidates
    const candidatesChannel = supabase
      .channel("candidates-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "candidates" },
        async (payload) => {
          console.log("Perubahan data candidates:", payload);
          await loadDataFromSupabase();
          await updateHomeStats();
          await loadQuickResults();

          // Refresh halaman jika sedang di halaman admin
          if (
            document.getElementById("admin-page").classList.contains("active")
          ) {
            await loadAdminCandidates();
          }

          // Refresh halaman jika sedang di halaman voting
          if (
            document.getElementById("vote-page").classList.contains("active")
          ) {
            await loadAllPaslon();
          }
        },
      )
      .subscribe();

    // Subscribe ke perubahan pada tabel votes
    const votesChannel = supabase
      .channel("votes-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "votes" },
        async (payload) => {
          console.log("Perubahan data votes:", payload);
          await loadDataFromSupabase();
          await updateHomeStats();
          await loadQuickResults();

          // Refresh halaman jika sedang di halaman results
          if (
            document.getElementById("results-page").classList.contains("active")
          ) {
            await loadResults();
          }

          // Refresh halaman jika sedang di halaman admin votes
          const votesSection = document.getElementById("admin-votes");
          if (votesSection && votesSection.classList.contains("active")) {
            await loadAdminVotes();
          }
        },
      )
      .subscribe();

    console.log("✅ Real-time subscriptions aktif");
  } catch (error) {
    console.error("❌ Error setting up real-time:", error);
  }
}

// ===== FUNGSI UTAMA =====

// 1. Navigasi Halaman - DIPERBAIKI
async function showPage(pageId) {
  console.log(`Navigasi ke: ${pageId}`);

  // Sembunyikan semua halaman
  document.querySelectorAll(".page").forEach((page) => {
    page.classList.remove("active");
  });

  // Tampilkan halaman target
  const targetPage = document.getElementById(pageId);
  if (targetPage) {
    targetPage.classList.add("active");

    // Load data sesuai halaman
    switch (pageId) {
      case "home-page":
        await updateHomeStats();
        await loadQuickResults();
        break;
      case "vote-page":
        if (typeof resetVoteForm === "function") resetVoteForm();
        await loadAllPaslon();
        break;
      case "results-page":
        await loadResults();
        break;
      case "login-page":
        // Reset form login
        if (document.getElementById("admin-password")) {
          document.getElementById("admin-password").value = "";
        }
        if (document.getElementById("login-message")) {
          document.getElementById("login-message").style.display = "none";
        }
        break;
      case "admin-page":
        if (currentUser && currentUser.role === "admin") {
          // Load data admin
          await loadAdminCandidates();
        } else {
          showPage("login-page");
        }
        break;
    }
  }

  // Update tombol navigasi aktif
  updateNavButtons(pageId);

  // Scroll ke atas
  window.scrollTo(0, 0);
}

// Ekspos ke window agar lebih reliabel
window.showPage = showPage;

// 2. Update tombol navigasi aktif
function updateNavButtons(activePage) {
  // Reset semua tombol
  document.querySelectorAll(".nav-links .btn").forEach((btn) => {
    btn.classList.remove("btn-primary");
    btn.classList.add("btn-secondary");
  });

  // Set tombol aktif
  switch (activePage) {
    case "home-page":
      document.getElementById("btn-home").classList.remove("btn-secondary");
      document.getElementById("btn-home").classList.add("btn-primary");
      break;
    case "vote-page":
      document.getElementById("btn-vote").classList.remove("btn-secondary");
      document.getElementById("btn-vote").classList.add("btn-primary");
      break;
    case "results-page":
      document.getElementById("btn-results").classList.remove("btn-secondary");
      document.getElementById("btn-results").classList.add("btn-primary");
      break;
    case "admin-page":
    case "login-page":
      document.getElementById("btn-admin").classList.remove("btn-secondary");
      document.getElementById("btn-admin").classList.add("btn-primary");
      break;
  }
}

// 3. Load Data dari Supabase - DIPERBAIKI
async function loadDataFromSupabase() {
  try {
    showLoading("Memuat data dari server...");

    // Load candidates dengan polling
    const { data: candidatesData, error: candidatesError } = await supabase
      .from("candidates")
      .select("*")
      .order("org", { ascending: true })
      .order("created_at", { ascending: true });

    if (candidatesError) {
      console.error("Error loading candidates:", candidatesError);
      candidates = [];
    } else {
      candidates = candidatesData || [];
      console.log(`Loaded ${candidates.length} candidates`);
    }

    // Load votes dengan urutan yang benar
    const { data: votesData, error: votesError } = await supabase
      .from("votes")
      .select("*")
      .order("kelas", { ascending: true }) // Urutkan berdasarkan kelas
      .order("nama", { ascending: true }) // Urutkan berdasarkan nama
      .order("created_at", { ascending: false });

    if (votesError) {
      console.error("Error loading votes:", votesError);
      votes = [];
    } else {
      votes = votesData || [];
      console.log(`Loaded ${votes.length} votes`);
    }

    // Load settings
    const { data: settingsData, error: settingsError } = await supabase
      .from("settings")
      .select("*");

    if (settingsError) {
      console.error("Error loading settings:", settingsError);
      settings = {};
    } else {
      settings = {};
      settingsData.forEach((item) => {
        settings[item.key] = item.value;
      });

      // Update UI dengan settings
      if (settings.website_title) {
        document.title = settings.website_title;
        const header = document.getElementById("website-header");
        if (header) {
          header.textContent = `🗳️ ${settings.website_title}`;
        }
      }

      if (settings.school_name && settings.election_period) {
        const schoolText = document.getElementById("school-info");
        if (schoolText) {
          schoolText.textContent = `${settings.school_name} | Periode ${settings.election_period}`;
        }
      }
    }

    // Load logos
    const { data: logosData, error: logosError } = await supabase
      .from("logos")
      .select("*");

    if (logosError) {
      console.error("Error loading logos:", logosError);
      logos = {};
    } else {
      logos = {};
      logosData.forEach((logo) => {
        logos[logo.org] = logo.logo_url;
      });

      // Update logo previews di admin
      updateLogoPreviews();

      // Update logo sekolah di header (jika ada)
      if (logos["school"]) {
        const headerLogo = document.querySelector(".logo-container img");
        if (headerLogo) {
          headerLogo.src = logos["school"];
          // Pastikan style aman
          headerLogo.style.objectFit = "cover";
        }
      }
    }

    console.log(
      `✅ Data dimuat: ${candidates.length} paslon, ${votes.length} suara`,
    );
    hideLoading();
  } catch (error) {
    console.error("❌ Error loading data:", error);
    hideLoading();
    showAlert("Error: Gagal memuat data dari server. Cek koneksi internet.");
  }
}

// 4. Update Statistik Beranda
async function updateHomeStats() {
  try {
    const totalCandidates = candidates.filter(
      (c) => c.status === "active",
    ).length;
    const totalVotes = votes.filter((v) => v.status === "voted").length;
    const totalUsers = 150; // Contoh total pemilih terdaftar

    document.getElementById("total-candidates").textContent = totalCandidates;
    document.getElementById("total-votes").textContent = totalVotes;

    const percentage =
      totalUsers > 0 ? Math.round((totalVotes / totalUsers) * 100) : 0;
    document.getElementById("vote-percentage").textContent = `${percentage}%`;

    // Update quick results
    await loadQuickResults();
  } catch (error) {
    console.error("Error updating home stats:", error);
  }
}

// 5. Load Hasil Cepat
async function loadQuickResults() {
  const container = document.getElementById("quick-results");
  if (!container) return;

  // Hitung suara per paslon
  const voteCounts = {};
  votes.forEach((vote) => {
    if (vote.selected_paslon && vote.status === "voted") {
      try {
        const paslonObj =
          typeof vote.selected_paslon === "string"
            ? JSON.parse(vote.selected_paslon)
            : vote.selected_paslon;
        Object.values(paslonObj).forEach((paslonId) => {
          voteCounts[paslonId] = (voteCounts[paslonId] || 0) + 1;
        });
      } catch (e) {
        console.error("Error parsing selected_paslon:", e);
      }
    }
  });

  // Update vote count di paslon
  candidates.forEach((paslon) => {
    paslon.votes = voteCounts[paslon.id] || 0;
  });

  // Kelompokkan berdasarkan organisasi
  const resultsByOrg = {
    best: [],
    dps: [],
    pmr: [],
  };

  candidates.forEach((paslon) => {
    if (paslon.status === "active") {
      resultsByOrg[paslon.org].push(paslon);
    }
  });

  let html = "";

  Object.entries(resultsByOrg).forEach(([org, orgCandidates]) => {
    if (orgCandidates.length === 0) return;

    const orgName = org === "best" ? "BEST" : org === "dps" ? "DPS" : "PMR";
    const orgColor =
      org === "best"
        ? "var(--purple)"
        : org === "dps"
          ? "var(--orange)"
          : "var(--pink)";

    // Ambil logo organisasi
    const orgLogo = logos[org];

    // Sort by votes
    orgCandidates.sort((a, b) => b.votes - a.votes);

    html += `
                <div style="background: white; border-radius: 12px; padding: 20px; margin-bottom: 20px; border: 2px solid ${orgColor};">
                    <div style="display: flex; align-items: center; margin-bottom: 15px; gap: 15px;">
                        ${getLogoHtml(orgLogo, org, "50px")}
                        <h3 style="color: ${orgColor}; margin: 0;">${orgName}</h3>
                    </div>
            `;

    orgCandidates.forEach((paslon) => {
      const totalVotes = votes.filter((v) => v.status === "voted").length;
      const percentage =
        totalVotes > 0 ? Math.round((paslon.votes / totalVotes) * 100) : 0;

      html += `
                    <div style="padding: 15px; background: #f8f9fa; border-radius: 10px; margin-bottom: 10px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <div style="font-weight: bold; color: var(--primary);">${paslon.ketua} & ${paslon.wakil}</div>
                            <div style="font-weight: bold; color: ${orgColor};">${paslon.votes} suara</div>
                        </div>
                        <div style="background: #e9ecef; height: 6px; border-radius: 10px;">
                            <div style="background: ${orgColor}; height: 100%; width: ${percentage}%; border-radius: 10px;"></div>
                        </div>
                    </div>
                `;
    });

    html += `</div>`;
  });

  container.innerHTML = html || "<p>Belum ada data hasil.</p>";
}

// 6. Setup tombol navigasi - DIPERBAIKI
function setupEventListeners() {
  console.log("Setting up event listeners...");

  // Navigasi utama - DIPERBAIKI
  const homeBtn = document.getElementById("btn-home");
  if (homeBtn) {
    homeBtn.addEventListener("click", function (e) {
      e.preventDefault();
      console.log("Home button clicked");
      showPage("home-page");
    });
  }

  const voteBtn = document.getElementById("btn-vote");
  if (voteBtn) {
    voteBtn.addEventListener("click", function (e) {
      e.preventDefault();
      console.log("Vote button clicked");
      showPage("vote-page");
    });
  }

  const resultsBtn = document.getElementById("btn-results");
  if (resultsBtn) {
    resultsBtn.addEventListener("click", function (e) {
      e.preventDefault();
      console.log("Results button clicked");
      showPage("results-page");
    });
  }

  const adminBtn = document.getElementById("btn-admin");
  if (adminBtn) {
    adminBtn.addEventListener("click", function (e) {
      e.preventDefault();
      console.log("Admin button clicked");
      if (currentUser && currentUser.role === "admin") {
        showPage("admin-page");
      } else {
        showPage("login-page");
      }
    });
  }

  // Tombol kembali
  const backVoteBtn = document.getElementById("btn-back-vote");
  if (backVoteBtn) {
    backVoteBtn.addEventListener("click", function (e) {
      e.preventDefault();
      showPage("home-page");
    });
  }

  const backResultsBtn = document.getElementById("btn-back-results");
  if (backResultsBtn) {
    backResultsBtn.addEventListener("click", function (e) {
      e.preventDefault();
      showPage("home-page");
    });
  }

  const backLoginBtn = document.getElementById("btn-back-login");
  if (backLoginBtn) {
    backLoginBtn.addEventListener("click", function (e) {
      e.preventDefault();
      showPage("home-page");
    });
  }

  console.log("✅ Event listeners setup complete");
}

// 7. Setup Voting System - DIPERBAIKI
function setupVotingSystem() {
  console.log("Setting up voting system...");

  // Pilihan Kelas
  const classOptions = document.querySelectorAll(".class-option");
  classOptions.forEach((option) => {
    option.addEventListener("click", function () {
      console.log("Class option clicked:", this.getAttribute("data-value"));
      document.querySelectorAll(".class-option").forEach((opt) => {
        opt.classList.remove("selected");
      });
      this.classList.add("selected");
      selectedClass = this.getAttribute("data-value");
      document.getElementById("selected-class").value = selectedClass;

      // Tampilkan tombol submit jika nama sudah diisi
      const voterName = document.getElementById("voter-name").value.trim();
      if (voterName && selectedClass) {
        document.getElementById("btn-submit-vote").style.display = "block";
      }
    });
  });

  // Real-time validation untuk nama pemilih
  const voterNameInput = document.getElementById("voter-name");
  if (voterNameInput) {
    voterNameInput.addEventListener("input", function () {
      const name = this.value.trim();
      if (name && selectedClass) {
        document.getElementById("btn-submit-vote").style.display = "block";
      } else {
        document.getElementById("btn-submit-vote").style.display = "none";
      }
    });
  }

  // Submit Vote
  const submitBtn = document.getElementById("btn-submit-vote");
  if (submitBtn) {
    submitBtn.addEventListener("click", submitVote);
  }

  // Skip Vote
  const skipBtn = document.getElementById("btn-skip-vote");
  if (skipBtn) {
    skipBtn.addEventListener("click", skipVote);
  }

  console.log("✅ Voting system setup complete");
}

// 8. Load semua paslon - DIPERBAIKI
async function loadAllPaslon() {
  try {
    // Filter hanya paslon aktif
    const activeCandidates = candidates.filter((c) => c.status === "active");

    if (activeCandidates.length === 0) {
      console.log("Tidak ada paslon aktif");
      const container = document.getElementById("paslon-container");
      if (container) {
        container.innerHTML =
          '<p style="text-align: center; padding: 30px; color: var(--gray);">Belum ada paslon yang terdaftar. Silakan hubungi admin.</p>';
      }
      return;
    }

    // Kelompokkan paslon berdasarkan organisasi
    const paslonByOrg = {
      best: activeCandidates.filter((c) => c.org === "best"),
      dps: activeCandidates.filter((c) => c.org === "dps"),
      pmr: activeCandidates.filter((c) => c.org === "pmr"),
    };

    const container = document.getElementById("paslon-container");
    if (!container) {
      console.error("Container paslon tidak ditemukan");
      return;
    }

    let html = "";

    // Loop untuk setiap organisasi
    Object.entries(paslonByOrg).forEach(([org, orgCandidates]) => {
      if (orgCandidates.length === 0) return;

      const orgName = org === "best" ? "BEST" : org === "dps" ? "DPS" : "PMR";
      const orgColor =
        org === "best"
          ? "var(--purple)"
          : org === "dps"
            ? "var(--orange)"
            : "var(--pink)";

      // Ambil logo organisasi
      const orgLogo = logos[org];

      // Header organisasi
      html += `
                    <div id="org-section-${org}" style="background: ${orgColor}15; padding: 20px; border-radius: 10px; margin-bottom: 25px; border-left: 5px solid ${orgColor};">
                        <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 15px;">
                            ${getLogoHtml(orgLogo, org, "40px")}
                            <div>
                                <h4 style="color: ${orgColor}; margin: 0;">${orgName}</h4>
                                <p style="color: var(--gray); font-size: 0.9rem; margin: 5px 0 0 0;">
                                    Pilih satu paslon
                                </p>
                            </div>
                        </div>
                `;

      // Daftar paslon untuk organisasi ini
      if (orgCandidates.length === 0) {
        html +=
          '<p style="text-align: center; padding: 20px; color: var(--gray);">Belum ada paslon untuk organisasi ini.</p>';
      } else {
        html += '<div class="candidates-grid">';

        orgCandidates.forEach((paslon) => {
          const isSelected = selectedPaslon[org] === paslon.id;
          const visiText =
            paslon.visi && paslon.visi.trim() !== ""
              ? paslon.visi
              : '<span style="color: var(--gray); font-style: italic;">Belum ada visi</span>';
          const misiText =
            paslon.misi && paslon.misi.trim() !== ""
              ? paslon.misi
              : '<span style="color: var(--gray); font-style: italic;">Belum ada misi</span>';

          html += `
                            <div class="candidate-card ${isSelected ? "selected" : ""}" data-id="${paslon.id}" data-org="${org}">
                                <div class="candidate-photo">
                                    ${
                                      paslon.foto
                                        ? `<img src="${paslon.foto}" alt="${paslon.ketua}" onerror="this.onerror=null; this.parentElement.innerHTML='<div style=\\'font-size: 4rem;\\'>👥</div>';">`
                                        : `<div style="font-size: 4rem;">👥</div>`
                                    }
                                </div>
                                <div class="candidate-info">
                                    <div class="candidate-name">${paslon.ketua} & ${paslon.wakil}</div>
                                    <div class="candidate-vision">"${visiText}"</div>
                                    <div class="candidate-mission">${misiText}</div>
                                    <button class="btn ${isSelected ? "btn-success" : "btn-primary"} select-paslon-btn" 
                                            data-id="${paslon.id}" 
                                            data-org="${org}" 
                                            style="width: 100%; margin-top: 15px;">
                                        ${isSelected ? "✅ Telah Dipilih" : "✅ Pilih Paslon Ini"}
                                    </button>
                                </div>
                            </div>
                        `;
        });

        html += "</div>";
      }

      html += `</div>`;
    });

    container.innerHTML =
      html ||
      '<p style="text-align: center; padding: 30px; color: var(--gray);">Belum ada data paslon.</p>';

    // Event listener untuk pilihan paslon
    document.querySelectorAll(".select-paslon-btn").forEach((btn) => {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();

        const paslonId = this.getAttribute("data-id");
        const org = this.getAttribute("data-org");

        console.log(`Memilih paslon: ${paslonId} untuk organisasi: ${org}`);

        // Simpan pilihan
        selectedPaslon[org] = paslonId;

        // Update tampilan
        document
          .querySelectorAll(`.candidate-card[data-org="${org}"]`)
          .forEach((card) => {
            card.classList.remove("selected");
            const btn = card.querySelector(".select-paslon-btn");
            if (btn) {
              btn.classList.remove("btn-success");
              btn.classList.add("btn-primary");
              btn.textContent = "✅ Pilih Paslon Ini";
            }
          });

        // Tandai paslon yang dipilih
        this.classList.remove("btn-primary");
        this.classList.add("btn-success");
        this.textContent = "✅ Telah Dipilih";
        this.closest(".candidate-card").classList.add("selected");

        // Update tombol submit
        updateSubmitButton();

        // Auto scroll ke organisasi berikutnya
        const nextOrg =
          org === "best" ? "dps" : org === "dps" ? "pmr" : "submit";
        if (nextOrg === "submit") {
          const submitBtn = document.getElementById("btn-submit-vote");
          if (submitBtn && !submitBtn.disabled) {
            submitBtn.scrollIntoView({
              behavior: "smooth",
              block: "center",
            });
          }
        } else {
          const nextSection = document.getElementById(`org-section-${nextOrg}`);
          if (nextSection) {
            nextSection.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
          }
        }
      });
    });

    // Update tombol submit
    updateSubmitButton();
  } catch (error) {
    console.error("Error loading paslon:", error);
    showAlert("Error: Gagal memuat data paslon.");
  }
}

// 9. Update tombol submit
function updateSubmitButton() {
  const submitBtn = document.getElementById("btn-submit-vote");
  if (!submitBtn) return;

  const orgs = ["best", "dps", "pmr"];
  const orgCount = orgs.filter((org) => selectedPaslon[org]).length;

  if (orgCount === 3) {
    submitBtn.disabled = false;
    submitBtn.innerHTML = "✅ Kirim Semua Suara (3/3 dipilih)";
  } else {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `✅ Kirim Semua Suara (${orgCount}/3 dipilih)`;
  }
}

// 10. Submit Vote ke Supabase - DIPERBAIKI
async function submitVote() {
  console.log("Submitting vote...");

  const voterName = document.getElementById("voter-name").value.trim();
  const selectedClass = document.getElementById("selected-class").value;

  // Validasi
  if (!voterName) {
    showMessage("vote-message", "error", "❌ Harap masukkan nama lengkap!");
    return;
  }

  if (!selectedClass) {
    showMessage("vote-message", "error", "❌ Harap pilih kelas/status!");
    return;
  }

  // Validasi sudah memilih semua organisasi
  const orgs = ["best", "dps", "pmr"];
  const allOrgsSelected = orgs.every((org) => selectedPaslon[org]);

  if (!allOrgsSelected) {
    showMessage(
      "vote-message",
      "error",
      "❌ Harap pilih paslon untuk ketiga organisasi!",
    );
    return;
  }

  // Cek apakah sudah voting
  const alreadyVoted = votes.some(
    (vote) =>
      vote.nama.toLowerCase() === voterName.toLowerCase() &&
      vote.kelas === selectedClass,
  );

  if (alreadyVoted) {
    showMessage("vote-message", "error", "❌ Anda sudah memberikan suara!");
    return;
  }

  // Konfirmasi
  if (
    !confirm(
      `Apakah Anda yakin dengan pilihan Anda?\n\nNama: ${voterName}\nKelas: ${selectedClass}\n\nKlik OK untuk melanjutkan.`,
    )
  ) {
    return;
  }

  // Disable tombol untuk mencegah double submit
  const submitBtn = document.getElementById("btn-submit-vote");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = "⏳ Mengirim...";
  }

  // Tampilkan loading
  showLoading("Mengirim suara Anda ke server...");

  try {
    // 1. Simpan vote ke Supabase (CRITICAL)
    const { data, error } = await supabase
      .from("votes")
      .insert([
        {
          nama: voterName,
          kelas: selectedClass,
          selected_paslon: selectedPaslon,
          status: "voted",
        },
      ])
      .select();

    if (error) throw error;

    // 2. Update vote count (NON-BLOCKING / PARALLEL)
    // Kita gunakan Promise.all agar lebih cepat, dan tidak membatalkan vote jika ini gagal sebagian
    const updatePromises = Object.entries(selectedPaslon).map(
      async ([org, paslonId]) => {
        const paslon = candidates.find((c) => c.id === paslonId);
        if (paslon) {
          const newVoteCount = (paslon.votes || 0) + 1;
          return supabase
            .from("candidates")
            .update({ votes: newVoteCount })
            .eq("id", paslonId);
        }
      },
    );

    // Tunggu semua update selesai (opsional: bisa di-await atau dibiarkan background jika ingin sangat cepat)
    // Kita await tapi dengan catch individual agar tidak throw error ke main block
    await Promise.all(updatePromises).catch((err) =>
      console.warn("Warning: Gagal update counter paslon", err),
    );

    // Sembunyikan loading
    hideLoading();

    // Animasi sukses
    showMessage(
      "vote-message",
      "success",
      "✅ Suara Anda berhasil dicatat! Terima kasih telah berpartisipasi.",
    );

    // Reset form
    resetVoteForm();

    // Otomatis kembali ke beranda setelah 3 detik
    setTimeout(() => {
      showPage("home-page");
    }, 3000);
  } catch (error) {
    console.error("Error submitting vote:", error);
    hideLoading();
    showMessage(
      "vote-message",
      "error",
      "❌ Gagal menyimpan suara: " + (error.message || "Koneksi bermasalah"),
    );

    // Enable tombol lagi jika gagal
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = "✅ Kirim Semua Suara (3/3 dipilih)";
    }
  }
}

// 11. Skip Vote (Tidak Hadir)
async function skipVote() {
  console.log("Skipping vote...");

  const voterName = document.getElementById("voter-name").value.trim();
  const selectedClass = document.getElementById("selected-class").value;

  if (!voterName || !selectedClass) {
    showMessage(
      "vote-message",
      "error",
      "❌ Harap lengkapi data diri terlebih dahulu!",
    );
    return;
  }

  if (!confirm("Apakah Anda yakin tidak hadir dalam pemilihan?")) {
    return;
  }

  showLoading("Menyimpan data ketidakhadiran...");

  try {
    // Simpan sebagai tidak hadir
    const { data, error } = await supabase
      .from("votes")
      .insert([
        {
          nama: voterName,
          kelas: selectedClass,
          status: "absent",
        },
      ])
      .select();

    if (error) throw error;

    // Refresh data
    await loadDataFromSupabase();

    hideLoading();
    resetVoteForm();
    showMessage(
      "vote-message",
      "success",
      "✅ Data ketidakhadiran berhasil dicatat.",
    );

    setTimeout(() => {
      showPage("home-page");
    }, 2000);
  } catch (error) {
    console.error("Error skipping vote:", error);
    hideLoading();
    showMessage("vote-message", "error", "❌ Gagal menyimpan data.");
  }
}

// 12. Reset Form Voting
function resetVoteForm() {
  const voterNameInput = document.getElementById("voter-name");
  const selectedClassInput = document.getElementById("selected-class");
  const paslonContainer = document.getElementById("paslon-container");
  const submitBtn = document.getElementById("btn-submit-vote");
  const messageEl = document.getElementById("vote-message");

  if (voterNameInput) voterNameInput.value = "";

  document.querySelectorAll(".class-option").forEach((opt) => {
    opt.classList.remove("selected");
  });

  if (selectedClassInput) selectedClassInput.value = "";

  if (paslonContainer) paslonContainer.innerHTML = "";

  if (submitBtn) {
    submitBtn.style.display = "none";
    submitBtn.disabled = true;
  }

  selectedPaslon = {};

  if (messageEl) {
    messageEl.style.display = "none";
  }
}

// 13. Load Hasil Lengkap
async function loadResults() {
  try {
    const container = document.getElementById("results-container");
    if (!container) return;

    // Hitung statistik
    const totalVotes = votes.length;
    const validVotes = votes.filter((v) => v.status === "voted").length;
    const absentVotes = votes.filter((v) => v.status === "absent").length;

    // Update statistik
    const resultsTotal = document.getElementById("results-total");
    const resultsValid = document.getElementById("results-valid");
    const resultsAbsent = document.getElementById("results-absent");

    if (resultsTotal) resultsTotal.textContent = totalVotes;
    if (resultsValid) resultsValid.textContent = validVotes;
    if (resultsAbsent) resultsAbsent.textContent = absentVotes;

    // Kelompokkan berdasarkan organisasi
    const resultsByOrg = {
      best: [],
      dps: [],
      pmr: [],
    };

    candidates.forEach((paslon) => {
      if (paslon.status === "active") {
        resultsByOrg[paslon.org].push(paslon);
      }
    });

    let html = "";

    Object.entries(resultsByOrg).forEach(([org, orgCandidates]) => {
      if (orgCandidates.length === 0) return;

      const orgName = org === "best" ? "BEST" : org === "dps" ? "DPS" : "PMR";
      const orgColor =
        org === "best"
          ? "var(--purple)"
          : org === "dps"
            ? "var(--orange)"
            : "var(--pink)";

      const orgLogo = logos[org];
      orgCandidates.sort((a, b) => b.votes - a.votes);

      html += `
                    <div style="background: white; border-radius: 12px; padding: 20px; margin-bottom: 20px; border: 2px solid ${orgColor};">
                        <div style="display: flex; align-items: center; margin-bottom: 15px; gap: 15px;">
                            ${getLogoHtml(orgLogo, org, "50px")}
                            <h3 style="color: ${orgColor}; margin: 0;">${orgName}</h3>
                        </div>
                `;

      orgCandidates.forEach((paslon) => {
        const percentage =
          validVotes > 0 ? Math.round((paslon.votes / validVotes) * 100) : 0;

        html += `
                        <div style="padding: 15px; background: #f8f9fa; border-radius: 10px; margin-bottom: 10px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <div style="font-weight: bold; color: var(--primary);">${paslon.ketua} & ${paslon.wakil}</div>
                                <div style="font-weight: bold; color: ${orgColor};">${paslon.votes} suara</div>
                            </div>
                            <div style="background: #e9ecef; height: 8px; border-radius: 10px; margin-bottom: 5px;">
                                <div style="background: ${orgColor}; height: 100%; width: ${percentage}%; border-radius: 10px;"></div>
                            </div>
                            <div style="font-size: 0.85rem; color: var(--gray);">
                                ${percentage}% dari total suara sah
                            </div>
                        </div>
                    `;
      });

      html += `</div>`;
    });

    container.innerHTML = html || "<p>Belum ada data hasil.</p>";
  } catch (error) {
    console.error("Error loading results:", error);
    showAlert("Error: Gagal memuat hasil.");
  }
}

// 14. Load Admin Votes - DIPERBAIKI DENGAN PENGURUTAN KELAS
async function loadAdminVotes() {
  try {
    const container = document.getElementById("votes-list");
    if (!container) return;

    // Cek apakah Supabase tersedia
    if (!supabase) {
      container.innerHTML =
        '<p style="color: var(--warning);">⚠️ Database tidak tersedia. Mode offline aktif.</p>';
      return;
    }

    showLoading("Memuat data suara...");

    // Ambil data dengan urutan yang benar
    const { data: votesData, error } = await supabase
      .from("votes")
      .select("*")
      .order("kelas", { ascending: true }) // Urutkan berdasarkan kelas
      .order("nama", { ascending: true }) // Urutkan berdasarkan nama
      .order("created_at", { ascending: false });

    if (error) throw error;

    if (votesData.length === 0) {
      container.innerHTML = "<p>Belum ada data suara.</p>";
      hideLoading();
      return;
    }

    // Urutan kelas yang benar
    const classOrder = [
      "10-1",
      "10-2",
      "10-3",
      "10-4",
      "10-5",
      "11-1",
      "11-2",
      "11-3",
      "11-4",
      "11-5",
      "12-1",
      "12-2",
      "12-3",
      "12-4",
      "12-5",
      "Guru",
      "Staff",
    ];

    // Kelompokkan data berdasarkan kelas
    const votesByClass = {};

    // Inisialisasi struktur untuk semua kelas
    classOrder.forEach((className) => {
      votesByClass[className] = [];
    });

    // Kelompokkan data
    votesData.forEach((vote) => {
      const kelas = vote.kelas || "Unassigned";
      if (votesByClass[kelas]) {
        votesByClass[kelas].push(vote);
      } else {
        votesByClass[kelas] = [vote];
      }
    });

    // Urutkan data dalam setiap kelas berdasarkan nama
    Object.keys(votesByClass).forEach((kelas) => {
      votesByClass[kelas].sort((a, b) => {
        return a.nama.localeCompare(b.nama);
      });
    });

    let html = "";

    // Tampilkan data per kelas sesuai urutan
    classOrder.forEach((className) => {
      const classVotes = votesByClass[className];

      if (classVotes && classVotes.length > 0) {
        html += `
                        <div style="margin-bottom: 40px; border: 1px solid #dee2e6; border-radius: 10px; overflow: hidden;">
                            <div style="background: var(--primary); color: white; padding: 15px; font-weight: bold; font-size: 1.1rem;">
                                📋 Kelas ${className} (${classVotes.length} data)
                            </div>
                            <div style="overflow-x: auto;">
                                <table style="width: 100%; border-collapse: collapse;">
                                    <thead>
                                        <tr>
                                            <th style="padding: 10px; background: #f8f9fa; color: var(--dark); text-align: center;">No</th>
                                            <th style="padding: 10px; background: #f8f9fa; color: var(--dark);">Nama Lengkap</th>
                                            <th style="padding: 10px; background: #f8f9fa; color: var(--dark);">Status</th>
                                            <th style="padding: 10px; background: #f8f9fa; color: var(--dark);">Waktu</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                    `;

        classVotes.forEach((vote, index) => {
          const date = new Date(vote.created_at);
          const timeString = date.toLocaleTimeString("id-ID", {
            hour: "2-digit",
            minute: "2-digit",
            day: "2-digit",
            month: "short",
          });

          html += `
                            <tr style="border-bottom: 1px solid #eee; ${index % 2 === 0 ? "background: #f9f9f9;" : ""}">
                                <td style="padding: 10px; text-align: center; font-weight: bold;">${index + 1}</td>
                                <td style="padding: 10px;">
                                    <strong>${vote.nama}</strong><br>
                                    <small style="color: var(--gray);">${className}</small>
                                </td>
                                <td style="padding: 10px;">
                                    <span style="display: inline-block; padding: 5px 15px; border-radius: 20px; font-size: 0.85rem; font-weight: 600; 
                                          background: ${vote.status === "voted" ? "var(--success)" : "var(--warning)"}; color: white;">
                                        ${vote.status === "voted" ? "✅ Sudah Voting" : "⏭️ Tidak Hadir"}
                                    </span>
                                </td>
                                <td style="padding: 10px; font-size: 0.9rem; color: var(--gray);">
                                    ${timeString}
                                </td>
                            </tr>
                        `;
        });

        html += `
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    `;
      }
    });

    // Tampilkan total keseluruhan
    html += `
                <div style="margin-top: 20px; padding: 15px; background: var(--light); border-radius: 10px; text-align: center;">
                    <h4 style="color: var(--primary); margin-bottom: 10px;">📊 Ringkasan Total</h4>
                    <div style="display: flex; justify-content: center; gap: 30px; flex-wrap: wrap;">
                        <div>
                            <div style="font-size: 1.5rem; font-weight: bold; color: var(--primary);">${votesData.length}</div>
                            <div>Total Data</div>
                        </div>
                        <div>
                            <div style="font-size: 1.5rem; font-weight: bold; color: var(--success);">${votesData.filter((v) => v.status === "voted").length}</div>
                            <div>Sudah Voting</div>
                        </div>
                        <div>
                            <div style="font-size: 1.5rem; font-weight: bold; color: var(--warning);">${votesData.filter((v) => v.status === "absent").length}</div>
                            <div>Tidak Hadir</div>
                        </div>
                    </div>
                </div>
            `;

    container.innerHTML = html;
    hideLoading();
  } catch (error) {
    console.error("Error loading admin votes:", error);
    hideLoading();
    const container = document.getElementById("votes-list");
    if (container) {
      container.innerHTML =
        '<p style="color: var(--danger); padding: 20px; text-align: center;">❌ Gagal memuat data suara.</p>';
    }
  }
}

// 14.5. Load Admin Results - DIPERBAIKI & DIPERBAIKI LAGI
async function loadAdminResults() {
  try {
    const container = document.getElementById("admin-results-content");
    if (!container) return;

    // Cek apakah Supabase tersedia
    if (!supabase) {
      container.innerHTML =
        '<p style="color: var(--warning);">⚠️ Database tidak tersedia. Mode offline aktif.</p>';
      return;
    }

    showLoading("Memuat hasil voting...");

    // Load candidates dan votes dengan query yang benar
    const [candidatesRes, votesRes] = await Promise.all([
      supabase
        .from("candidates")
        .select("*")
        .order("org", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("votes")
        .select("*")
        .order("created_at", { ascending: false }),
    ]);

    if (candidatesRes.error) throw candidatesRes.error;
    if (votesRes.error) throw votesRes.error;

    const candidatesData = candidatesRes.data || [];
    const votesData = votesRes.data || [];

    // Filter hanya votes yang sah (voted)
    const validVotes = votesData.filter((vote) => vote.status === "voted");
    const totalValidVotes = validVotes.length;

    // Hitung suara per paslon
    const voteCounts = {};
    validVotes.forEach((vote) => {
      if (vote.selected_paslon) {
        try {
          const selectedPaslon =
            typeof vote.selected_paslon === "string"
              ? JSON.parse(vote.selected_paslon)
              : vote.selected_paslon;

          Object.values(selectedPaslon).forEach((paslonId) => {
            if (paslonId) {
              voteCounts[paslonId] = (voteCounts[paslonId] || 0) + 1;
            }
          });
        } catch (e) {
          console.warn("Error parsing selected_paslon:", e);
        }
      }
    });

    // Update candidates dengan vote counts
    const candidatesWithVotes = candidatesData.map((candidate) => ({
      ...candidate,
      votes: voteCounts[candidate.id] || 0,
      percentage:
        totalValidVotes > 0
          ? (((voteCounts[candidate.id] || 0) / totalValidVotes) * 100).toFixed(
              1,
            )
          : "0.0",
    }));

    // Kelompokkan per organisasi
    const resultsByOrg = {
      best: candidatesWithVotes.filter(
        (c) => c.org === "best" && c.status === "active",
      ),
      dps: candidatesWithVotes.filter(
        (c) => c.org === "dps" && c.status === "active",
      ),
      pmr: candidatesWithVotes.filter(
        (c) => c.org === "pmr" && c.status === "active",
      ),
    };

    let html = `
                <div style="margin-bottom: 30px; padding: 20px; background: var(--light); border-radius: 10px;">
                    <h4 style="color: var(--primary); margin-bottom: 15px;">📊 Statistik Keseluruhan</h4>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                        <div style="text-align: center; padding: 15px; background: white; border-radius: 8px;">
                            <div style="font-size: 2rem; font-weight: bold; color: var(--primary);">${totalValidVotes}</div>
                            <div>Suara Sah</div>
                        </div>
                        <div style="text-align: center; padding: 15px; background: white; border-radius: 8px;">
                            <div style="font-size: 2rem; font-weight: bold; color: var(--warning);">${votesData.filter((v) => v.status === "absent").length}</div>
                            <div>Tidak Hadir</div>
                        </div>
                        <div style="text-align: center; padding: 15px; background: white; border-radius: 8px;">
                            <div style="font-size: 2rem; font-weight: bold; color: var(--dark);">${votesData.length}</div>
                            <div>Total Data</div>
                        </div>
                    </div>
                </div>
            `;

    // Tampilkan hasil per organisasi
    Object.entries(resultsByOrg).forEach(([org, orgCandidates]) => {
      const orgName = org === "best" ? "BEST" : org === "dps" ? "DPS" : "PMR";
      const orgColor =
        org === "best"
          ? "var(--purple)"
          : org === "dps"
            ? "var(--orange)"
            : "var(--pink)";

      // Ambil logo organisasi
      const orgLogo = logos[org];

      // Urutkan berdasarkan suara terbanyak
      orgCandidates.sort((a, b) => b.votes - a.votes);

      html += `
                    <div style="margin-bottom: 30px; border: 2px solid ${orgColor}; border-radius: 12px; overflow: hidden;">
                        <div style="background: ${orgColor}; color: white; padding: 15px 20px; display: flex; align-items: center; gap: 15px;">
                            ${getLogoHtml(orgLogo, org, "40px")}
                            <h3 style="margin: 0; font-size: 1.2rem;">${orgName}</h3>
                            <span style="margin-left: auto; background: rgba(255,255,255,0.2); padding: 5px 15px; border-radius: 20px;">
                                ${orgCandidates.length} Paslon
                            </span>
                        </div>
                        
                        <div style="padding: 20px;">
                `;

      if (orgCandidates.length === 0) {
        html += `<p style="text-align: center; color: var(--gray); padding: 20px;">Belum ada paslon aktif</p>`;
      } else {
        html += `
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 15px;">
                    `;

        orgCandidates.forEach((candidate, index) => {
          const isWinner = index === 0 && candidate.votes > 0;

          html += `
                            <div style="border: 1px solid #dee2e6; border-radius: 10px; padding: 15px; background: white; 
                                  ${isWinner ? `border-left: 5px solid ${orgColor};` : ""}">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                    <div style="font-weight: bold; color: var(--primary);">
                                        ${candidate.ketua} & ${candidate.wakil}
                                        ${isWinner ? '<span style="margin-left: 10px; font-size: 0.8rem; background: var(--success); color: white; padding: 2px 10px; border-radius: 10px;">TERBANYAK</span>' : ""}
                                    </div>
                                    <div style="font-weight: bold; color: ${orgColor}; font-size: 1.1rem;">
                                        ${candidate.votes} suara
                                    </div>
                                </div>
                                
                                <div style="margin-bottom: 10px;">
                                    <div style="font-size: 0.9rem; color: var(--gray); margin-bottom: 5px;">
                                        ${candidate.percentage}% dari total suara sah
                                    </div>
                                    <div style="height: 8px; background: #e9ecef; border-radius: 4px; overflow: hidden;">
                                        <div style="height: 100%; width: ${candidate.percentage}%; background: ${orgColor}; border-radius: 4px;"></div>
                                    </div>
                                </div>
                                
                                ${
                                  candidate.foto
                                    ? `
                                    <div style="margin-top: 10px;">
                                        <img src="${candidate.foto}" alt="Foto Paslon" 
                                             style="max-width: 80px; border-radius: 8px; border: 2px solid ${orgColor}30;">
                                    </div>
                                `
                                    : ""
                                }
                                
                                <div style="margin-top: 10px; font-size: 0.85rem; color: var(--gray); display: flex; justify-content: space-between;">
                                    <div>Visi: ${candidate.visi ? candidate.visi.substring(0, 50) + "..." : "<i>tidak ada</i>"}</div>
                                </div>
                            </div>
                        `;
        });

        html += `</div>`;
      }

      html += `
                        </div>
                    </div>
                `;
    });

    // Tambahkan chart ringkasan
    html += `
                <div style="margin-top: 30px; padding: 20px; background: white; border-radius: 12px; border: 2px solid var(--light);">
                    <h4 style="color: var(--primary); margin-bottom: 15px;">📈 Ringkasan Per Organisasi</h4>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px;">
            `;

    Object.entries(resultsByOrg).forEach(([org, orgCandidates]) => {
      const orgName = org === "best" ? "BEST" : org === "dps" ? "DPS" : "PMR";
      const orgColor =
        org === "best"
          ? "var(--purple)"
          : org === "dps"
            ? "var(--orange)"
            : "var(--pink)";

      const totalOrgVotes = orgCandidates.reduce((sum, c) => sum + c.votes, 0);
      const percentage =
        totalValidVotes > 0
          ? ((totalOrgVotes / totalValidVotes) * 100).toFixed(1)
          : "0.0";

      html += `
                    <div style="text-align: center; padding: 20px; border-radius: 10px; background: ${orgColor}15;">
                        <div style="font-size: 2.5rem; color: ${orgColor}; margin-bottom: 10px;">
                            ${org === "best" ? "👑" : org === "dps" ? "⚖️" : "❤️"}
                        </div>
                        <div style="font-size: 1.2rem; font-weight: bold; color: var(--dark);">${orgName}</div>
                        <div style="font-size: 2rem; font-weight: bold; color: ${orgColor}; margin: 10px 0;">${totalOrgVotes}</div>
                        <div style="font-size: 0.9rem; color: var(--gray);">${percentage}% total suara</div>
                    </div>
                `;
    });

    html += `
                    </div>
                </div>
            `;

    container.innerHTML = html;
    hideLoading();
  } catch (error) {
    console.error("Error loading admin results:", error);
    hideLoading();
    const container = document.getElementById("admin-results-content");
    if (container) {
      container.innerHTML =
        '<div style="padding: 40px; text-align: center; color: var(--danger);"><p>❌ Gagal memuat hasil voting.</p><p style="font-size: 0.9rem; margin-top: 10px;">Error: ' +
        (error.message || "Unknown") +
        "</p></div>";
    }
  }
}

// 15. Fungsi bantuan untuk logo previews
function updateLogoPreviews() {
  Object.entries(logos).forEach(([org, logoUrl]) => {
    const preview = document.getElementById(`logo-${org}-preview`);
    if (preview && logoUrl) {
      preview.innerHTML = getLogoHtml(logoUrl, org, "100%");
    }
  });
}

// 16. Setup Admin System - DIPERBAIKI
async function setupAdminSystem() {
  console.log("Setting up admin system...");

  // Login Admin
  const loginBtn = document.getElementById("btn-login");
  if (loginBtn) {
    loginBtn.addEventListener("click", loginAdmin);
  }

  // Enter untuk login
  const adminPasswordInput = document.getElementById("admin-password");
  if (adminPasswordInput) {
    adminPasswordInput.addEventListener("keypress", function (e) {
      if (e.key === "Enter") {
        loginAdmin();
      }
    });
  }

  // Admin Tabs
  document.querySelectorAll(".admin-tab").forEach((tab) => {
    tab.addEventListener("click", function () {
      const tabId = this.getAttribute("data-tab");

      document.querySelectorAll(".admin-tab").forEach((t) => {
        t.classList.remove("active");
      });
      this.classList.add("active");

      document.querySelectorAll(".admin-section").forEach((section) => {
        section.classList.remove("active");
      });

      const targetSection = document.getElementById("admin-" + tabId);
      if (targetSection) {
        targetSection.classList.add("active");

        switch (tabId) {
          case "candidates":
            loadAdminCandidates();
            break;
          case "votes":
            loadAdminVotes();
            break;
          case "results":
            loadAdminResults();
            break;
        }
      }
    });
  });

  // Tambah Paslon
  const addCandidateBtn = document.getElementById("btn-add-candidate");
  if (addCandidateBtn) {
    addCandidateBtn.addEventListener("click", addNewCandidate);
  }

  // Refresh Votes
  const refreshVotesBtn = document.getElementById("btn-refresh-votes");
  if (refreshVotesBtn) {
    refreshVotesBtn.addEventListener("click", () => {
      loadAdminVotes();
      alert("✅ Data disegarkan."); // Feedback visual sederhana
    });
  }

  // Export Votes - DIPERBAIKI
  const exportVotesBtn = document.getElementById("btn-export-votes");
  if (exportVotesBtn) {
    exportVotesBtn.addEventListener("click", exportVotesToPDF);
  }

  // Reset Votes
  const resetVotesBtn = document.getElementById("btn-reset-votes");
  if (resetVotesBtn) {
    resetVotesBtn.addEventListener("click", resetAllVotes);
  }

  // Save Settings
  const saveSettingsBtn = document.getElementById("btn-save-settings");
  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener("click", saveSettings);
  }

  // Logout
  const logoutBtn = document.getElementById("btn-admin-logout");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", logoutAdmin);
  }

  // Setup upload logo organisasi
  setupLogoUpload();

  // Setup Candidate Photo Upload trigger
  setupCandidatePhotoUpload();

  // Save Title trigger
  const saveTitleBtn = document.getElementById("btn-save-title");
  if (saveTitleBtn) {
    saveTitleBtn.addEventListener("click", saveSettings);
  }

  // Reset System trigger
  const resetSystemBtn = document.getElementById("btn-reset-system");
  if (resetSystemBtn) {
    resetSystemBtn.addEventListener("click", resetSystem);
  }

  console.log("✅ Admin system setup complete");
}

// 17. Login Admin - DIPERBAIKI
function loginAdmin() {
  const password = document.getElementById("admin-password").value;

  // Cek password dari settings atau default
  const validPassword = settings.admin_password || "admin2024";

  if (password === validPassword) {
    currentUser = { role: "admin" };
    showPage("admin-page");
    document.getElementById("admin-password").value = "";
    document.getElementById("login-message").style.display = "none";
  } else {
    showMessage("login-message", "error", "❌ Password salah!");
  }
}

// 18. Logout Admin
function logoutAdmin() {
  currentUser = null;
  showPage("home-page");
}

// 19. Load Admin Candidates - DIPERBAIKI
async function loadAdminCandidates() {
  try {
    const container = document.getElementById("admin-candidates-list");
    if (!container) return;

    // Cek apakah Supabase tersedia
    if (!supabase) {
      container.innerHTML =
        '<p style="color: var(--warning);">⚠️ Database tidak tersedia. Mode offline aktif.</p>';
      return;
    }

    showLoading("Memuat data paslon...");

    const { data: candidatesData, error } = await supabase
      .from("candidates")
      .select("*")
      .order("org", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) throw error;

    candidates = candidatesData || [];

    if (candidates.length === 0) {
      container.innerHTML = "<p>Belum ada paslon yang terdaftar.</p>";
      hideLoading();
      return;
    }

    let html =
      '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 20px;">';

    candidates.forEach((paslon) => {
      const orgColor =
        paslon.org === "best"
          ? "var(--purple)"
          : paslon.org === "dps"
            ? "var(--orange)"
            : "var(--pink)";
      const orgName =
        paslon.org === "best" ? "BEST" : paslon.org === "dps" ? "DPS" : "PMR";

      html += `
                    <div style="background: white; border-radius: 10px; padding: 20px; border: 1px solid #dee2e6; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
                        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 15px;">
                            <div>
                                <div style="font-weight: bold; color: var(--primary); font-size: 1.1rem;">${paslon.ketua} & ${paslon.wakil}</div>
                                <div style="display: flex; gap: 10px; margin-top: 8px;">
                                    <span style="background: ${orgColor}; color: white; padding: 3px 10px; border-radius: 15px; font-size: 0.8rem;">${orgName}</span>
                                    <span style="background: ${paslon.status === "active" ? "var(--success)" : "var(--danger)"}; color: white; padding: 3px 10px; border-radius: 15px; font-size: 0.8rem;">
                                        ${paslon.status === "active" ? "Aktif" : "Nonaktif"}
                                    </span>
                                </div>
                            </div>
                            <div style="display: flex; gap: 5px;">
                                <button class="btn-edit-candidate" data-id="${paslon.id}" style="background: var(--primary); color: white; border: none; padding: 8px 12px; border-radius: 5px; cursor: pointer; font-size: 0.9rem;">✏️ Edit</button>
                                <button class="btn-delete-candidate" data-id="${paslon.id}" style="background: var(--danger); color: white; border: none; padding: 8px 12px; border-radius: 5px; cursor: pointer; font-size: 0.9rem;">🗑️ Hapus</button>
                            </div>
                        </div>
                        
                        <div style="margin-top: 15px;">
                            <div><strong>Visi:</strong> ${paslon.visi || '<span style="color: var(--gray); font-style: italic;">Kosong</span>'}</div>
                            <div style="margin-top: 8px;"><strong>Misi:</strong> ${paslon.misi || '<span style="color: var(--gray); font-style: italic;">Kosong</span>'}</div>
                        </div>
                        
                        ${
                          paslon.foto
                            ? `
                            <div style="margin-top: 15px;">
                                <img src="${paslon.foto}" style="max-width: 100px; border-radius: 10px; border: 2px solid #dee2e6;">
                            </div>
                        `
                            : ""
                        }
                        
                        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #eee; font-size: 0.9rem; color: var(--gray); display: flex; justify-content: space-between;">
                            <div>ID: ${paslon.id.substring(0, 8)}...</div>
                            <div>Suara: <strong>${paslon.votes || 0}</strong></div>
                        </div>
                    </div>
                `;
    });

    html += "</div>";
    container.innerHTML = html;

    // Event listeners untuk edit/hapus
    document.querySelectorAll(".btn-edit-candidate").forEach((btn) => {
      btn.addEventListener("click", function () {
        const candidateId = this.getAttribute("data-id");
        editCandidate(candidateId);
      });
    });

    document.querySelectorAll(".btn-delete-candidate").forEach((btn) => {
      btn.addEventListener("click", function () {
        const candidateId = this.getAttribute("data-id");
        deleteCandidate(candidateId);
      });
    });

    hideLoading();
  } catch (error) {
    console.error("Error loading admin candidates:", error);
    hideLoading();
    showAlert("Error: Gagal memuat data paslon.");
  }
}

// 20. Export Votes to PDF - DIPERBAIKI DENGAN PENGURUTAN KELAS
async function exportVotesToPDF() {
  if (!supabase) return alert("⚠️ Database offline.");

  // Pastikan library dimuat
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("⚠️ Library PDF belum siap. Coba refresh halaman.");
    return;
  }

  const { jsPDF } = window.jspdf;
  showLoading("Mengexport data ke PDF...");

  try {
    // Ambil data terbaru dengan urutan yang benar
    const { data: votesData, error } = await supabase
      .from("votes")
      .select("*")
      .order("kelas", { ascending: true }) // Urutkan berdasarkan kelas
      .order("nama", { ascending: true }) // Urutkan berdasarkan nama
      .order("created_at", { ascending: false });

    if (error) throw error;

    if (!votesData || votesData.length === 0) {
      alert("⚠️ Tidak ada data suara untuk diexport.");
      hideLoading();
      return;
    }

    const doc = new jsPDF("p", "mm", "a4");

    // Header
    doc.setFontSize(16);
    doc.setTextColor(44, 90, 160); // Primary color
    doc.setFont(undefined, "bold");
    doc.text("LAPORAN DATA SUARA PEMILIH", 14, 15);

    doc.setFontSize(11);
    doc.setTextColor(80, 80, 80);
    doc.setFont(undefined, "normal");
    doc.text(settings.school_name || "SMAN 5 Bagan Sinembah", 14, 22);
    doc.text(
      `Periode: ${settings.election_period || "2026/2027"} | Tanggal Export: ${new Date().toLocaleDateString("id-ID")}`,
      14,
      27,
    );

    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.line(14, 30, 196, 30); // Separator line for header

    // Urutan kelas yang benar
    const classOrder = [
      "10-1",
      "10-2",
      "10-3",
      "10-4",
      "10-5",
      "11-1",
      "11-2",
      "11-3",
      "11-4",
      "11-5",
      "12-1",
      "12-2",
      "12-3",
      "12-4",
      "12-5",
      "Guru",
      "Staff",
    ];

    // Kelompokkan berdasarkan kelas dengan urutan yang benar
    const votesByClass = {};

    // Inisialisasi semua kelas
    classOrder.forEach((className) => {
      votesByClass[className] = [];
    });

    // Kelompokkan data
    votesData.forEach((vote) => {
      const kelas = vote.kelas || "Unassigned";
      if (votesByClass[kelas]) {
        votesByClass[kelas].push(vote);
      } else {
        votesByClass[kelas] = [vote];
      }
    });

    // Urutkan data dalam setiap kelas berdasarkan nama
    Object.keys(votesByClass).forEach((kelas) => {
      votesByClass[kelas].sort((a, b) => {
        return a.nama.localeCompare(b.nama);
      });
    });

    let finalY = 35;

    // Loop melalui setiap kelas sesuai urutan
    classOrder.forEach((kelas) => {
      const classVotes = votesByClass[kelas];

      if (classVotes.length === 0) return;

      if (finalY > 250) {
        doc.addPage();
        finalY = 20;
      }

      doc.setFontSize(12);
      doc.setTextColor(44, 90, 160);
      doc.setFont(undefined, "bold");
      doc.text(`Kelas: ${kelas} (${classVotes.length} Suara)`, 14, finalY);
      finalY += 5;

      const tableData = classVotes.map((vote, index) => {
        const date = new Date(vote.created_at).toLocaleString("id-ID", {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        });

        let best = "-",
          dps = "-",
          pmr = "-";

        if (vote.status === "voted" && vote.selected_paslon) {
          try {
            const parsed =
              typeof vote.selected_paslon === "string"
                ? JSON.parse(vote.selected_paslon)
                : vote.selected_paslon;

            const getPaslonName = (id) => {
              const p = candidates.find((c) => c.id === id);
              return p ? `${p.ketua} & ${p.wakil}` : id;
            };

            best = getPaslonName(parsed.best);
            dps = getPaslonName(parsed.dps);
            pmr = getPaslonName(parsed.pmr);
          } catch (e) {
            console.warn("Error parsing choices", e);
          }
        } else if (vote.status === "absent") {
          best = "TIDAK HADIR";
          dps = "TIDAK HADIR";
          pmr = "TIDAK HADIR";
        }

        return [index + 1, vote.nama, best, dps, pmr, date];
      });

      const headers = [
        ["No", "Nama", "Pilihan BEST", "Pilihan DPS", "Pilihan PMR", "Waktu"],
      ];

      doc.autoTable({
        head: headers,
        body: tableData,
        startY: finalY,
        theme: "grid",
        styles: {
          fontSize: 8,
          cellPadding: 2,
          valign: "middle",
        },
        headStyles: {
          fillColor: [44, 90, 160],
          textColor: 255,
          fontStyle: "bold",
          halign: "center",
        },
        columnStyles: {
          0: { cellWidth: 8, halign: "center" },
          1: { cellWidth: 42 },
          2: { cellWidth: 32 },
          3: { cellWidth: 32 },
          4: { cellWidth: 32 },
          5: { cellWidth: 30, halign: "center" },
        },
        margin: { left: 14, right: 14 },
      });

      finalY = doc.lastAutoTable.finalY + 15;
    });

    // Footer stats
    if (finalY > 260) {
      doc.addPage();
      finalY = 20;
    }

    doc.setDrawColor(44, 90, 160);
    doc.setLineWidth(0.5);
    doc.line(14, finalY - 5, 196, finalY - 5);

    doc.setFontSize(10);
    doc.setFont(undefined, "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(`Total Suara: ${votesData.length}`, 14, finalY);
    doc.text(
      `Suara Sah: ${votesData.filter((v) => v.status === "voted").length}`,
      60,
      finalY,
    );
    doc.text(
      `Tidak Hadir: ${votesData.filter((v) => v.status === "absent").length}`,
      110,
      finalY,
    );

    doc.save(
      `Data_Suara_Semua_Kelas_${new Date().toISOString().slice(0, 10)}.pdf`,
    );
  } catch (e) {
    console.error("Export error:", e);
    alert("❌ Gagal export PDF: " + e.message);
  } finally {
    hideLoading();
  }
}

// 21. Edit Candidate
function editCandidate(candidateId) {
  const candidate = candidates.find((c) => c.id === candidateId);
  if (!candidate) return;

  // Tampilkan form edit sederhana
  const newKetua = prompt("Edit Nama Ketua:", candidate.ketua);
  if (newKetua === null) return;

  const newWakil = prompt("Edit Nama Wakil:", candidate.wakil);
  if (newWakil === null) return;

  const newVisi = prompt("Edit Visi:", candidate.visi || "");
  const newMisi = prompt("Edit Misi:", candidate.misi || "");

  // Update data
  candidate.ketua = newKetua.trim();
  candidate.wakil = newWakil.trim();
  candidate.visi = newVisi ? newVisi.trim() : "";
  candidate.misi = newMisi ? newMisi.trim() : "";

  // Update ke Supabase
  updateCandidateInSupabase(candidate);
}

async function updateCandidateInSupabase(candidate) {
  // Cek Supabase
  if (!supabase) return alert("⚠️ Tidak dapat menyimpan: Database offline.");

  showLoading("Menyimpan perubahan...");

  try {
    const { error } = await supabase
      .from("candidates")
      .update({
        ketua: candidate.ketua,
        wakil: candidate.wakil,
        visi: candidate.visi,
        misi: candidate.misi,
      })
      .eq("id", candidate.id);

    if (error) throw error;

    await loadAdminCandidates();
    hideLoading();
    alert("✅ Data paslon berhasil diperbarui!");
  } catch (error) {
    console.error("Error updating candidate:", error);
    hideLoading();
    alert("❌ Gagal memperbarui data paslon.");
  }
}

// 22. Tambah Paslon Baru ke Supabase
async function addNewCandidate() {
  const ketua = document.getElementById("new-candidate-ketua").value.trim();
  const wakil = document.getElementById("new-candidate-wakil").value.trim();
  const org = document.getElementById("new-candidate-org").value;
  const status = document.getElementById("new-candidate-status").value;
  const vision = document.getElementById("new-candidate-vision").value.trim();
  const mission = document.getElementById("new-candidate-mission").value.trim();
  const photoFile = document.getElementById("candidate-photo").files[0];

  if (!ketua || !wakil) {
    showMessage(
      "add-candidate-message",
      "error",
      "❌ Nama ketua dan wakil wajib diisi!",
    );
    return;
  }

  // Cek Supabase
  if (!supabase)
    return alert("⚠️ Tidak dapat menambah paslon: Database offline.");

  showLoading("Menambahkan paslon baru...");

  try {
    let photoUrl = "";

    // Proses foto jika ada
    if (photoFile) {
      if (photoFile.size > 2 * 1024 * 1024)
        throw new Error("Ukuran foto maksimal 2MB");

      // Convert to base64
      photoUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(photoFile);
        reader.onload = () => resolve(reader.result);
        reader.onerror = (error) => reject(error);
      });
    }

    const newCandidate = {
      ketua,
      wakil,
      visi: vision || "",
      misi: mission || "",
      org,
      status,
      votes: 0,
      foto: photoUrl, // Simpan URL/Base64 foto
    };

    const { data, error } = await supabase
      .from("candidates")
      .insert([newCandidate])
      .select();

    if (error) throw error;

    // Reset form
    document.getElementById("new-candidate-ketua").value = "";
    document.getElementById("new-candidate-wakil").value = "";
    document.getElementById("new-candidate-vision").value = "";
    document.getElementById("new-candidate-mission").value = "";
    document.getElementById("candidate-photo").value = "";

    // Reset preview foto
    const preview = document.getElementById("photo-preview");
    const uploadArea = document.getElementById("photo-upload-area");
    if (preview) {
      preview.src = "";
      preview.style.display = "none";
    }
    if (uploadArea) uploadArea.style.display = "block";

    // Refresh data
    await loadDataFromSupabase();
    await loadAdminCandidates();

    hideLoading();
    showMessage(
      "add-candidate-message",
      "success",
      "✅ Paslon baru berhasil ditambahkan!",
    );
  } catch (error) {
    console.error("Error adding candidate:", error);
    hideLoading();
    showMessage(
      "add-candidate-message",
      "error",
      "❌ Gagal menambahkan paslon.",
    );
  }
}

// 23. Delete Candidate
async function deleteCandidate(candidateId) {
  if (!confirm("Apakah Anda yakin ingin menghapus paslon ini?")) {
    return;
  }

  // Cek Supabase
  if (!supabase) return alert("⚠️ Tidak dapat menghapus: Database offline.");

  showLoading("Menghapus paslon...");

  try {
    const { error } = await supabase
      .from("candidates")
      .delete()
      .eq("id", candidateId);

    if (error) throw error;

    await loadDataFromSupabase();
    await loadAdminCandidates();

    hideLoading();
    alert("✅ Paslon berhasil dihapus!");
  } catch (error) {
    console.error("Error deleting candidate:", error);
    hideLoading();
    alert("❌ Gagal menghapus paslon.");
  }
}

// 24. Reset All Votes
async function resetAllVotes() {
  if (!confirm("PERINGATAN: Ini akan menghapus SEMUA data suara! Lanjutkan?")) {
    return;
  }

  // Cek Supabase
  if (!supabase) return alert("⚠️ Tidak dapat mereset: Database offline.");

  showLoading("Menghapus semua data suara...");

  try {
    // Hapus semua votes
    const { error: deleteError } = await supabase
      .from("votes")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");

    if (deleteError) throw deleteError;

    // Reset vote count di candidates
    const { error: updateError } = await supabase
      .from("candidates")
      .update({ votes: 0 })
      .neq("id", "00000000-0000-0000-0000-000000000000");

    if (updateError) throw updateError;

    // Refresh data
    await loadDataFromSupabase();

    hideLoading();
    alert("✅ Semua data suara telah direset!");
  } catch (error) {
    console.error("Error resetting votes:", error);
    hideLoading();
    alert("❌ Gagal mereset data suara.");
  }
}

// 25. Reset System
async function resetSystem() {
  if (
    !confirm(
      "🚨 PERINGATAN KRITIS: Ini akan menghapus SELURUH data sistem termasuk SEMUA Paslon dan SEMUA Suara! \n\nTindakan ini tidak dapat dibatalkan. Lanjutkan?",
    )
  ) {
    return;
  }

  if (
    !confirm(
      "Konfirmasi terakhir: Anda benar-benar yakin ingin mengosongkan sistem?",
    )
  ) {
    return;
  }

  // Cek Supabase
  if (!supabase) return alert("⚠️ Tidak dapat mereset: Database offline.");

  showLoading("Mereset seluruh sistem...");

  try {
    // 1. Hapus semua votes
    const { error: errorVotes } = await supabase
      .from("votes")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");

    if (errorVotes) throw errorVotes;

    // 2. Hapus semua candidates
    const { error: errorCandidates } = await supabase
      .from("candidates")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");

    if (errorCandidates) throw errorCandidates;

    // 3. Reset logos (optional, tapi biasanya diinginkan saat "reset sistem")
    const { error: errorLogos } = await supabase
      .from("logos")
      .delete()
      .neq("org", "placeholder_fixed_id");

    if (errorLogos) throw errorLogos;

    hideLoading();
    alert("✅ Sistem berhasil direset total!");
    location.reload();
  } catch (error) {
    console.error("Error resetting system:", error);
    hideLoading();
    alert("❌ Gagal mereset sistem: " + error.message);
  }
}

// 26. Save Settings
async function saveSettings() {
  // Cek Supabase
  if (!supabase) return alert("⚠️ Tidak dapat menyimpan: Database offline.");

  const websiteTitle = document.getElementById("website-title").value;
  const schoolName = document.getElementById("school-name").value;
  const electionPeriod = document.getElementById("election-period").value;
  const newPassword = document.getElementById("new-password").value;
  const confirmPassword = document.getElementById("confirm-password").value;
  const logoFile = document.getElementById("school-logo").files[0];

  if (newPassword && newPassword !== confirmPassword) {
    alert("❌ Password baru dan konfirmasi tidak cocok!");
    return;
  }

  showLoading("Menyimpan pengaturan...");

  try {
    const updates = [];

    if (websiteTitle)
      updates.push({ key: "website_title", value: websiteTitle });
    if (schoolName) updates.push({ key: "school_name", value: schoolName });
    if (electionPeriod)
      updates.push({ key: "election_period", value: electionPeriod });
    if (newPassword)
      updates.push({ key: "admin_password", value: newPassword });

    // Simpan text settings
    if (updates.length > 0) {
      const { error } = await supabase
        .from("settings")
        .upsert(updates, { onConflict: "key" });
      if (error) throw error;
    }

    // Simpan Logo Sekolah (jika ada)
    if (logoFile) {
      if (logoFile.size > 2 * 1024 * 1024)
        throw new Error("Ukuran logo maksimal 2MB");

      const reader = new FileReader();
      reader.readAsDataURL(logoFile);
      await new Promise((resolve, reject) => {
        reader.onload = async () => {
          try {
            const base64 = reader.result;
            // Simpan sebagai 'school' di tabel logos agar konsisten
            const { error: logoError } = await supabase
              .from("logos")
              .upsert(
                { org: "school", logo_url: base64 },
                { onConflict: "org" },
              );

            if (logoError) throw logoError;

            // Update lokal
            logos["school"] = base64;
            resolve();
          } catch (e) {
            reject(e);
          }
        };
        reader.onerror = reject;
      });
    }

    alert("✅ Pengaturan berhasil disimpan!");
    location.reload(); // Refresh untuk menerapkan perubahan
  } catch (error) {
    console.error("Error saving settings:", error);
    alert("❌ Gagal menyimpan pengaturan: " + error.message);
  } finally {
    hideLoading();
  }
}

// 27. Setup Logo Upload - DIPERBAIKI
function setupLogoUpload() {
  document.querySelectorAll(".upload-logo-btn").forEach((btn) => {
    btn.addEventListener("click", function () {
      const org = this.getAttribute("data-org");
      const fileInput = document.querySelector(
        `.logo-upload-input[data-org="${org}"]`,
      );
      if (fileInput) {
        fileInput.click();
      }
    });
  });

  document.querySelectorAll(".logo-upload-input").forEach((input) => {
    input.addEventListener("change", async function (e) {
      const org = this.getAttribute("data-org");
      const file = e.target.files[0];
      if (file) {
        // Validasi file
        if (!file.type.startsWith("image/")) {
          alert("❌ File harus berupa gambar!");
          return;
        }

        if (file.size > 2 * 1024 * 1024) {
          // 2MB
          alert("❌ Ukuran file maksimal 2MB!");
          return;
        }

        showLoading("Mengupload logo...");

        try {
          const reader = new FileReader();
          reader.onload = async function (event) {
            const logoUrl = event.target.result;

            // Simpan ke Supabase
            const { error } = await supabase
              .from("logos")
              .upsert({ org, logo_url: logoUrl }, { onConflict: "org" });

            if (error) throw error;

            // Update lokal
            logos[org] = logoUrl;

            // Update preview
            const preview = document.getElementById(`logo-${org}-preview`);
            if (preview) {
              preview.innerHTML = `<img src="${logoUrl}" alt="Logo ${org}" style="width: 100%; height: 100%; object-fit: cover;">`;
            }

            hideLoading();
            alert(`✅ Logo ${org.toUpperCase()} berhasil diupload!`);
          };
          reader.readAsDataURL(file);
        } catch (error) {
          console.error("Error uploading logo:", error);
          hideLoading();
          alert("❌ Gagal mengupload logo.");
        }
      }
    });
  });
}

// 28. Setup Preview Foto Paslon
function setupCandidatePhotoUpload() {
  const uploadArea = document.getElementById("photo-upload-area");
  const fileInput = document.getElementById("candidate-photo");
  const preview = document.getElementById("photo-preview");

  if (uploadArea && fileInput) {
    uploadArea.addEventListener("click", () => {
      fileInput.click();
    });

    fileInput.addEventListener("change", function (e) {
      const file = e.target.files[0];
      if (file) {
        if (!file.type.startsWith("image/")) {
          alert("❌ File harus berupa gambar!");
          return;
        }

        const reader = new FileReader();
        reader.onload = function (event) {
          if (preview) {
            preview.src = event.target.result;
            preview.style.display = "block";
            uploadArea.style.display = "none"; // Sembunyikan area upload
          }
        };
        reader.readAsDataURL(file);
      }
    });

    // Klik preview untuk ganti foto
    if (preview) {
      preview.addEventListener("click", () => {
        if (confirm("Ganti foto?")) {
          fileInput.click();
        }
      });
    }
  }
}

// ===== FUNGSI BANTUAN =====

function showMessage(elementId, type, text) {
  const element = document.getElementById(elementId);
  if (element) {
    element.textContent = text;
    element.className = `alert alert-${type}`;
    element.style.display = "block";

    setTimeout(() => {
      element.style.display = "none";
    }, 5000);
  }
}

function showAlert(message) {
  alert(message);
}

function showLoading(message = "Memproses...") {
  const overlay = document.getElementById("loading-overlay");
  if (!overlay) return;

  const textElement = overlay.querySelector(".loading-text-main");
  if (textElement) {
    textElement.textContent = message;
  }

  overlay.classList.add("active");
}

function hideLoading() {
  const overlay = document.getElementById("loading-overlay");
  if (!overlay) return;

  overlay.classList.remove("active");
}

// ===== INISIALISASI APLIKASI =====

async function initializeApp() {
  console.log("🎯 Menginisialisasi aplikasi dengan Supabase...");

  try {
    // Setup event listeners - HARUS SEBELUM POTENSI ERROR/EXIT
    setupEventListeners();
    setupVotingSystem();
    await setupAdminSystem();

    // Setup Supabase dengan real-time
    const supabaseReady = await initSupabase();
    if (!supabaseReady) {
      console.warn(
        "Aplikasi berjalan dalam mode offline karena koneksi Supabase gagal.",
      );
      // Tidak perlu showAlert karena initSupabase sudah menanganinya
    } else {
      // Load data awal dari Supabase
      await loadDataFromSupabase();
    }

    // Tampilkan halaman beranda
    showPage("home-page");

    console.log("✅ Aplikasi siap digunakan dengan real-time updates!");
  } catch (error) {
    console.error("❌ Error inisialisasi:", error);
    showAlert(
      "Terjadi kesalahan saat memuat aplikasi. Silakan refresh halaman.",
    );
  }
}

// ===== JALANKAN APLIKASI =====

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeApp);
} else {
  initializeApp();
}

console.log("✨ Script berhasil dimuat!");
