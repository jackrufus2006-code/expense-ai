const categories = ["food", "travel", "shopping", "entertainment", "utilities", "others"];
const chartColors = {
  food: "#22c55e",
  travel: "#38bdf8",
  shopping: "#f97316",
  entertainment: "#e879f9",
  utilities: "#facc15",
  others: "#94a3b8"
};

let state = {
  expenses: [],
  budgets: {},
  goal: {},
  profile: {},
  reminders: []
};
let latestAnalysis = null;
let editingExpenseId = null;
let activeApiBaseUrl = "";

function getDefaultApiBaseUrl() {
  const userAgent = navigator.userAgent || "";
  const host = window.location.hostname;

  if (userAgent.includes("Android")) {
    return "http://10.0.2.2:3000";
  }

  if (host === "localhost" || host === "127.0.0.1") {
    return "http://localhost:3000";
  }

  return "http://10.0.2.2:3000";
}

function getApiBaseUrl() {
  return localStorage.getItem("expense-ai-api-base-url") || getDefaultApiBaseUrl();
}

function getCandidateApiBaseUrls() {
  const saved = localStorage.getItem("expense-ai-api-base-url");
  const defaults = [saved, getDefaultApiBaseUrl(), "http://10.0.2.2:3000", "http://localhost:3000"];
  return [...new Set(defaults.filter(Boolean))];
}

function setApiBaseUrl(value) {
  const cleaned = value.replace(/\/$/, "");
  activeApiBaseUrl = cleaned;
  localStorage.setItem("expense-ai-api-base-url", cleaned);
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function formatCurrency(value) {
  return `Rs ${Number(value || 0).toFixed(2)}`;
}

function formatCategory(category) {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

function api(path, options = {}) {
  return fetch(`${activeApiBaseUrl || getApiBaseUrl()}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });
}

function autoCategorize(description) {
  const desc = description.toLowerCase();

  if (["food", "lunch", "dinner", "restaurant", "snack", "breakfast"].some((term) => desc.includes(term))) {
    return "food";
  }
  if (["travel", "bus", "train", "flight", "petrol", "uber", "auto"].some((term) => desc.includes(term))) {
    return "travel";
  }
  if (["shop", "clothes", "grocery", "mall", "amazon"].some((term) => desc.includes(term))) {
    return "shopping";
  }
  if (["movie", "game", "party", "netflix"].some((term) => desc.includes(term))) {
    return "entertainment";
  }
  if (["electricity", "water", "gas", "internet", "recharge"].some((term) => desc.includes(term))) {
    return "utilities";
  }

  return "others";
}

function getCategoryTotals() {
  return state.expenses.reduce((totals, expense) => {
    const category = categories.includes(expense.category) ? expense.category : "others";
    totals[category] += Number(expense.amount);
    return totals;
  }, {
    food: 0,
    travel: 0,
    shopping: 0,
    entertainment: 0,
    utilities: 0,
    others: 0
  });
}

function setProfileMode() {
  document.body.classList.toggle("is-beginner", state.profile?.mode === "beginner");
}

function getPeriods() {
  const now = new Date();
  const today = todayString();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 6);
  const monthKey = today.slice(0, 7);

  return state.expenses.reduce((acc, expense) => {
    const amount = Number(expense.amount);
    const expenseDate = new Date(expense.date);

    if (expense.date === today) {
      acc.today += amount;
    }
    if (expense.date.startsWith(monthKey)) {
      acc.month += amount;
    }
    if (expenseDate >= sevenDaysAgo && expenseDate <= now) {
      acc.week += amount;
    }

    return acc;
  }, { today: 0, week: 0, month: 0 });
}

function resetExpenseForm() {
  editingExpenseId = null;
  document.getElementById("expense-form-title").textContent = "Add Expense";
  document.getElementById("form-status").textContent = "Capture each expense with mood and date.";
  document.getElementById("save-expense-button").textContent = "Save Expense";
  document.getElementById("cancel-edit-button").style.display = "none";
  document.getElementById("amount").value = "";
  document.getElementById("description").value = "";
  document.getElementById("category").value = "";
  document.getElementById("mood").value = "planned";
  document.getElementById("expense-date").value = todayString();
  document.getElementById("notes").value = "";
}

function renderBudgets() {
  const container = document.getElementById("budget-grid");
  container.innerHTML = "";

  categories.forEach((category) => {
    const item = document.createElement("div");
    item.className = "budget-item";
    item.innerHTML = `
      <strong>${formatCategory(category)}</strong>
      <input data-budget-category="${category}" type="number" min="0" step="0.01" value="${Number(state.budgets?.[category] || 0)}">
    `;
    container.appendChild(item);
  });
}

function renderGoal() {
  const goal = state.goal || {};
  const saved = Number(goal.saved || 0);
  const target = Number(goal.target || 0);
  const progress = target > 0 ? Math.min(100, (saved / target) * 100) : 0;

  document.getElementById("goal-name").value = goal.name || "";
  document.getElementById("goal-target").value = target || "";
  document.getElementById("goal-saved").value = saved || "";
  document.getElementById("goal-progress-fill").style.width = `${progress}%`;
  document.getElementById("goal-progress-text").textContent =
    target > 0
      ? `${formatCurrency(saved)} saved out of ${formatCurrency(target)} (${progress.toFixed(1)}%)`
      : "Set a goal target to see progress.";
}

function renderReminders() {
  const list = document.getElementById("reminder-list");
  list.innerHTML = "";

  if (!state.reminders.length) {
    list.innerHTML = "<div class='stack-item empty-state'>No reminders added yet.</div>";
    return;
  }

  [...state.reminders]
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
    .forEach((reminder) => {
      const item = document.createElement("div");
      item.className = "stack-item";
      item.innerHTML = `
        <strong>${reminder.title}</strong>
        <p>${formatCurrency(reminder.amount)} | ${formatCategory(reminder.category)} | due ${reminder.dueDate}</p>
        <div class="mini-actions">
          <button type="button" class="danger-button" onclick="deleteReminder(${reminder.id})">Delete</button>
        </div>
      `;
      list.appendChild(item);
    });
}

function renderExpenses() {
  const list = document.getElementById("list");
  const count = document.getElementById("expense-count");
  list.innerHTML = "";

  if (!state.expenses.length) {
    count.textContent = "No expenses added yet.";
    list.innerHTML = "<div class='stack-item empty-state'>Add your first expense to start tracking.</div>";
    return;
  }

  count.textContent = `${state.expenses.length} expense${state.expenses.length > 1 ? "s" : ""} saved`;

  [...state.expenses]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .forEach((expense) => {
      const item = document.createElement("article");
      item.className = "expense-item";
      item.innerHTML = `
        <div class="expense-main">
          <p class="expense-title">${expense.description}</p>
          <p class="expense-meta">${expense.date}${expense.notes ? ` | ${expense.notes}` : ""}</p>
          <div class="pill-row">
            <span class="pill">${formatCategory(expense.category)}</span>
            <span class="pill">Mood: ${formatCategory(expense.mood)}</span>
          </div>
        </div>
        <div class="expense-side">
          <div class="expense-amount">${formatCurrency(expense.amount)}</div>
          <div class="mini-actions">
            <button type="button" class="secondary-button" onclick="editExpense(${expense.id})">Edit</button>
            <button type="button" class="danger-button" onclick="deleteExpense(${expense.id})">Delete</button>
          </div>
        </div>
      `;
      list.appendChild(item);
    });
}

function renderChart(categoryTotals) {
  const canvas = document.getElementById("expense-chart");
  const legend = document.getElementById("chart-legend");
  const ctx = canvas.getContext("2d");
  const entries = Object.entries(categoryTotals).filter(([, amount]) => amount > 0);
  const total = entries.reduce((sum, [, amount]) => sum + amount, 0);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  legend.innerHTML = "";

  if (total === 0) {
    ctx.fillStyle = "#1e293b";
    ctx.beginPath();
    ctx.arc(140, 140, 96, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(140, 140, 46, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    legend.innerHTML = "<div class='stack-item empty-state'>Add expenses to see the chart.</div>";
    return;
  }

  let startAngle = -Math.PI / 2;

  entries.forEach(([category, amount]) => {
    const sliceAngle = (amount / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(140, 140);
    ctx.arc(140, 140, 96, startAngle, startAngle + sliceAngle);
    ctx.closePath();
    ctx.fillStyle = chartColors[category] || chartColors.others;
    ctx.fill();
    startAngle += sliceAngle;

    const legendItem = document.createElement("div");
    legendItem.className = "legend-item";
    legendItem.innerHTML = `
      <div class="legend-left">
        <span class="legend-swatch" style="background:${chartColors[category] || chartColors.others}"></span>
        <span>${formatCategory(category)}</span>
      </div>
      <strong>${formatCurrency(amount)}</strong>
    `;
    legend.appendChild(legendItem);
  });

  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(140, 140, 46, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
}

function renderStats() {
  const totals = getPeriods();
  const categoryTotals = getCategoryTotals();
  const topCategory = Object.keys(categoryTotals).reduce((best, current) =>
    categoryTotals[current] > categoryTotals[best] ? current : best
  );

  document.getElementById("stat-count").textContent = String(state.expenses.length);
  document.getElementById("stat-today").textContent = formatCurrency(totals.today);
  document.getElementById("stat-week").textContent = formatCurrency(totals.week);
  document.getElementById("stat-month").textContent = formatCurrency(totals.month);
  document.getElementById("stat-top-category").textContent =
    categoryTotals[topCategory] > 0 ? formatCategory(topCategory) : "None";
  document.getElementById("stat-prediction").textContent = formatCurrency(latestAnalysis?.predictedMonthlySpend || 0);
}

function renderSummaryCards() {
  const summary = document.getElementById("summary-cards");
  summary.innerHTML = "";

  if (!latestAnalysis) {
    summary.innerHTML = "<div class='summary-card empty-state'>Run analysis to see your summary.</div>";
    return;
  }

  const items = [
    { title: "Today", text: formatCurrency(latestAnalysis.summaries.today) },
    { title: "This Week", text: formatCurrency(latestAnalysis.summaries.week) },
    { title: "This Month", text: formatCurrency(latestAnalysis.summaries.month) },
    { title: "Last Month", text: formatCurrency(latestAnalysis.summaries.lastMonth) },
    { title: "Prediction", text: latestAnalysis.prediction },
    { title: "Goal", text: `${latestAnalysis.goal.name}: ${latestAnalysis.goal.progressPercent}% complete` }
  ];

  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "summary-card";
    card.innerHTML = `<strong>${item.title}</strong><p>${item.text}</p>`;
    summary.appendChild(card);
  });
}

function renderStackList(elementId, items, fallback) {
  const container = document.getElementById(elementId);
  container.innerHTML = "";

  if (!items || items.length === 0) {
    container.innerHTML = `<div class="stack-item empty-state">${fallback}</div>`;
    return;
  }

  items.forEach((item) => {
    const wrapper = document.createElement("div");
    wrapper.className = "stack-item";
    wrapper.innerHTML = typeof item === "string"
      ? `<strong>${item}</strong>`
      : `<strong>${item.title}</strong><p>${item.body}</p>`;
    container.appendChild(wrapper);
  });
}

function renderAnalysis() {
  if (!latestAnalysis) {
    renderStackList("explainable-list", [], "Insights will appear here.");
    renderStackList("suggestions-list", [], "Suggestions will appear here.");
    renderStackList("prediction-cards", [], "Predictions will appear here.");
    renderStackList("tips-list", [], "Tips will appear here.");
    document.getElementById("challenge-text").textContent = "Add expenses to unlock a daily challenge.";
    return;
  }

  renderSummaryCards();
  renderStackList("explainable-list", latestAnalysis.explainableInsights, "No explainable insights yet.");
  renderStackList("suggestions-list", latestAnalysis.suggestions, "No suggestions right now.");
  renderStackList("tips-list", latestAnalysis.personalizedTips, "No extra tips right now.");

  const predictionItems = [
    { title: "Monthly Summary", body: latestAnalysis.monthlySummary },
    { title: "Spending Trend", body: latestAnalysis.prediction },
    {
      title: "Budget Watch",
      body: latestAnalysis.budgetAlerts.length
        ? latestAnalysis.budgetAlerts.map((item) => `${formatCategory(item.category)} ${item.exceeded ? "is over budget" : `is at ${item.usage}% of budget`}`).join(". ")
        : "All categories are comfortably within budget."
    },
    {
      title: "Reminders Due Soon",
      body: latestAnalysis.remindersDueSoon.length
        ? latestAnalysis.remindersDueSoon.map((item) => `${item.title} on ${item.dueDate}`).join(", ")
        : "No bills due in the next 7 days."
    }
  ];

  renderStackList("prediction-cards", predictionItems, "Predictions will appear here.");
  document.getElementById("challenge-text").textContent = latestAnalysis.dailyChallenge;
}

function renderAll() {
  setProfileMode();
  renderBudgets();
  renderGoal();
  renderReminders();
  renderExpenses();
  renderStats();
  renderChart(getCategoryTotals());
  document.getElementById("profile-mode").value = state.profile?.mode || "smart";
  document.getElementById("profile-user-type").value = state.profile?.userType || "general";
  document.getElementById("api-base-url").value = activeApiBaseUrl || getApiBaseUrl();
}

function saveApiBaseUrl() {
  const input = document.getElementById("api-base-url");
  const value = input.value.trim();

  if (!value) {
    alert("Please enter a backend API URL.");
    return;
  }

  setApiBaseUrl(value);
  loadState();
}

async function findWorkingApiBaseUrl() {
  const candidates = getCandidateApiBaseUrls();

  for (const candidate of candidates) {
    try {
      const response = await fetch(`${candidate}/state`);
      if (response.ok) {
        setApiBaseUrl(candidate);
        return candidate;
      }
    } catch (error) {
      continue;
    }
  }

  throw new Error("Could not connect to the backend. Check the API URL and server.");
}

async function loadState() {
  try {
    await findWorkingApiBaseUrl();
    const response = await api("/state");
    if (!response.ok) {
      throw new Error("Could not load app state.");
    }
    state = await response.json();
    renderAll();
    await analyze();
  } catch (error) {
    alert(error.message);
  }
}

async function analyze() {
  try {
    const response = await api("/analyze", {
      method: "POST",
      body: JSON.stringify({})
    });
    if (!response.ok) {
      throw new Error("Could not generate analysis.");
    }
    latestAnalysis = await response.json();
    renderStats();
    renderGoal();
    renderAnalysis();
  } catch (error) {
    renderStackList("suggestions-list", [], error.message);
  }
}

async function saveExpense() {
  const amount = parseFloat(document.getElementById("amount").value);
  const description = document.getElementById("description").value.trim();
  const categoryInput = document.getElementById("category").value;
  const mood = document.getElementById("mood").value;
  const date = document.getElementById("expense-date").value || todayString();
  const notes = document.getElementById("notes").value.trim();
  const category = categoryInput || autoCategorize(description);

  if (Number.isNaN(amount) || amount <= 0 || !description) {
    alert("Please enter a valid amount and description.");
    return;
  }

  const payload = { amount, description, category, mood, date, notes };
  const path = editingExpenseId ? `/expenses/${editingExpenseId}` : "/expenses";
  const method = editingExpenseId ? "PUT" : "POST";

  try {
    const response = await api(path, {
      method,
      body: JSON.stringify(payload)
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Could not save expense.");
    }

    if (editingExpenseId) {
      state.expenses = state.expenses.map((expense) => expense.id === editingExpenseId ? data : expense);
    } else {
      state.expenses.push(data);
    }

    renderAll();
    resetExpenseForm();
    await analyze();
  } catch (error) {
    alert(error.message);
  }
}

function editExpense(id) {
  const expense = state.expenses.find((item) => item.id === id);
  if (!expense) {
    return;
  }

  editingExpenseId = id;
  document.getElementById("expense-form-title").textContent = "Edit Expense";
  document.getElementById("form-status").textContent = "Update the expense and save the changes.";
  document.getElementById("save-expense-button").textContent = "Update Expense";
  document.getElementById("cancel-edit-button").style.display = "inline-flex";

  document.getElementById("amount").value = expense.amount;
  document.getElementById("description").value = expense.description;
  document.getElementById("category").value = expense.category;
  document.getElementById("mood").value = expense.mood || "planned";
  document.getElementById("expense-date").value = expense.date;
  document.getElementById("notes").value = expense.notes || "";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function cancelEdit() {
  resetExpenseForm();
}

async function deleteExpense(id) {
  if (!window.confirm("Delete this expense?")) {
    return;
  }

  try {
    const response = await api(`/expenses/${id}`, { method: "DELETE" });
    if (!response.ok) {
      throw new Error("Could not delete the expense.");
    }
    state.expenses = state.expenses.filter((expense) => expense.id !== id);
    renderAll();
    await analyze();
  } catch (error) {
    alert(error.message);
  }
}

async function saveBudgets() {
  const budgets = {};
  document.querySelectorAll("[data-budget-category]").forEach((input) => {
    budgets[input.dataset.budgetCategory] = Number(input.value) || 0;
  });

  try {
    const response = await api("/budgets", {
      method: "PUT",
      body: JSON.stringify({ budgets })
    });
    if (!response.ok) {
      throw new Error("Could not save budgets.");
    }
    state.budgets = await response.json();
    renderAll();
    await analyze();
  } catch (error) {
    alert(error.message);
  }
}

async function saveGoal() {
  const payload = {
    name: document.getElementById("goal-name").value.trim(),
    target: Number(document.getElementById("goal-target").value) || 0,
    saved: Number(document.getElementById("goal-saved").value) || 0
  };

  if (!payload.name || payload.target <= 0) {
    alert("Please enter a valid goal name and target.");
    return;
  }

  try {
    const response = await api("/goal", {
      method: "PUT",
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error("Could not save goal.");
    }
    state.goal = await response.json();
    renderGoal();
    await analyze();
  } catch (error) {
    alert(error.message);
  }
}

async function saveProfile() {
  const payload = {
    mode: document.getElementById("profile-mode").value,
    userType: document.getElementById("profile-user-type").value
  };

  try {
    const response = await api("/profile", {
      method: "PUT",
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error("Could not save profile.");
    }
    state.profile = await response.json();
    setProfileMode();
    await analyze();
  } catch (error) {
    alert(error.message);
  }
}

async function addReminder() {
  const payload = {
    title: document.getElementById("reminder-title").value.trim(),
    amount: Number(document.getElementById("reminder-amount").value) || 0,
    dueDate: document.getElementById("reminder-date").value || todayString(),
    category: document.getElementById("reminder-category").value,
    notes: ""
  };

  if (!payload.title) {
    alert("Please enter a reminder name.");
    return;
  }

  try {
    const response = await api("/reminders", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || "Could not add reminder.");
    }
    state.reminders.push(data);
    renderReminders();
    document.getElementById("reminder-title").value = "";
    document.getElementById("reminder-amount").value = "";
    document.getElementById("reminder-date").value = "";
    await analyze();
  } catch (error) {
    alert(error.message);
  }
}

async function deleteReminder(id) {
  try {
    const response = await api(`/reminders/${id}`, { method: "DELETE" });
    if (!response.ok) {
      throw new Error("Could not delete reminder.");
    }
    state.reminders = state.reminders.filter((reminder) => reminder.id !== id);
    renderReminders();
    await analyze();
  } catch (error) {
    alert(error.message);
  }
}

function parseVoiceTranscript(transcript) {
  const amountMatch = transcript.match(/(\d+(?:\.\d+)?)/);
  const amount = amountMatch ? Number(amountMatch[1]) : null;
  const description = transcript
    .replace(/spent/i, "")
    .replace(/rs/gi, "")
    .replace(/rupees?/gi, "")
    .replace(/today|yesterday/gi, "")
    .replace(/\d+(?:\.\d+)?/g, "")
    .replace(/\bon\b/gi, "")
    .trim();

  return {
    amount,
    description: description || transcript.trim(),
    category: autoCategorize(description || transcript),
    date: todayString()
  };
}

function setupCoinScrollVideo() {
  const heroVisual = document.querySelector(".hero-visual");
  const video = document.getElementById("coin-scroll-video");

  if (!video || !heroVisual) {
    return;
  }

  video.play().catch(() => {});
  heroVisual.classList.add("is-active");
}

function setupRevealOnScroll() {
  const items = document.querySelectorAll(".reveal-on-scroll");

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("reveal-visible");
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.16,
    rootMargin: "0px 0px -8% 0px"
  });

  items.forEach((item) => {
    if (!item.classList.contains("reveal-visible")) {
      observer.observe(item);
    }
  });
}

function startVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    alert("Voice input is not supported in this browser. Try Chrome.");
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "en-IN";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    const parsed = parseVoiceTranscript(transcript);

    if (parsed.amount) {
      document.getElementById("amount").value = parsed.amount;
    }
    document.getElementById("description").value = parsed.description;
    document.getElementById("category").value = parsed.category;
    document.getElementById("expense-date").value = parsed.date;
    document.getElementById("form-status").textContent = `Voice captured: "${transcript}"`;
  };

  recognition.onerror = () => {
    alert("Voice input failed. Please try again.");
  };

  recognition.start();
}

resetExpenseForm();
setupCoinScrollVideo();
setupRevealOnScroll();
loadState();
