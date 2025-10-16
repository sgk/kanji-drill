/* 漢字データ: 学年ごとの問題と読みを定義 */
const GRADES = ["1", "2", "3", "4", "5", "6"];

const GRADE_STATUS = GRADES.reduce((acc, grade) => {
  acc[grade] = "pending";
  return acc;
}, {});

const KANJI_DATA = GRADES.reduce((acc, grade) => {
  acc[grade] = null;
  return acc;
}, {});

const STORAGE_KEY = "kanji-drill-memorized";
const DEFAULT_PLACEHOLDER = "まだ出題されていません。";
const GRADE_CSV_FILES = {
  "1": "kanji_grade1.csv",
  "2": "kanji_grade2.csv",
  "3": "kanji_grade3.csv",
  "4": "kanji_grade4.csv",
  "5": "kanji_grade5.csv",
  "6": "kanji_grade6.csv"
};

const gradeSelect = document.getElementById("grade-select");
const generateButton = document.getElementById("generate-button");
const toggleAllButton = document.getElementById("toggle-all-button");
const resetButton = document.getElementById("reset-button");
const questionList = document.getElementById("question-list");
const questionArea = document.getElementById("question-area");
const questionPlaceholder = questionArea.querySelector(".placeholder");
const allArea = document.getElementById("all-area");
const allList = document.getElementById("all-list");
const itemTemplate = document.getElementById("kanji-item-template");
const questionCount = document.getElementById("question-count");

const memorizedSet = new Set(loadMemorized());
let activeAnswerButton = null;
let activeAllListGrade = null;

init();

function init() {
  populateGrades();
  renderAllList();
  updateQuestionPlaceholder(true);

  generateButton.addEventListener("click", handleGenerateClick);
  toggleAllButton.addEventListener("click", toggleAllVisibility);
  resetButton.addEventListener("click", handleResetClick);
  gradeSelect.addEventListener("change", handleGradeChange);

  void loadAllGradesFromCsv();
  document.addEventListener("click", handleDocumentClick);
  document.addEventListener("keydown", handleKeydown);
  setQuestionCount(0);
  updateControlStates();
}

function populateGrades() {
  const currentValue = gradeSelect.value;
  while (gradeSelect.options.length > 1) {
    gradeSelect.remove(1);
  }

  const entries = Object.keys(GRADE_STATUS).sort();
  entries.forEach((grade) => {
    const option = document.createElement("option");
    option.value = grade;

    const status = GRADE_STATUS[grade];
    let label = `${grade}年生`;
    if (status === "pending") {
      label += "（読込中）";
    } else if (status === "error") {
      label += "（読込失敗）";
    }
    option.textContent = label;

    const items = KANJI_DATA[grade];
    const hasQuestions = Array.isArray(items) && items.length > 0;
    option.disabled = status !== "ready" || !hasQuestions;

    gradeSelect.append(option);
  });

  const optionToRestore = gradeSelect.querySelector(`option[value="${currentValue}"]`);
  if (optionToRestore && !optionToRestore.disabled) {
    gradeSelect.value = currentValue;
  } else {
    gradeSelect.value = "";
  }

  updateControlStates();
}

function handleGenerateClick() {
  const selectedGrade = gradeSelect.value;
  if (!selectedGrade) {
    alert("学年を選んでください。");
    gradeSelect.focus();
    return;
  }

  if (GRADE_STATUS[selectedGrade] !== "ready") {
    alert("選択した学年のデータを読み込み中です。少し待ってからもう一度試してください。");
    return;
  }

  const allProblems = KANJI_DATA[selectedGrade];
  if (!Array.isArray(allProblems) || allProblems.length === 0) {
    alert("この学年の問題がまだ用意されていません。");
    return;
  }

  const unmemorized = allProblems.filter(
    (item) => !memorizedSet.has(makeId(selectedGrade, item))
  );

  const problems = shuffleArray(unmemorized);
  renderList(questionList, problems, selectedGrade);
  updateQuestionPlaceholder(problems.length === 0);

  if (!allArea.classList.contains("hidden")) {
    allArea.classList.add("hidden");
    toggleAllButton.textContent = "すべての漢字を表示する";
    activeAllListGrade = null;
  }
  questionArea.classList.remove("hidden");

  if (problems.length === 0) {
    questionPlaceholder.textContent = "選んだ学年の問題はすべて覚えました！";
  } else {
    questionPlaceholder.textContent = DEFAULT_PLACEHOLDER;
  }
  updateControlStates();
}

function toggleAllVisibility() {
  const willShowAll = allArea.classList.contains("hidden");
  const selectedGrade = gradeSelect.value;

  if (willShowAll) {
    if (!selectedGrade) {
      alert("学年を選んでください。");
      gradeSelect.focus();
      return;
    }
    if (GRADE_STATUS[selectedGrade] !== "ready") {
      alert("選択した学年のデータを読み込み中です。少し待ってからもう一度試してください。");
      return;
    }
    allArea.classList.remove("hidden");
    toggleAllButton.textContent = "すべての漢字を隠す";
    questionArea.classList.add("hidden");
    renderAllListForGrade(selectedGrade);
    activeAllListGrade = selectedGrade;
    if (activeAnswerButton) {
      hideAnswerButton(activeAnswerButton);
    }
  } else {
    allArea.classList.add("hidden");
    toggleAllButton.textContent = "すべての漢字を表示する";
    questionArea.classList.remove("hidden");
    updateQuestionPlaceholder(questionList.children.length === 0);
    activeAllListGrade = null;
  }
  updateControlStates();
}

function renderAllList() {
  const grade = activeAllListGrade ?? gradeSelect.value;
  if (grade && GRADE_STATUS[grade] === "ready") {
    renderAllListForGrade(grade);
  } else {
    allList.innerHTML = "";
  }
}

function renderAllListForGrade(grade) {
  const items = KANJI_DATA[grade];
  if (!Array.isArray(items)) {
    allList.innerHTML = "";
    return;
  }
  const decorated = items.map((item) => ({ grade, ...item }));
  renderList(allList, decorated);
}

function renderList(targetList, items, gradeOverride) {
  if (activeAnswerButton) {
    hideAnswerButton(activeAnswerButton);
  }
  targetList.innerHTML = "";
  items.forEach((item) => {
    const node = createKanjiListItem(gradeOverride ?? item.grade, item);
    targetList.append(node);
  });
  if (targetList === questionList) {
    setQuestionCount(items.length);
  }
}

function createKanjiListItem(grade, item) {
  const node = itemTemplate.content.firstElementChild.cloneNode(true);
  const readingSpan = node.querySelector(".reading");
  const hintSpan = node.querySelector(".hint");
  const showAnswerButton = node.querySelector(".show-answer-button");
  const checkbox = node.querySelector("input[type='checkbox']");

  if (item.promptHtml) {
    readingSpan.innerHTML = item.promptHtml;
  } else if (item.promptText) {
    readingSpan.textContent = item.promptText;
  } else if (item.kanji && item.reading) {
    readingSpan.textContent = `${item.kanji}（${item.reading}）`;
  } else if (item.kanji) {
    readingSpan.textContent = item.kanji;
  } else {
    readingSpan.textContent = "";
  }

  if (showAnswerButton) {
    showAnswerButton.dataset.originalText = showAnswerButton.textContent;
    showAnswerButton.dataset.revealed = "false";
    if (item.answer) {
      showAnswerButton.dataset.answer = item.answer;
      showAnswerButton.disabled = false;
    } else {
      showAnswerButton.dataset.answer = "";
      showAnswerButton.disabled = true;
    }
  }

  if (hintSpan) {
    if (item.hint) {
      hintSpan.textContent = item.hint;
      hintSpan.classList.remove("hidden");
    } else {
      hintSpan.textContent = "";
      hintSpan.classList.add("hidden");
    }
  }

  if (showAnswerButton) {
    showAnswerButton.addEventListener("click", (event) => {
      event.stopPropagation();
      if (showAnswerButton.disabled) return;
      if (showAnswerButton.dataset.revealed === "true") {
        hideAnswerButton(showAnswerButton);
      } else {
        showAnswerForButton(showAnswerButton);
      }
    });
  }

  const id = makeId(grade, item);
  checkbox.dataset.kanjiId = id;
  checkbox.checked = memorizedSet.has(id);
  checkbox.addEventListener("change", () => {
    updateMemorized(id, checkbox.checked);
  });

  return node;
}

function handleResetClick() {
  const shouldReset = window.confirm("覚えた状態をすべてリセットしますか？");
  if (!shouldReset) {
    return;
  }

  memorizedSet.clear();
  saveMemorized([]);

  if (activeAnswerButton) {
    hideAnswerButton(activeAnswerButton);
  }

  const checkboxes = document.querySelectorAll("input[data-kanji-id]");
  checkboxes.forEach((checkbox) => {
    checkbox.checked = false;
  });

  questionPlaceholder.textContent = DEFAULT_PLACEHOLDER;
  updateQuestionPlaceholder(questionList.children.length === 0);
  setQuestionCount(questionList.children.length);
  updateControlStates();
}

function updateMemorized(id, checked) {
  if (checked) {
    memorizedSet.add(id);
  } else {
    memorizedSet.delete(id);
  }
  saveMemorized(Array.from(memorizedSet));
  syncCheckboxes(id, checked);
}

function syncCheckboxes(id, checked) {
  const checkboxes = document.querySelectorAll(
    `input[data-kanji-id="${CSS.escape(id)}"]`
  );
  checkboxes.forEach((checkbox) => {
    if (checkbox.checked !== checked) {
      checkbox.checked = checked;
    }
  });
}

function updateQuestionPlaceholder(isEmpty) {
  questionPlaceholder.classList.toggle("hidden", !isEmpty);
  questionList.classList.toggle("hidden", isEmpty);
}

function loadMemorized() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("Failed to load memorized kanji:", error);
    return [];
  }
}

function saveMemorized(values) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  } catch (error) {
    console.warn("Failed to save memorized kanji:", error);
  }
}

function makeId(grade, item) {
  const baseKey =
    item.storageKey ??
    encodeStorageKey(`${item.kanji ?? ""}|${item.reading ?? ""}`);
  return `${grade}-${baseKey}`;
}

async function loadAllGradesFromCsv() {
  await Promise.all(GRADES.map((grade) => loadGradeFromCsv(grade)));
  updateControlStates();
}

async function loadGradeFromCsv(grade) {
  const csvPath = GRADE_CSV_FILES[grade];
  if (!csvPath) {
    console.error(`CSV path is not defined for grade ${grade}`);
    GRADE_STATUS[grade] = "error";
    populateGrades();
    return;
  }

  try {
    const response = await fetch(csvPath, { cache: "no-cache" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const csvText = await response.text();
    const items = parseGradeCsv(csvText);

    KANJI_DATA[grade] = items;
    GRADE_STATUS[grade] = "ready";
  } catch (error) {
    console.error(`Failed to load grade ${grade} data:`, error);
    KANJI_DATA[grade] = [];
    GRADE_STATUS[grade] = "error";
  } finally {
    populateGrades();
    renderAllList();
    updateControlStates();
  }
}

function parseGradeCsv(csvText) {
  const lines = csvText.split(/\r?\n/);
  if (lines.length <= 1) return [];

  const items = [];
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line || !line.trim()) continue;

    const cells = splitCsvLine(line);
    if (cells.length < 2) continue;

    const problem = cells[0].trim();
    const answer = cells[1].trim();
    if (!problem || !answer) continue;

    items.push({
      promptHtml: convertProblemToHtml(problem),
      answer,
      storageKey: encodeStorageKey(`${problem}|${answer}`)
    });
  }

  return items;
}

function splitCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  result.push(current);
  return result;
}

function convertProblemToHtml(problem) {
  let html = "";
  let remaining = problem;

  while (remaining.length > 0) {
    const ltIndex = remaining.indexOf("<");
    if (ltIndex === -1) {
      html += renderTextWithSquares(remaining);
      break;
    }

    const before = remaining.slice(0, ltIndex);
    const gtIndex = remaining.indexOf(">", ltIndex + 1);
    if (gtIndex === -1) {
      html += renderTextWithSquares(remaining);
      break;
    }

    const reading = remaining.slice(ltIndex + 1, gtIndex);
    const firstSquareIndex = before.indexOf("□");
    let plainPart = "";
    let basePart = before;

    if (firstSquareIndex !== -1) {
      plainPart = before.slice(0, firstSquareIndex);
      basePart = before.slice(firstSquareIndex);
    }

    html += renderTextWithSquares(plainPart);
    if (basePart) {
      html += `<ruby>${renderTextWithSquares(basePart)}<rt>${escapeHtml(reading)}</rt></ruby>`;
    } else {
      html += `（${escapeHtml(reading)}）`;
    }

    remaining = remaining.slice(gtIndex + 1);
  }

  return html;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}

function encodeStorageKey(value) {
  return encodeURIComponent(value);
}

function shuffleArray(array) {
  const copy = array.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function showAnswerForButton(button) {
  if (!button) return;
  const answer = button.dataset.answer;
  if (!answer) return;

  if (activeAnswerButton && activeAnswerButton !== button) {
    hideAnswerButton(activeAnswerButton);
  }

  button.textContent = answer;
  button.dataset.revealed = "true";
  activeAnswerButton = button;
}

function hideAnswerButton(button) {
  if (!button) return;
  const originalText = button.dataset.originalText || "こたえ";
  button.textContent = originalText;
  button.dataset.revealed = "false";
  if (activeAnswerButton === button) {
    activeAnswerButton = null;
  }
}

function handleDocumentClick() {
  if (activeAnswerButton) {
    hideAnswerButton(activeAnswerButton);
  }
}

function handleKeydown(event) {
  if (event.key === "Escape" && activeAnswerButton) {
    hideAnswerButton(activeAnswerButton);
  }
}

function handleGradeChange() {
  const selectedGrade = gradeSelect.value;

  if (activeAnswerButton) {
    hideAnswerButton(activeAnswerButton);
  }

  questionList.innerHTML = "";
  setQuestionCount(0);
  questionPlaceholder.textContent = DEFAULT_PLACEHOLDER;
  updateQuestionPlaceholder(true);

  const gradeReady = selectedGrade && GRADE_STATUS[selectedGrade] === "ready";

  if (!gradeReady) {
    allList.innerHTML = "";
    if (!allArea.classList.contains("hidden")) {
      allArea.classList.add("hidden");
      toggleAllButton.textContent = "すべての漢字を表示する";
      questionArea.classList.remove("hidden");
    }
    activeAllListGrade = null;
  } else if (!allArea.classList.contains("hidden")) {
    renderAllListForGrade(selectedGrade);
    activeAllListGrade = selectedGrade;
  }

  updateControlStates();
}

function updateControlStates() {
  const selectedGrade = gradeSelect.value;
  const gradeReady = !!selectedGrade && GRADE_STATUS[selectedGrade] === "ready";

  generateButton.disabled = !gradeReady;
  toggleAllButton.disabled = !gradeReady;
  if (resetButton) {
    resetButton.disabled = !gradeReady || allArea.classList.contains("hidden");
  }
}

function setQuestionCount(value) {
  if (questionCount) {
    questionCount.textContent = String(value);
  }
}

function renderTextWithSquares(text) {
  if (!text) return "";
  if (!text.includes("□")) {
    return escapeHtml(text);
  }

  const parts = text.split("□");
  let result = "";
  parts.forEach((part, index) => {
    result += escapeHtml(part);
    if (index < parts.length - 1) {
      result += '<span class="placeholder-square" aria-hidden="true"></span>';
    }
  });
  return result;
}
