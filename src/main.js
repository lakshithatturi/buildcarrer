import "./style.css";

const STORAGE_KEY = "build-carrier-workspace-v1";
const skillTerms = [
  "JavaScript",
  "TypeScript",
  "Python",
  "Java",
  "C++",
  "SQL",
  "PostgreSQL",
  "React",
  "Next.js",
  "Node.js",
  "FastAPI",
  "REST API",
  "Docker",
  "Kubernetes",
  "AWS",
  "Azure",
  "Git",
  "Linux",
  "Machine Learning",
  "Data Analysis",
  "Figma",
  "Product Management",
  "Project Management",
  "Communication",
  "Leadership",
  "Research",
  "HTML",
  "CSS",
  "Excel",
  "Power BI",
  "TensorFlow",
  "PyTorch",
  "pgvector",
  "RAG",
  "Generative AI",
];

const policyText = {
  privacy: {
    kicker: "PRIVACY NOTICE",
    title: "Privacy, by design",
    paragraphs: [
      [
        "What this app stores",
        "Profile details, extracted resume text, saved job descriptions, learning plans, step progress, and your weekly study-hour setting are stored in this browser. When you analyze a role, the job description and relevant profile/resume text are sent to the local Node.js API and local Ollama models on this device. Requests are not saved by the API or sent to an external service.",
      ],
      [
        "Files and processing",
        "Resume files are read in your browser to extract text. The original file is not uploaded or retained by this app. Imported text is stored locally until you remove it or clear this browser’s site data.",
      ],
      [
        "Your choices",
        "Remove your resume from the Resume page, edit your profile, or clear this site’s local storage in your browser settings to remove saved information. Avoid using a shared device for sensitive documents.",
      ],
      [
        "Scope",
        "This notice describes the local prototype, not a hosted production service. If deployment, analytics, accounts, or remote AI are added, this notice must be updated before those features are used.",
      ],
    ],
  },
  terms: {
    kicker: "TERMS OF USE",
    title: "Using this workspace",
    paragraphs: [
      [
        "A local productivity tool",
        "Build Carrier is a browser-based workspace for organizing professional information and reviewing job requirements. It is provided as-is and is not an employment, legal, or recruiting service.",
      ],
      [
        "Analysis limitations",
        "The local models extract job requirements, retrieve related passages from your supplied information, and judge whether those passages support each requirement. Practice-hour estimates are rough planning aids, not promises of proficiency or employment. Models can miss context or make mistakes; review every result yourself.",
      ],
      [
        "Your materials",
        "You are responsible for having permission to use any resume, job description, or other content you enter. Review generated previews carefully; this prototype only formats text you supplied and does not verify its accuracy.",
      ],
      [
        "No service guarantee",
        "This prototype stores information in the current browser and does not provide account sync, backups, or recovery. Keep your own copy of important documents. These terms should be reviewed for the laws and requirements of any production release.",
      ],
    ],
  },
};

const blankState = {
  profile: {
    name: "",
    headline: "",
    location: "",
    email: "",
    skills: "",
    experience: "",
  },
  resume: { name: "", text: "" },
  job: "",
  analysis: null,
  hoursPerWeek: 5,
  completedSteps: {},
  viewMode: "list",
  currentFlashIndex: 0,
};
let state = loadState();
let toastTimeout;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return {
      ...structuredClone(blankState),
      ...saved,
      profile: { ...blankState.profile, ...saved?.profile },
      resume: { ...blankState.resume, ...saved?.resume },
      completedSteps: { ...saved?.completedSteps },
      hoursPerWeek:
        Number.isInteger(saved?.hoursPerWeek) &&
        saved.hoursPerWeek >= 1 &&
        saved.hoursPerWeek <= 40
          ? saved.hoursPerWeek
          : blankState.hoursPerWeek,
      viewMode: ["list", "flash"].includes(saved?.viewMode)
        ? saved.viewMode
        : "list",
      currentFlashIndex: Number.isInteger(saved?.currentFlashIndex)
        ? saved.currentFlashIndex
        : 0,
    };
  } catch {
    return structuredClone(blankState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  render();
}

function escapeHtml(value = "") {
  return String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
}

function normalizedText(value) {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}+#.]+/gu, " ");
}

function containsTerm(text, term) {
  const haystack = ` ${normalizedText(text)} `;
  const needle = ` ${normalizedText(term)} `;
  return haystack.includes(needle);
}

function profileText() {
  const { name, headline, location, email, skills, experience } = state.profile;
  return [name, headline, location, email, skills, experience]
    .filter(Boolean)
    .join("\n");
}

function evidenceSkills() {
  const fromResume = skillTerms.filter((term) =>
    containsTerm(state.resume.text, term),
  );
  const fromProfile = skillTerms.filter((term) =>
    containsTerm(
      `${state.profile.skills} ${state.profile.experience} ${state.profile.headline}`,
      term,
    ),
  );
  return [...new Set([...fromProfile, ...fromResume])];
}

function evidenceText() {
  return [
    state.profile.skills && `Profile skills:\n${state.profile.skills}`,
    state.profile.experience &&
      `Profile experience:\n${state.profile.experience}`,
    state.resume.text && `Resume:\n${state.resume.text}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function analyzeDescription(description) {
  const analyzeButtons = [
    document.querySelector("#analyze-job"),
    document.querySelector("#analyze-job-secondary"),
  ];
  analyzeButtons.forEach((button) => {
    button.disabled = true;
  });
  document.querySelector("#job-save-state").textContent =
    "Running Qwen3 + Nomic locally...";
  document.querySelector("#job-save-state-secondary").textContent =
    "Running Qwen3 + Nomic locally...";

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description,
        evidenceText: evidenceText(),
      }),
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "The local analysis request failed.");
    }

    state.analysis = result;
    state.job = description;
    saveState();
    showToast(
      result.requirements.length
        ? "Role requirements analyzed and learning gaps scheduled."
        : "No specific skill requirements were extracted from this description.",
    );
  } catch (error) {
    document.querySelector("#job-save-state").textContent =
      "Local analysis could not finish.";
    document.querySelector("#job-save-state-secondary").textContent =
      "Local analysis could not finish.";
    showToast(error.message || "Could not reach the local analysis server.");
  } finally {
    analyzeButtons.forEach((button) => {
      button.disabled = false;
    });
  }
}

function percentComplete() {
  const fields = Object.values(state.profile).filter((value) => value.trim());
  return Math.round((fields.length / Object.keys(state.profile).length) * 100);
}

function renderMetrics() {
  const profilePercent = percentComplete();
  const evidenceCount = evidenceSkills().length;
  const requirements = state.analysis?.requirements ?? [];
  const matchPercent = requirements.length
    ? Math.round((state.analysis.matched.length / requirements.length) * 100)
    : null;
  document.querySelector("#metric-profile").innerHTML =
    `${profilePercent}<span>%</span>`;
  document.querySelector("#metric-evidence").textContent = String(
    evidenceCount,
  ).padStart(2, "0");
  document.querySelector("#metric-requirements").textContent = String(
    requirements.length,
  ).padStart(2, "0");
  document.querySelector("#metric-match").textContent =
    matchPercent === null ? "--" : `${matchPercent}%`;
  document.querySelector("#profile-metric-note").textContent = profilePercent
    ? `${Object.values(state.profile).filter((value) => value.trim()).length} of 6 fields added`
    : "No profile details yet";
  document.querySelector("#match-metric-note").textContent =
    matchPercent === null
      ? "Add a job description"
      : `${state.analysis.matched.length} of ${requirements.length} terms supported`;
}

function renderOverview() {
  document.querySelector("#focus-name").textContent =
    state.profile.name || "Profile not started";
  document.querySelector("#focus-role").textContent =
    [state.profile.headline, state.profile.location]
      .filter(Boolean)
      .join(" · ") ||
    "Your headline and experience will appear here after setup.";
  document.querySelector("#focus-skills").innerHTML =
    state.profile.skills.trim()
      ? state.profile.skills
          .split(",")
          .map((skill) => skill.trim())
          .filter(Boolean)
          .slice(0, 6)
          .map(
            (skill) => `<span class="skill-chip">${escapeHtml(skill)}</span>`,
          )
          .join("")
      : '<span class="empty-inline">No skills added</span>';
  document.querySelector("#resume-file-label").textContent =
    state.resume.name || "Bring in your resume";
  document.querySelector("#resume-file-meta").textContent = state.resume.name
    ? `${state.resume.text.length.toLocaleString()} characters extracted`
    : "Text is extracted locally in your browser.";
  document.querySelector("#job-description").value = state.job;
  document.querySelector("#job-save-state").textContent = state.analysis
    ? `${state.analysis.requirements.length} requirements · local models`
    : "Nothing analyzed yet";
  renderLedger("#ledger-rows", "#ledger-empty");
  renderMatch("#match-results");
}

function renderLedger(rowsSelector, emptySelector) {
  const rows = document.querySelector(rowsSelector);
  const empty = document.querySelector(emptySelector);
  if (!rows || !empty) return;
  const terms = state.analysis?.requirements?.length
    ? state.analysis.requirements
    : evidenceSkills();
  empty.hidden = terms.length > 0;
  rows.innerHTML = terms
    .map((term) => {
      const inProfile = containsTerm(
        `${state.profile.skills} ${state.profile.experience} ${state.profile.headline}`,
        term,
      );
      const inResume = containsTerm(state.resume.text, term);
      const required = state.analysis?.requirements?.includes(term) ?? false;
      const matched = state.analysis?.matched?.includes(term) ?? false;
      const status = required
        ? matched
          ? '<span class="status-tag status-supported">SUPPORTED</span>'
          : '<span class="status-tag status-review">NOT FOUND</span>'
        : '<span class="status-tag">ON FILE</span>';
      return `<div class="ledger-row"><strong>${escapeHtml(term)}</strong><span>${inProfile ? "Recorded" : "—"}</span><span>${inResume ? "Found" : "—"}</span><span>${required ? "Required" : "—"}</span>${status}</div>`;
    })
    .join("");
}

function renderMatch(selector) {
  const container = document.querySelector(selector);
  if (!container) return;
  if (!state.analysis) {
    container.hidden = true;
    container.innerHTML = "";
    return;
  }
  const { requirements, matched, missing } = state.analysis;
  container.hidden = false;
  const evidenceNotes = (state.analysis.evidence || [])
    .map(
      ({ requirement, explanation, passages }) =>
        `<article class="evidence-note"><h4>${escapeHtml(requirement)}</h4><p>${escapeHtml(explanation)}</p>${passages.map((passage) => `<blockquote>${escapeHtml(passage)}</blockquote>`).join("")}</article>`,
    )
    .join("");

  container.innerHTML = `<div class="result-summary"><div><span class="panel-index">EVIDENCE MATCH</span><strong>${requirements.length ? Math.round((matched.length / requirements.length) * 100) : 0}%</strong><small>${matched.length} of ${requirements.length} requirements supported by retrieved evidence</small></div><p>Model-assisted analysis, not a qualification score. Review the source passages before relying on a result.</p></div><div class="result-columns"><div><span class="field-label">SUPPORTED BY YOUR EVIDENCE</span><div class="result-tags">${matched.length ? matched.map((term) => `<span class="result-tag found">${escapeHtml(term)}</span>`).join("") : '<span class="empty-inline">No supported requirements</span>'}</div></div><div><span class="field-label">NOT SUPPORTED BY RETRIEVED EVIDENCE</span><div class="result-tags">${missing.length ? missing.map((term) => `<span class="result-tag absent">${escapeHtml(term)}</span>`).join("") : '<span class="empty-inline">No unsupported requirements</span>'}</div></div></div>${evidenceNotes ? `<section class="evidence-notes"><span class="field-label">RETRIEVED SOURCE PASSAGES</span>${evidenceNotes}</section>` : ""}`;
}

function renderResume() {
  document.querySelector("#resume-detail-name").textContent =
    state.resume.name || "No resume in this workspace";
  document.querySelector("#resume-detail-description").textContent = state
    .resume.name
    ? `${state.resume.text.length.toLocaleString()} characters extracted · stored in this browser`
    : "Import a resume to extract text and identify the skills it supports.";
  document.querySelector("#resume-detail-status").textContent = state.resume
    .name
    ? "Extracted in this browser"
    : "Local processing only";
  document.querySelector("#remove-resume").hidden = !state.resume.name;
  document.querySelector("#document-preview").innerHTML = state.resume.text
    ? `<pre class="extracted-text">${escapeHtml(state.resume.text)}</pre>`
    : '<div class="preview-empty"><span class="preview-page">+</span><p>Extracted resume text will be shown here for review.</p></div>';
}

function renderLearningPlan() {
  const empty = document.querySelector("#learning-empty");
  const results = document.querySelector("#learning-results");
  const learningList = document.querySelector("#learning-list");
  const flashcardView = document.querySelector("#flashcard-view");
  const summary = document.querySelector("#learning-summary");
  const noGaps = document.querySelector("#learning-no-gaps");
  const noPlan = document.querySelector("#learning-no-plan");
  const weeklyHoursInput = document.querySelector("#hours-per-week");

  const btnList = document.querySelector("#btn-mode-list");
  const btnFlash = document.querySelector("#btn-mode-flash");

  if (btnList && btnFlash) {
    btnList.classList.toggle("active", state.viewMode === "list");
    btnFlash.classList.toggle("active", state.viewMode === "flash");
  }

  weeklyHoursInput.value = String(state.hoursPerWeek);
  empty.hidden = Boolean(state.analysis);
  results.hidden = !state.analysis;
  learningList.innerHTML = "";
  flashcardView.innerHTML = "";
  noGaps.hidden = true;
  noPlan.hidden = true;
  summary.textContent = "";

  if (!state.analysis) return;

  const missing = state.analysis.missing || [];
  if (!missing.length) {
    noGaps.hidden = false;
    return;
  }

  const planBySkill = new Map(
    (state.analysis.learningPlan || []).map((plan) => [plan.requirement, plan]),
  );
  const hasCompletePlan = missing.every((skill) => planBySkill.has(skill));
  if (!hasCompletePlan) {
    noPlan.hidden = false;
    return;
  }

  const priorityOrder = { high: 0, medium: 1, low: 2 };
  const plans = [...missing]
    .map((skill) => planBySkill.get(skill))
    .sort(
      (left, right) =>
        (priorityOrder[left.priority] ?? 1) -
        (priorityOrder[right.priority] ?? 1),
    );

  // Overall Progress calculation
  let totalStepsCount = 0;
  let completedStepsCount = 0;

  plans.forEach((plan) => {
    plan.steps.forEach((_, stepIdx) => {
      totalStepsCount += 1;
      const stepKey = `${plan.requirement}-${stepIdx}`;
      if (state.completedSteps[stepKey]) {
        completedStepsCount += 1;
      }
    });
  });

  const overallPercent =
    totalStepsCount > 0
      ? Math.round((completedStepsCount / totalStepsCount) * 100)
      : 0;

  const progressText = document.querySelector("#overall-progress-text");
  const progressFill = document.querySelector("#overall-progress-fill");
  if (progressText && progressFill) {
    progressText.textContent = `${completedStepsCount} of ${totalStepsCount} steps completed (${overallPercent}%)`;
    progressFill.style.width = `${overallPercent}%`;
  }

  const totalHours = plans.reduce(
    (total, plan) => total + plan.estimatedHours,
    0,
  );
  const totalWeeks = Math.ceil(totalHours / state.hoursPerWeek);

  summary.textContent = `${plans.length} skill gaps · about ${totalHours} practice hours · roughly ${totalWeeks} sequential weeks at ${state.hoursPerWeek} hours per week`;

  if (state.viewMode === "list") {
    learningList.hidden = false;
    flashcardView.hidden = true;

    let nextWeek = 1;
    learningList.innerHTML = plans
      .map((plan, index) => {
        const durationWeeks = Math.max(
          1,
          Math.ceil(plan.estimatedHours / state.hoursPerWeek),
        );
        const firstWeek = nextWeek;
        const lastWeek = nextWeek + durationWeeks - 1;
        nextWeek = lastWeek + 1;
        const priority = priorityOrder[plan.priority] ?? 1;
        const priorityLabel = ["high", "medium", "low"][priority];

        let skillDoneCount = 0;
        const stepsHtml = plan.steps
          .map((step, stepIdx) => {
            const stepKey = `${plan.requirement}-${stepIdx}`;
            const isDone = Boolean(state.completedSteps[stepKey]);
            if (isDone) skillDoneCount += 1;
            return `<li class="step-item ${isDone ? "completed" : ""}"><label class="step-label"><input type="checkbox" class="step-checkbox" data-skill="${escapeHtml(plan.requirement)}" data-step="${stepIdx}" ${isDone ? "checked" : ""} /> <span class="step-text">${escapeHtml(step)}</span></label></li>`;
          })
          .join("");

        const skillPercent =
          plan.steps.length > 0
            ? Math.round((skillDoneCount / plan.steps.length) * 100)
            : 0;

        return `<article class="learning-item"><div class="learning-item-head"><div><span class="panel-index">${String(index + 1).padStart(2, "0")} / ${priorityLabel.toUpperCase()} PRIORITY</span><h3>${escapeHtml(plan.requirement)}</h3></div><div class="learning-time"><strong>${plan.estimatedHours}</strong><span>practice hours</span></div></div><div class="learning-skill-progress"><div class="skill-progress-bar"><div class="skill-progress-fill" style="width: ${skillPercent}%"></div></div><span class="skill-progress-note">${skillDoneCount}/${plan.steps.length} steps (${skillPercent}%)</span></div><div class="learning-timeline">WEEKS ${firstWeek}–${lastWeek} AT ${state.hoursPerWeek} HRS/WEEK</div><ul class="learning-steps-list">${stepsHtml}</ul></article>`;
      })
      .join("");
  } else {
    learningList.hidden = true;
    flashcardView.hidden = false;

    if (state.currentFlashIndex >= plans.length) {
      state.currentFlashIndex = 0;
    }

    const currentPlan = plans[state.currentFlashIndex];
    const cardPriorityLabel = (currentPlan.priority || "medium").toUpperCase();

    let flashSkillDoneCount = 0;
    const flashStepsHtml = currentPlan.steps
      .map((step, stepIdx) => {
        const stepKey = `${currentPlan.requirement}-${stepIdx}`;
        const isDone = Boolean(state.completedSteps[stepKey]);
        if (isDone) flashSkillDoneCount += 1;
        return `<li class="step-item ${isDone ? "completed" : ""}"><label class="step-label"><input type="checkbox" class="step-checkbox" data-skill="${escapeHtml(currentPlan.requirement)}" data-step="${stepIdx}" ${isDone ? "checked" : ""} /> <span class="step-text">${escapeHtml(step)}</span></label></li>`;
      })
      .join("");

    flashcardView.innerHTML = `
      <div class="flashcard-container">
        <div class="flashcard-header">
          <span class="flashcard-counter">CARD ${state.currentFlashIndex + 1} OF ${plans.length}</span>
          <span class="status-tag status-review">${cardPriorityLabel} PRIORITY</span>
        </div>
        <div class="flashcard-card" id="active-flashcard">
          <div class="flashcard-skill-title">${escapeHtml(currentPlan.requirement)}</div>
          <div class="flashcard-hours-tag">⏱ Estimated Practice: ${currentPlan.estimatedHours} hours</div>
          <div class="flashcard-divider"></div>
          <div class="flashcard-section-title">Action Steps & Review Checkpoints:</div>
          <ul class="learning-steps-list flashcard-steps">${flashStepsHtml}</ul>
        </div>
        <div class="flashcard-nav">
          <button class="button button-outline" id="btn-flash-prev" ${state.currentFlashIndex === 0 ? "disabled" : ""}>← Previous Card</button>
          <span class="flash-progress-note">${flashSkillDoneCount}/${currentPlan.steps.length} steps completed</span>
          <button class="button button-dark" id="btn-flash-next" ${state.currentFlashIndex === plans.length - 1 ? "disabled" : ""}>Next Card →</button>
        </div>
      </div>
    `;
  }
}

function render() {
  renderMetrics();
  renderOverview();
  renderResume();
  renderLearningPlan();
  renderMatch("#match-results-secondary");
  renderLedger("#ledger-rows-secondary", "#ledger-empty-secondary");
  document.querySelector("#job-description-secondary").value = state.job;
  document.querySelector("#job-save-state-secondary").textContent =
    state.analysis
      ? `${state.analysis.requirements.length} requirements · local models`
      : "No role description saved";
}

const viewTitles = {
  overview: "Overview",
  profile: "Profile",
  resume: "Resume evidence",
  match: "Job analysis",
  learning: "Learning plan",
};

function showView(view) {
  if (!viewTitles[view]) return;
  document
    .querySelectorAll(".view-panel")
    .forEach((panel) =>
      panel.classList.toggle("active", panel.id === `view-${view}`),
    );
  document
    .querySelectorAll("[data-view]")
    .forEach((button) =>
      button.classList.toggle(
        "active",
        button.dataset.view === view && button.classList.contains("nav-item"),
      ),
    );
  document.querySelector("#page-title").textContent = viewTitles[view];
  window.location.hash = view;
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("visible"), 2800);
}

async function extractText(file) {
  const extension = file.name.split(".").pop().toLowerCase();
  if (file.size > 15 * 1024 * 1024)
    throw new Error("Choose a file smaller than 15 MB.");
  if (extension === "txt") return file.text();
  const buffer = await file.arrayBuffer();
  if (extension === "docx") {
    const mammoth = await import("mammoth/mammoth.browser.js");
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    return result.value;
  }
  if (extension === "pdf") {
    const [{ getDocument, GlobalWorkerOptions }, { default: pdfWorkerUrl }] =
      await Promise.all([
        import("pdfjs-dist"),
        import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
      ]);
    GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    const pdf = await getDocument({ data: new Uint8Array(buffer) }).promise;
    const pages = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(
        content.items.map((item) => ("str" in item ? item.str : "")).join(" "),
      );
    }
    return pages.join("\n\n");
  }
  throw new Error("Choose a PDF, DOCX, or TXT file.");
}

async function handleResumeFile(file) {
  if (!file) return;
  try {
    document.querySelector("#resume-file-meta").textContent =
      "Reading file locally...";
    const text = (await extractText(file)).trim();
    if (!text) throw new Error("No readable text was found in this document.");
    state.resume = { name: file.name, text };
    saveState();
    showToast("Resume text extracted and saved on this device.");
  } catch (error) {
    document.querySelector("#resume-file-meta").textContent =
      "Text is extracted locally in your browser.";
    showToast(error.message || "Could not read this file.");
  }
}

function openPolicy(type) {
  const policy = policyText[type];
  document.querySelector("#policy-kicker").textContent = policy.kicker;
  document.querySelector("#policy-content").innerHTML =
    `<h2>${escapeHtml(policy.title)}</h2>${policy.paragraphs.map(([heading, text]) => `<section><h3>${escapeHtml(heading)}</h3><p>${escapeHtml(text)}</p></section>`).join("")}`;
  document.querySelector("#policy-dialog").showModal();
}

document
  .querySelectorAll("[data-view]")
  .forEach((button) =>
    button.addEventListener("click", () => showView(button.dataset.view)),
  );
document.querySelector("#profile-form").addEventListener("submit", (event) => {
  event.preventDefault();
  for (const key of Object.keys(state.profile))
    state.profile[key] = document.querySelector(`#profile-${key}`).value.trim();
  saveState();
  document.querySelector("#profile-save-message").textContent =
    "Profile saved on this device.";
  showToast("Profile saved locally.");
});

for (const input of ["#resume-file", "#resume-file-secondary"]) {
  document
    .querySelector(input)
    .addEventListener("change", (event) =>
      handleResumeFile(event.target.files?.[0]),
    );
}
document
  .querySelector("#upload-trigger")
  .addEventListener("click", () =>
    document.querySelector("#resume-file").click(),
  );
document
  .querySelector("#resume-detail-upload")
  .addEventListener("click", () =>
    document.querySelector("#resume-file-secondary").click(),
  );
document.querySelector("#remove-resume").addEventListener("click", () => {
  state.resume = { name: "", text: "" };
  saveState();
  showToast("Resume text removed from this browser.");
});
document
  .querySelector("#analyze-job")
  .addEventListener("click", () =>
    analyzeDescription(document.querySelector("#job-description").value.trim()),
  );
document
  .querySelector("#analyze-job-secondary")
  .addEventListener("click", () =>
    analyzeDescription(
      document.querySelector("#job-description-secondary").value.trim(),
    ),
  );
document
  .querySelectorAll("[data-policy]")
  .forEach((button) =>
    button.addEventListener("click", () => openPolicy(button.dataset.policy)),
  );
document
  .querySelector("#policy-close")
  .addEventListener("click", () =>
    document.querySelector("#policy-dialog").close(),
  );
document.querySelector("#policy-dialog").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});
document
  .querySelector("#hours-per-week")
  .addEventListener("change", (event) => {
    const hoursPerWeek = Number(event.currentTarget.value);
    if (
      !Number.isInteger(hoursPerWeek) ||
      hoursPerWeek < 1 ||
      hoursPerWeek > 40
    ) {
      showToast("Choose between 1 and 40 study hours per week.");
      event.currentTarget.value = String(state.hoursPerWeek);
      return;
    }

    state.hoursPerWeek = hoursPerWeek;
    saveState();
  });
document
  .querySelector("#global-search")
  .addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      const query = event.currentTarget.value.trim().toLowerCase();
      const searchable =
        `${profileText()} ${state.resume.text} ${state.job}`.toLowerCase();
      if (!query) return;
      if (searchable.includes(query))
        showToast(`“${query}” appears in your saved workspace.`);
      else showToast(`No exact match for “${query}” in your saved workspace.`);
    }
  });
document.addEventListener("click", (event) => {
  const toggleBtn = event.target.closest(".toggle-btn");
  if (toggleBtn && toggleBtn.dataset.mode) {
    state.viewMode = toggleBtn.dataset.mode;
    saveState();
    return;
  }

  if (event.target.id === "btn-flash-prev") {
    if (state.currentFlashIndex > 0) {
      state.currentFlashIndex -= 1;
      saveState();
    }
    return;
  }

  if (event.target.id === "btn-flash-next") {
    const missingCount = state.analysis?.missing?.length || 0;
    if (state.currentFlashIndex < missingCount - 1) {
      state.currentFlashIndex += 1;
      saveState();
    }
    return;
  }
});

document.addEventListener("change", (event) => {
  if (event.target.classList.contains("step-checkbox")) {
    const { skill, step } = event.target.dataset;
    const key = `${skill}-${step}`;
    state.completedSteps[key] = event.target.checked;
    saveState();
    if (event.target.checked) {
      showToast(`Completed step for ${skill}!`);
    }
  }
});

document.addEventListener("keydown", (event) => {
  if (
    event.key === "/" &&
    !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)
  ) {
    event.preventDefault();
    document.querySelector("#global-search").focus();
  }
  if (
    state.viewMode === "flash" &&
    !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)
  ) {
    if (event.key === "ArrowLeft" && state.currentFlashIndex > 0) {
      state.currentFlashIndex -= 1;
      saveState();
    } else if (
      event.key === "ArrowRight" &&
      state.currentFlashIndex < (state.analysis?.missing?.length || 0) - 1
    ) {
      state.currentFlashIndex += 1;
      saveState();
    }
  }
});

async function updateModelStatus() {
  const status = document.querySelector("#model-status");

  try {
    const response = await fetch("/api/health");
    const result = await response.json();
    const modelsReady =
      result.models?.llmReady && result.models?.embeddingsReady;
    status.textContent = modelsReady
      ? "LOCAL MODELS READY"
      : "MODELS NOT READY";
    status.title = modelsReady
      ? "Qwen3 and Nomic Embed are available locally."
      : "Run npm run models:download and keep Ollama running.";
  } catch {
    status.textContent = "API OFFLINE";
    status.title = "Start the Node API and Ollama to analyze job descriptions.";
  }
}

const profileFields = [
  "name",
  "headline",
  "location",
  "email",
  "skills",
  "experience",
];
for (const key of profileFields)
  document.querySelector(`#profile-${key}`).value = state.profile[key];
const initialView = window.location.hash.slice(1);
showView(viewTitles[initialView] ? initialView : "overview");
render();
updateModelStatus();
window.setInterval(updateModelStatus, 30_000);
