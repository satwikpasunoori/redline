// Redline — front end logic
// No frameworks, just the DOM. Talks to /api/analyze.

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("resumeFile");
const dropzoneText = document.getElementById("dropzoneText");
const jobDescription = document.getElementById("jobDescription");
const analyzeBtn = document.getElementById("analyzeBtn");
const analyzeBtnLabel = document.getElementById("analyzeBtnLabel");
const formError = document.getElementById("formError");

const emptyState = document.getElementById("emptyState");
const loadingState = document.getElementById("loadingState");
const resultsState = document.getElementById("resultsState");
const errorState = document.getElementById("errorState");
const errorText = document.getElementById("errorText");

let selectedFile = null;

// ---------- File selection ----------

dropzone.addEventListener("click", () => fileInput.click());

dropzone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fileInput.click();
  }
});

["dragenter", "dragover"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add("is-dragover");
  })
);

["dragleave", "drop"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove("is-dragover");
  })
);

dropzone.addEventListener("drop", (e) => {
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) handleFile(file);
});

function handleFile(file) {
  if (file.type !== "application/pdf") {
    showFormError("That doesn't look like a PDF. Export your résumé as a PDF and try again.");
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    showFormError("That file's a bit large — try a version under 8MB.");
    return;
  }
  selectedFile = file;
  formError.hidden = true;
  dropzone.classList.add("has-file");
  dropzoneText.textContent = file.name;
  analyzeBtn.disabled = false;
}

function showFormError(message) {
  formError.textContent = message;
  formError.hidden = false;
}

// ---------- Submit ----------

analyzeBtn.addEventListener("click", async () => {
  if (!selectedFile) return;

  setLoading(true);

  try {
    const base64 = await fileToBase64(selectedFile);
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resume_base64: base64,
        mime_type: selectedFile.type,
        job_description: jobDescription.value.trim(),
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Something went wrong on the server.");
    }

    renderResults(data);
  } catch (err) {
    showError(err.message || "Couldn't reach the server. Try again in a moment.");
  } finally {
    setLoading(false);
  }
});

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // result looks like "data:application/pdf;base64,XXXX" — strip the prefix
      const base64 = reader.result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------- UI state ----------

function setLoading(isLoading) {
  if (isLoading) {
    emptyState.hidden = true;
    errorState.hidden = true;
    resultsState.hidden = true;
    loadingState.hidden = false;
    analyzeBtn.disabled = true;
    analyzeBtnLabel.textContent = "Marking up…";
  } else {
    loadingState.hidden = true;
    analyzeBtn.disabled = false;
    analyzeBtnLabel.textContent = "Mark it up";
  }
}

function showError(message) {
  emptyState.hidden = true;
  resultsState.hidden = true;
  errorState.hidden = false;
  errorText.textContent = message;
}

function renderResults(data) {
  errorState.hidden = true;
  emptyState.hidden = true;
  resultsState.hidden = false;

  document.getElementById("scoreValue").textContent = data.overall_score ?? "--";
  document.getElementById("summaryText").textContent = data.summary || "";

  // Keyword match (only if a job description was given)
  const keywordBlock = document.getElementById("keywordBlock");
  if (data.keyword_match) {
    keywordBlock.hidden = false;
    document.getElementById("matchPercent").textContent = data.keyword_match.match_percentage ?? "--";
    fillList("matchedKeywords", data.keyword_match.matched);
    fillList("missingKeywords", data.keyword_match.missing);
  } else {
    keywordBlock.hidden = true;
  }

  fillList("sectionsFound", data.sections_found);
  fillList("sectionsMissing", data.sections_missing);

  const formattingBlock = document.getElementById("formattingBlock");
  if (data.formatting_flags && data.formatting_flags.length) {
    formattingBlock.hidden = false;
    fillList("formattingFlags", data.formatting_flags);
  } else {
    formattingBlock.hidden = true;
  }

  const bulletBlock = document.getElementById("bulletBlock");
  const bulletContainer = document.getElementById("bulletFeedback");
  bulletContainer.innerHTML = "";
  if (data.bullet_feedback && data.bullet_feedback.length) {
    bulletBlock.hidden = false;
    data.bullet_feedback.forEach((item) => {
      const row = document.createElement("div");
      row.className = "bullet-item";
      row.innerHTML = `
        <div class="bullet-original">${escapeHtml(item.original)}</div>
        <div class="bullet-suggestion">
          ${escapeHtml(item.suggestion)}
          <span class="bullet-reason">${escapeHtml(item.reason || "")}</span>
        </div>
      `;
      bulletContainer.appendChild(row);
    });
  } else {
    bulletBlock.hidden = true;
  }

  fillList("topSuggestions", data.top_suggestions, "ol");
}

function fillList(id, items, tag = "ul") {
  const el = document.getElementById(id);
  el.innerHTML = "";
  (items || []).forEach((text) => {
    const li = document.createElement("li");
    li.textContent = text;
    el.appendChild(li);
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
