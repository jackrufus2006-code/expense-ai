const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const categories = ["food", "travel", "shopping", "entertainment", "utilities", "others"];
const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, "data");
const storeFile = path.join(dataDir, "store.json");
const legacyExpenseFile = path.join(dataDir, "expenses.json");

app.use(cors());
app.use(express.json());

function defaultBudgets() {
  return {
    food: 2500,
    travel: 1500,
    shopping: 2000,
    entertainment: 1200,
    utilities: 1800,
    others: 1000
  };
}

function defaultStore(seedExpenses = []) {
  return {
    expenses: seedExpenses,
    budgets: defaultBudgets(),
    goal: {
      name: "Emergency Fund",
      target: 15000,
      saved: 2000
    },
    profile: {
      mode: "smart",
      userType: "general"
    },
    reminders: [
      {
        id: Date.now(),
        title: "Electricity Bill",
        amount: 900,
        dueDate: new Date().toISOString().slice(0, 10),
        category: "utilities",
        notes: "Monthly bill reminder"
      }
    ]
  };
}

function ensureStorage() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(storeFile)) {
    let seedExpenses = [];

    if (fs.existsSync(legacyExpenseFile)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(legacyExpenseFile, "utf8"));
        seedExpenses = Array.isArray(parsed) ? parsed : [];
      } catch (error) {
        seedExpenses = [];
      }
    }

    fs.writeFileSync(storeFile, JSON.stringify(defaultStore(seedExpenses), null, 2), "utf8");
  }
}

function normalizeExpense(expense) {
  return {
    id: Number(expense.id) || Date.now() + Math.floor(Math.random() * 1000),
    amount: Number(expense.amount),
    description: String(expense.description || "").trim(),
    category: categories.includes(String(expense.category || "").toLowerCase())
      ? String(expense.category).toLowerCase()
      : "others",
    mood: String(expense.mood || "planned").toLowerCase(),
    notes: String(expense.notes || "").trim(),
    date: String(expense.date || new Date().toISOString().slice(0, 10)),
    createdAt: expense.createdAt || new Date().toISOString()
  };
}

function normalizeReminder(reminder) {
  return {
    id: Number(reminder.id) || Date.now() + Math.floor(Math.random() * 1000),
    title: String(reminder.title || "").trim(),
    amount: Number(reminder.amount || 0),
    dueDate: String(reminder.dueDate || new Date().toISOString().slice(0, 10)),
    category: categories.includes(String(reminder.category || "").toLowerCase())
      ? String(reminder.category).toLowerCase()
      : "others",
    notes: String(reminder.notes || "").trim()
  };
}

function normalizeStore(store) {
  const incoming = store && typeof store === "object" ? store : {};
  const merged = defaultStore();
  const budgetSource = incoming.budgets && typeof incoming.budgets === "object" ? incoming.budgets : {};

  return {
    expenses: Array.isArray(incoming.expenses) ? incoming.expenses.map(normalizeExpense) : [],
    budgets: categories.reduce((acc, category) => {
      acc[category] = Number(budgetSource[category]) || 0;
      return acc;
    }, {}),
    goal: {
      name: String(incoming.goal?.name || merged.goal.name),
      target: Number(incoming.goal?.target) || merged.goal.target,
      saved: Number(incoming.goal?.saved) || 0
    },
    profile: {
      mode: incoming.profile?.mode === "beginner" ? "beginner" : "smart",
      userType: incoming.profile?.userType === "student" ? "student" : "general"
    },
    reminders: Array.isArray(incoming.reminders)
      ? incoming.reminders.map(normalizeReminder).filter((item) => item.title)
      : merged.reminders
  };
}

function readStore() {
  ensureStorage();

  try {
    const parsed = JSON.parse(fs.readFileSync(storeFile, "utf8"));
    return normalizeStore(parsed);
  } catch (error) {
    const fallback = defaultStore();
    fs.writeFileSync(storeFile, JSON.stringify(fallback, null, 2), "utf8");
    return fallback;
  }
}

function writeStore(store) {
  ensureStorage();
  fs.writeFileSync(storeFile, JSON.stringify(normalizeStore(store), null, 2), "utf8");
}

function getPeriodTotals(expenses) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const currentMonth = today.slice(0, 7);
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 6);

  return expenses.reduce(
    (acc, expense) => {
      const amount = Number(expense.amount);
      const expenseDate = new Date(expense.date);

      if (expense.date === today) {
        acc.today += amount;
      }

      if (expense.date.slice(0, 7) === currentMonth) {
        acc.month += amount;
      }

      if (expenseDate >= sevenDaysAgo && expenseDate <= now) {
        acc.week += amount;
      }

      return acc;
    },
    { today: 0, week: 0, month: 0 }
  );
}

function getLastMonthTotal(expenses) {
  const now = new Date();
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthKey = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}`;

  return expenses.reduce((sum, expense) => {
    return expense.date.startsWith(lastMonthKey) ? sum + Number(expense.amount) : sum;
  }, 0);
}

function buildAnalysis(store) {
  const expenses = [...store.expenses].sort((a, b) => new Date(b.date) - new Date(a.date));
  const totals = getPeriodTotals(expenses);
  const total = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const categoriesTotal = categories.reduce((acc, category) => {
    acc[category] = 0;
    return acc;
  }, {});

  const moods = {
    happy: 0,
    stress: 0,
    urgent: 0,
    planned: 0
  };

  expenses.forEach((expense) => {
    const amount = Number(expense.amount);
    categoriesTotal[expense.category] = (categoriesTotal[expense.category] || 0) + amount;
    if (moods[expense.mood] !== undefined) {
      moods[expense.mood] += amount;
    }
  });

  const topCategory = Object.keys(categoriesTotal).reduce((best, current) =>
    categoriesTotal[current] > categoriesTotal[best] ? current : best
  );

  const monthProgress = new Date().getDate();
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const predictedMonthlySpend = totals.month > 0
    ? Number(((totals.month / monthProgress) * daysInMonth).toFixed(2))
    : 0;
  const lastMonthTotal = getLastMonthTotal(expenses);
  const trendPercent = lastMonthTotal > 0
    ? Number((((totals.month - lastMonthTotal) / lastMonthTotal) * 100).toFixed(1))
    : 0;

  const budgetAlerts = categories
    .map((category) => {
      const spent = categoriesTotal[category];
      const limit = Number(store.budgets[category] || 0);
      const usage = limit > 0 ? (spent / limit) * 100 : 0;

      return {
        category,
        spent: Number(spent.toFixed(2)),
        limit: Number(limit.toFixed(2)),
        usage: Number(usage.toFixed(1)),
        exceeded: limit > 0 && spent > limit
      };
    })
    .filter((item) => item.limit > 0);

  const explainableInsights = [];
  const suggestions = [];

  budgetAlerts.forEach((alert) => {
    if (alert.exceeded) {
      explainableInsights.push(
        `${alert.category} is over budget because you spent Rs ${alert.spent.toFixed(2)} against a limit of Rs ${alert.limit.toFixed(2)}.`
      );
      suggestions.push(`Reduce ${alert.category} spending by Rs ${(alert.spent - alert.limit).toFixed(2)} to get back on budget.`);
    } else if (alert.usage >= 80) {
      explainableInsights.push(
        `${alert.category} is close to budget at ${alert.usage}% of your limit.`
      );
      suggestions.push(`Watch ${alert.category} for the rest of the month to avoid crossing the limit.`);
    }
  });

  if (total > 0) {
    explainableInsights.push(
      `${topCategory} is your largest category, taking ${((categoriesTotal[topCategory] / total) * 100).toFixed(1)}% of total spending.`
    );
  }

  if (trendPercent > 0) {
    explainableInsights.push(
      `Your monthly spending is ${trendPercent}% higher than last month.`
    );
    suggestions.push("Try a lower-spend week to slow down the monthly trend.");
  } else if (lastMonthTotal > 0) {
    explainableInsights.push(
      `Your monthly spending is ${Math.abs(trendPercent)}% lower than last month.`
    );
  }

  const goalRemaining = Math.max(0, Number(store.goal.target) - Number(store.goal.saved));
  const possibleMonthlySavings = Math.max(0, Number(store.budgets[topCategory] || 0) - categoriesTotal[topCategory]);
  const monthsToGoal = possibleMonthlySavings > 0
    ? Math.ceil(goalRemaining / possibleMonthlySavings)
    : null;

  if (goalRemaining > 0) {
    suggestions.push(
      monthsToGoal
        ? `At your current pace, saving unused budget from ${topCategory} could help finish "${store.goal.name}" in about ${monthsToGoal} months.`
        : `Set aside even Rs 500 per month to move closer to "${store.goal.name}".`
    );
  }

  const remindersDueSoon = store.reminders.filter((reminder) => {
    const dueDate = new Date(reminder.dueDate);
    const today = new Date();
    const sevenDaysLater = new Date();
    sevenDaysLater.setDate(today.getDate() + 7);
    return dueDate >= today && dueDate <= sevenDaysLater;
  });

  const topMood = Object.keys(moods).reduce((best, current) =>
    moods[current] > moods[best] ? current : best
  );

  const dailyChallenge = total === 0
    ? "Add your first expense today and start building your financial picture."
    : categoriesTotal[topCategory] > 0
      ? `Daily challenge: keep ${topCategory} spending under Rs ${Math.max(100, Math.round(categoriesTotal[topCategory] / Math.max(1, monthProgress))).toFixed(0)} today.`
      : "Daily challenge: record every expense before the day ends.";

  const personalizedTips = [];

  if (store.profile.userType === "student") {
    personalizedTips.push("Student mode: track snacks, transport, recharge, and study material separately to see small leaks faster.");
    personalizedTips.push("Student mode: try weekly cash limits for food and entertainment to protect your semester budget.");
  } else {
    personalizedTips.push("Try reviewing your top category every Sunday so small over-spending does not snowball.");
  }

  if (moods.stress > moods.planned && moods.stress > 0) {
    explainableInsights.push("Stress spending is higher than planned spending right now.");
    suggestions.push("Pause for two minutes before urgent or stress purchases to avoid impulse spending.");
  }

  return {
    total: Number(total.toFixed(2)),
    categories: categoriesTotal,
    summaries: {
      today: Number(totals.today.toFixed(2)),
      week: Number(totals.week.toFixed(2)),
      month: Number(totals.month.toFixed(2)),
      lastMonth: Number(lastMonthTotal.toFixed(2))
    },
    topCategory,
    topMood,
    moods,
    budgetAlerts,
    explainableInsights,
    suggestions,
    predictedMonthlySpend,
    trendPercent,
    dailyChallenge,
    remindersDueSoon,
    personalizedTips,
    goal: {
      ...store.goal,
      remaining: Number(goalRemaining.toFixed(2)),
      progressPercent: Number(((Number(store.goal.saved) / Number(store.goal.target || 1)) * 100).toFixed(1))
    },
    insights: explainableInsights.join(" "),
    monthlySummary: `You have spent Rs ${totals.month.toFixed(2)} this month and are projected to reach around Rs ${predictedMonthlySpend.toFixed(2)} by month end.`,
    prediction: trendPercent >= 0
      ? `If this pattern continues, your spending may finish ${trendPercent || 0}% above last month.`
      : `You are trending lower than last month by ${Math.abs(trendPercent)}%.`
  };
}

app.get("/", (req, res) => {
  return res.json({
    service: "expense-ai-backend",
    status: "ok",
    health: "/health",
    state: "/state"
  });
});

app.get("/health", (req, res) => {
  return res.json({
    status: "ok",
    timestamp: new Date().toISOString()
  });
});

app.get("/state", (req, res) => {
  return res.json(readStore());
});

app.post("/expenses", (req, res) => {
  const store = readStore();
  const newExpense = normalizeExpense(req.body);

  if (!newExpense.description || Number.isNaN(newExpense.amount) || newExpense.amount <= 0) {
    return res.status(400).json({ message: "Please send a valid amount and description." });
  }

  store.expenses.push(newExpense);
  writeStore(store);
  return res.status(201).json(newExpense);
});

app.put("/expenses/:id", (req, res) => {
  const store = readStore();
  const expenseId = Number(req.params.id);
  const index = store.expenses.findIndex((expense) => Number(expense.id) === expenseId);

  if (index === -1) {
    return res.status(404).json({ message: "Expense not found." });
  }

  const updatedExpense = normalizeExpense({
    ...store.expenses[index],
    ...req.body,
    id: expenseId
  });

  if (!updatedExpense.description || Number.isNaN(updatedExpense.amount) || updatedExpense.amount <= 0) {
    return res.status(400).json({ message: "Please send a valid amount and description." });
  }

  store.expenses[index] = updatedExpense;
  writeStore(store);
  return res.json(updatedExpense);
});

app.delete("/expenses/:id", (req, res) => {
  const store = readStore();
  const expenseId = Number(req.params.id);
  const beforeCount = store.expenses.length;
  store.expenses = store.expenses.filter((expense) => Number(expense.id) !== expenseId);

  if (store.expenses.length === beforeCount) {
    return res.status(404).json({ message: "Expense not found." });
  }

  writeStore(store);
  return res.json({ success: true });
});

app.put("/budgets", (req, res) => {
  const store = readStore();
  store.budgets = categories.reduce((acc, category) => {
    acc[category] = Number(req.body?.budgets?.[category]) || 0;
    return acc;
  }, {});
  writeStore(store);
  return res.json(store.budgets);
});

app.put("/goal", (req, res) => {
  const store = readStore();
  store.goal = {
    name: String(req.body?.name || store.goal.name),
    target: Number(req.body?.target) || store.goal.target,
    saved: Number(req.body?.saved) || 0
  };
  writeStore(store);
  return res.json(store.goal);
});

app.put("/profile", (req, res) => {
  const store = readStore();
  store.profile = {
    mode: req.body?.mode === "beginner" ? "beginner" : "smart",
    userType: req.body?.userType === "student" ? "student" : "general"
  };
  writeStore(store);
  return res.json(store.profile);
});

app.post("/reminders", (req, res) => {
  const store = readStore();
  const reminder = normalizeReminder(req.body);

  if (!reminder.title) {
    return res.status(400).json({ message: "Reminder title is required." });
  }

  store.reminders.push(reminder);
  writeStore(store);
  return res.status(201).json(reminder);
});

app.delete("/reminders/:id", (req, res) => {
  const store = readStore();
  const reminderId = Number(req.params.id);
  const beforeCount = store.reminders.length;
  store.reminders = store.reminders.filter((reminder) => Number(reminder.id) !== reminderId);

  if (beforeCount === store.reminders.length) {
    return res.status(404).json({ message: "Reminder not found." });
  }

  writeStore(store);
  return res.json({ success: true });
});

app.post("/analyze", (req, res) => {
  const store = readStore();
  return res.json(buildAnalysis(store));
});

app.listen(PORT, () => {
  ensureStorage();
  console.log(`Server running on port ${PORT}`);
});
