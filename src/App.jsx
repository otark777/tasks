import { useState, useMemo, useCallback } from "react";

// ─── Algorithm ───
function runScheduler(tasks, employees) {
  if (!tasks.length || !employees.length) return { schedule: [], makespan: 0, taskCompletions: {} };

  const TIME_SLOT = 0.5; // 30 min slots
  const MAX_TIME = 200; // max slots to prevent infinite loop

  // Init task state
  const taskState = tasks.map((t) => ({
    ...t,
    remaining: t.duration - (t.currentProgress || 0),
    completed: false,
    completedAt: null,
  }));

  // Init employee state
  const empState = employees.map((e) => ({
    ...e,
    busyUntil: e.busyUntil || 0,
    currentTask: e.currentTaskName || null,
    currentTaskRemaining: e.currentTaskRemaining || 0,
  }));

  // Schedule entries: { empId, empName, taskId, taskName, start, end, priority, color }
  const schedule = [];
  let time = 0;

  // Track current assignments for continuity
  const empCurrentAssignment = {};

  while (time < MAX_TIME) {
    // Check if all tasks done
    if (taskState.every((t) => t.completed)) break;

    // Get available employees at this time
    const availableEmps = empState.filter((e) => {
      const dayHour = time % 24;
      const isInSchedule = dayHour >= e.startHour && dayHour < e.endHour;
      const isNotBusy = time >= e.busyUntil;
      return isInSchedule && isNotBusy;
    });

    // Get pending tasks sorted by priority desc, then by remaining asc
    const pendingTasks = taskState
      .filter((t) => !t.completed && t.remaining > 0)
      .sort((a, b) => b.priority - a.priority || a.remaining - b.remaining);

    // Assign tasks to employees
    const assigned = new Set();
    const empAssignments = new Map();

    for (const task of pendingTasks) {
      if (assigned.size >= availableEmps.length) break;

      // Find best employee: prefer one already working on this task
      let bestEmp = availableEmps.find(
        (e) => !assigned.has(e.id) && empCurrentAssignment[e.id] === task.id
      );
      if (!bestEmp) {
        bestEmp = availableEmps.find((e) => !assigned.has(e.id));
      }

      if (bestEmp) {
        assigned.add(bestEmp.id);
        empAssignments.set(bestEmp.id, task);
        empCurrentAssignment[bestEmp.id] = task.id;
      }
    }

    // Process time slot
    for (const [empId, task] of empAssignments) {
      const emp = empState.find((e) => e.id === empId);
      const work = Math.min(TIME_SLOT, task.remaining);
      task.remaining -= work;

      // Add or extend schedule entry
      const lastEntry = schedule[schedule.length - 1];
      const canExtend =
        lastEntry &&
        lastEntry.empId === empId &&
        lastEntry.taskId === task.id &&
        Math.abs(lastEntry.end - time) < 0.01;

      if (canExtend) {
        lastEntry.end = time + work;
      } else {
        schedule.push({
          empId,
          empName: emp.name,
          taskId: task.id,
          taskName: task.name,
          start: time,
          end: time + work,
          priority: task.priority,
        });
      }

      if (task.remaining <= 0.01) {
        task.completed = true;
        task.completedAt = time + work;
      }
    }

    time += TIME_SLOT;
  }

  const makespan = Math.max(...taskState.filter((t) => t.completedAt).map((t) => t.completedAt), 0);
  const taskCompletions = {};
  taskState.forEach((t) => {
    taskCompletions[t.id] = { name: t.name, completedAt: t.completedAt, completed: t.completed };
  });

  return { schedule, makespan, taskCompletions, taskState };
}

// ─── Colors ───
const TASK_COLORS = [
  "#E8453C", "#2D8CF0", "#19B37D", "#F5A623", "#8B5CF6",
  "#EC4899", "#06B6D4", "#84CC16", "#F97316", "#6366F1",
  "#14B8A6", "#EF4444", "#3B82F6", "#A855F7", "#F59E0B",
];

const PRIORITY_LABELS = { 1: "Low", 2: "Medium", 3: "High", 4: "Critical" };
const PRIORITY_COLORS = { 1: "#6B7280", 2: "#2D8CF0", 3: "#F5A623", 4: "#E8453C" };

// ─── Components ───

function GanttChart({ schedule, employees, makespan, taskColorMap }) {
  if (!schedule.length) return null;

  const chartWidth = 760;
  const rowHeight = 44;
  const leftMargin = 130;
  const topMargin = 32;
  const rightPad = 20;
  const barAreaWidth = chartWidth - leftMargin - rightPad;
  const displayMax = Math.ceil(makespan) + 1;
  const pxPerHour = barAreaWidth / displayMax;

  const hours = [];
  for (let i = 0; i <= displayMax; i++) hours.push(i);

  const empIds = employees.map((e) => e.id);
  const chartHeight = topMargin + empIds.length * rowHeight + 20;

  return (
    <div style={{ overflowX: "auto", marginTop: 16 }}>
      <svg width={chartWidth} height={chartHeight} style={{ display: "block" }}>
        {/* Grid lines */}
        {hours.map((h) => (
          <g key={h}>
            <line
              x1={leftMargin + h * pxPerHour} y1={topMargin - 4}
              x2={leftMargin + h * pxPerHour} y2={topMargin + empIds.length * rowHeight}
              stroke="rgba(255,255,255,0.06)" strokeWidth={1}
            />
            <text
              x={leftMargin + h * pxPerHour} y={topMargin - 10}
              fill="rgba(255,255,255,0.35)" fontSize={12} textAnchor="middle"
              fontFamily="'JetBrains Mono', monospace"
            >
              {h}ч
            </text>
          </g>
        ))}

        {/* Employee rows */}
        {empIds.map((empId, idx) => {
          const emp = employees.find((e) => e.id === empId);
          const y = topMargin + idx * rowHeight;
          const entries = schedule.filter((s) => s.empId === empId);

          return (
            <g key={empId}>
              {/* Row bg */}
              <rect x={0} y={y} width={chartWidth} height={rowHeight}
                fill={idx % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent"} />
              {/* Name */}
              <text x={12} y={y + rowHeight / 2 + 4} fill="rgba(255,255,255,0.7)"
                fontSize={14} fontFamily="'JetBrains Mono', monospace" fontWeight={500}>
                {emp.name}
              </text>
              {/* Bars */}
              {entries.map((entry, ei) => {
                const bx = leftMargin + entry.start * pxPerHour;
                const bw = Math.max((entry.end - entry.start) * pxPerHour - 1, 2);
                const color = taskColorMap[entry.taskId] || "#666";
                return (
                  <g key={ei}>
                    <rect x={bx} y={y + 6} width={bw} height={rowHeight - 12}
                      rx={4} fill={color} opacity={0.85} />
                    {bw > 40 && (
                      <text x={bx + bw / 2} y={y + rowHeight / 2 + 4}
                        fill="white" fontSize={12} textAnchor="middle"
                        fontFamily="'JetBrains Mono', monospace" fontWeight={600}>
                        {entry.taskName}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* Makespan line */}
        <line
          x1={leftMargin + makespan * pxPerHour} y1={topMargin - 4}
          x2={leftMargin + makespan * pxPerHour} y2={topMargin + empIds.length * rowHeight}
          stroke="#E8453C" strokeWidth={2} strokeDasharray="4,3"
        />
        <text x={leftMargin + makespan * pxPerHour} y={topMargin + empIds.length * rowHeight + 14}
          fill="#E8453C" fontSize={12} textAnchor="middle"
          fontFamily="'JetBrains Mono', monospace" fontWeight={600}>
          {makespan.toFixed(1)}ч
        </text>
      </svg>
    </div>
  );
}

// ─── Main App ───
export default function TaskScheduler() {
  const [tasks, setTasks] = useState([
    { id: 1, name: "API Integration", duration: 8, priority: 4, currentProgress: 0 },
    { id: 2, name: "Dashboard UI", duration: 6, priority: 3, currentProgress: 0 },
    { id: 3, name: "Database Setup", duration: 4, priority: 4, currentProgress: 0 },
    { id: 4, name: "Testing", duration: 5, priority: 2, currentProgress: 0 },
    { id: 5, name: "Documentation", duration: 3, priority: 1, currentProgress: 0 },
  ]);

  const [employees, setEmployees] = useState([
    { id: 1, name: "Alex", startHour: 0, endHour: 24, busyUntil: 0, currentTaskName: "", currentTaskRemaining: 0 },
    { id: 2, name: "Maria", startHour: 0, endHour: 24, busyUntil: 0, currentTaskName: "", currentTaskRemaining: 0 },
    { id: 3, name: "James", startHour: 0, endHour: 24, busyUntil: 2, currentTaskName: "Code Review", currentTaskRemaining: 2 },
  ]);

  const [showResult, setShowResult] = useState(false);
  const [activeTab, setActiveTab] = useState("tasks");
  const [nextTaskId, setNextTaskId] = useState(6);
  const [nextEmpId, setNextEmpId] = useState(4);

  const taskColorMap = useMemo(() => {
    const map = {};
    tasks.forEach((t, i) => { map[t.id] = TASK_COLORS[i % TASK_COLORS.length]; });
    return map;
  }, [tasks]);

  const result = useMemo(() => {
    if (!showResult) return null;
    return runScheduler(tasks, employees);
  }, [showResult, tasks, employees]);

  const addTask = () => {
    setTasks([...tasks, { id: nextTaskId, name: "New Task", duration: 4, priority: 2, currentProgress: 0 }]);
    setNextTaskId(nextTaskId + 1);
  };

  const removeTask = (id) => setTasks(tasks.filter((t) => t.id !== id));

  const updateTask = (id, field, value) => {
    setTasks(tasks.map((t) => (t.id === id ? { ...t, [field]: value } : t)));
    setShowResult(false);
  };

  const addEmployee = () => {
    setEmployees([
      ...employees,
      { id: nextEmpId, name: "Employee", startHour: 0, endHour: 24, busyUntil: 0, currentTaskName: "", currentTaskRemaining: 0 },
    ]);
    setNextEmpId(nextEmpId + 1);
  };

  const removeEmployee = (id) => setEmployees(employees.filter((e) => e.id !== id));

  const updateEmployee = (id, field, value) => {
    setEmployees(employees.map((e) => (e.id === id ? { ...e, [field]: value } : e)));
    setShowResult(false);
  };

  const solve = useCallback(() => setShowResult(true), []);

  const totalWork = tasks.reduce((s, t) => s + t.duration - (t.currentProgress || 0), 0);
  const totalCapacity = employees.reduce((s, e) => s + (e.endHour - e.startHour), 0);

  const inputStyle = {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 6,
    color: "#E8E8E8",
    padding: "7px 10px",
    fontSize: 16,
    fontFamily: "'JetBrains Mono', monospace",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  };

  const btnBase = {
    border: "none",
    borderRadius: 8,
    padding: "10px 20px",
    fontSize: 16,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "'JetBrains Mono', monospace",
    transition: "all 0.2s",
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0A0A0B",
      color: "#E8E8E8",
      fontFamily: "'JetBrains Mono', monospace",
      padding: "24px 16px",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%", background: "#19B37D",
            boxShadow: "0 0 8px rgba(25,179,125,0.5)",
          }} />
          <span style={{ fontSize: 16, color: "rgba(255,255,255,0.35)", letterSpacing: 3, textTransform: "uppercase" }}>
            scheduler v1.0
          </span>
        </div>
        <h1 style={{
          fontSize: 28, fontWeight: 700, margin: "8px 0 4px",
          background: "linear-gradient(135deg, #E8E8E8 0%, #888 100%)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>
          Task Scheduler
        </h1>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.35)", margin: "0 0 24px", lineHeight: 1.5 }}>
          Optimal task allocation · Preemptive priority scheduling · Minimum completion time
        </p>

        {/* Stats bar */}
        <div style={{
          display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap",
        }}>
          {[
            { label: "Tasks", value: tasks.length, color: "#2D8CF0" },
            { label: "Employees", value: employees.length, color: "#19B37D" },
            { label: "Total Work", value: `${totalWork}h`, color: "#F5A623" },
            { label: "Capacity/Day", value: `${totalCapacity}h`, color: "#8B5CF6" },
            ...(result ? [{ label: "Result", value: `${result.makespan.toFixed(1)}h`, color: "#E8453C" }] : []),
          ].map((s, i) => (
            <div key={i} style={{
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 8, padding: "10px 16px", flex: "1 1 0", minWidth: 100,
            }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>
                {s.label}
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 2, marginBottom: 20, background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 3 }}>
          {[
            { key: "tasks", label: `Tasks (${tasks.length})` },
            { key: "employees", label: `Employees (${employees.length})` },
          ].map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
              ...btnBase,
              flex: 1,
              background: activeTab === tab.key ? "rgba(255,255,255,0.08)" : "transparent",
              color: activeTab === tab.key ? "#E8E8E8" : "rgba(255,255,255,0.35)",
              padding: "10px 16px",
            }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tasks Tab */}
        {activeTab === "tasks" && (
          <div>
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 70px 110px 80px 36px",
              gap: 8, marginBottom: 8,
              padding: "0 4px",
            }}>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1 }}>Название</span>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1 }}>Часы</span>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1 }}>Приоритет</span>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1 }}>Прогресс</span>
              <span />
            </div>

            {tasks.map((task) => (
              <div key={task.id} style={{
                display: "grid",
                gridTemplateColumns: "1fr 70px 110px 80px 36px",
                gap: 8, marginBottom: 6, alignItems: "center",
                background: "rgba(255,255,255,0.02)", borderRadius: 8, padding: "6px 4px",
                borderLeft: `3px solid ${taskColorMap[task.id]}`,
              }}>
                <input value={task.name} onChange={(e) => updateTask(task.id, "name", e.target.value)}
                  style={inputStyle} />
                <input type="number" min={0.5} step={0.5} value={task.duration}
                  onChange={(e) => updateTask(task.id, "duration", parseFloat(e.target.value) || 0)}
                  style={inputStyle} />
                <select value={task.priority}
                  onChange={(e) => updateTask(task.id, "priority", parseInt(e.target.value))}
                  style={{ ...inputStyle, cursor: "pointer" }}>
                  <option value={4}>Critical</option>
                  <option value={3}>High</option>
                  <option value={2}>Medium</option>
                  <option value={1}>Low</option>
                </select>
                <input type="number" min={0} step={0.5} value={task.currentProgress}
                  onChange={(e) => updateTask(task.id, "currentProgress", parseFloat(e.target.value) || 0)}
                  style={inputStyle} placeholder="0" />
                <button onClick={() => removeTask(task.id)} style={{
                  background: "transparent", border: "none", color: "rgba(255,255,255,0.2)",
                  cursor: "pointer", fontSize: 18, padding: 0, lineHeight: 1,
                  transition: "color 0.2s",
                }}
                  onMouseEnter={(e) => (e.target.style.color = "#E8453C")}
                  onMouseLeave={(e) => (e.target.style.color = "rgba(255,255,255,0.2)")}>
                  ×
                </button>
              </div>
            ))}

            <button onClick={addTask} style={{
              ...btnBase, background: "rgba(255,255,255,0.04)",
              border: "1px dashed rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)",
              width: "100%", marginTop: 8,
            }}
              onMouseEnter={(e) => { e.target.style.background = "rgba(255,255,255,0.08)"; e.target.style.color = "#E8E8E8"; }}
              onMouseLeave={(e) => { e.target.style.background = "rgba(255,255,255,0.04)"; e.target.style.color = "rgba(255,255,255,0.4)"; }}>
              + Add Task
            </button>
          </div>
        )}

        {/* Employees Tab */}
        {activeTab === "employees" && (
          <div>
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 60px 60px 70px 100px 70px 36px",
              gap: 6, marginBottom: 8, padding: "0 4px",
            }}>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1 }}>Имя</span>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1 }}>С</span>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1 }}>До</span>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1 }}>Занят до</span>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1 }}>Тек. задача</span>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1 }}>Остаток</span>
              <span />
            </div>

            {employees.map((emp) => (
              <div key={emp.id} style={{
                display: "grid",
                gridTemplateColumns: "1fr 60px 60px 70px 100px 70px 36px",
                gap: 6, marginBottom: 6, alignItems: "center",
                background: "rgba(255,255,255,0.02)", borderRadius: 8, padding: "6px 4px",
                borderLeft: "3px solid #19B37D",
              }}>
                <input value={emp.name} onChange={(e) => updateEmployee(emp.id, "name", e.target.value)} style={inputStyle} />
                <input type="number" min={0} max={23} value={emp.startHour}
                  onChange={(e) => updateEmployee(emp.id, "startHour", parseInt(e.target.value) || 0)}
                  style={inputStyle} />
                <input type="number" min={1} max={24} value={emp.endHour}
                  onChange={(e) => updateEmployee(emp.id, "endHour", parseInt(e.target.value) || 0)}
                  style={inputStyle} />
                <input type="number" min={0} step={0.5} value={emp.busyUntil}
                  onChange={(e) => updateEmployee(emp.id, "busyUntil", parseFloat(e.target.value) || 0)}
                  style={inputStyle} />
                <input value={emp.currentTaskName}
                  onChange={(e) => updateEmployee(emp.id, "currentTaskName", e.target.value)}
                  style={inputStyle} placeholder="—" />
                <input type="number" min={0} step={0.5} value={emp.currentTaskRemaining}
                  onChange={(e) => updateEmployee(emp.id, "currentTaskRemaining", parseFloat(e.target.value) || 0)}
                  style={inputStyle} />
                <button onClick={() => removeEmployee(emp.id)} style={{
                  background: "transparent", border: "none", color: "rgba(255,255,255,0.2)",
                  cursor: "pointer", fontSize: 18, padding: 0, lineHeight: 1,
                  transition: "color 0.2s",
                }}
                  onMouseEnter={(e) => (e.target.style.color = "#E8453C")}
                  onMouseLeave={(e) => (e.target.style.color = "rgba(255,255,255,0.2)")}>
                  ×
                </button>
              </div>
            ))}

            <button onClick={addEmployee} style={{
              ...btnBase, background: "rgba(255,255,255,0.04)",
              border: "1px dashed rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)",
              width: "100%", marginTop: 8,
            }}
              onMouseEnter={(e) => { e.target.style.background = "rgba(255,255,255,0.08)"; e.target.style.color = "#E8E8E8"; }}
              onMouseLeave={(e) => { e.target.style.background = "rgba(255,255,255,0.04)"; e.target.style.color = "rgba(255,255,255,0.4)"; }}>
              + Добавить сотрудника
            </button>
          </div>
        )}

        {/* Solve Button */}
        <button onClick={solve} style={{
          ...btnBase,
          background: "linear-gradient(135deg, #19B37D 0%, #0D8F63 100%)",
          color: "white",
          width: "100%",
          marginTop: 24,
          padding: "14px 20px",
          fontSize: 14,
          letterSpacing: 1,
          boxShadow: "0 4px 20px rgba(25,179,125,0.25)",
        }}
          onMouseEnter={(e) => (e.target.style.boxShadow = "0 4px 30px rgba(25,179,125,0.4)")}
          onMouseLeave={(e) => (e.target.style.boxShadow = "0 4px 20px rgba(25,179,125,0.25)")}>
          ▶ CALCULATE OPTIMAL PLAN
        </button>

        {/* Results */}
        {result && showResult && (
          <div style={{ marginTop: 32 }}>
            <div style={{
              borderTop: "1px solid rgba(255,255,255,0.06)",
              paddingTop: 24,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: "50%", background: "#E8453C",
                  boxShadow: "0 0 8px rgba(232,69,60,0.5)",
                }} />
                <span style={{
                  fontSize: 13, color: "rgba(255,255,255,0.35)",
                  letterSpacing: 3, textTransform: "uppercase",
                }}>
                 Optimization Result
                </span>
              </div>

              <div style={{
                display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap",
              }}>
                <div style={{
                  background: "rgba(232,69,60,0.08)", border: "1px solid rgba(232,69,60,0.2)",
                  borderRadius: 8, padding: "12px 20px", flex: "1 1 0", minWidth: 140,
                }}>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>
                     Total Completion Time
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: "#E8453C" }}>
                    {result.makespan.toFixed(1)}ч
                  </div>
                </div>
                <div style={{
                  background: "rgba(25,179,125,0.08)", border: "1px solid rgba(25,179,125,0.2)",
                  borderRadius: 8, padding: "12px 20px", flex: "1 1 0", minWidth: 140,
                }}>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>
                    Tasks Completed
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: "#19B37D" }}>
                    {Object.values(result.taskCompletions).filter((t) => t.completed).length}/{tasks.length}
                  </div>
                </div>
                <div style={{
                  background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)",
                  borderRadius: 8, padding: "12px 20px", flex: "1 1 0", minWidth: 140,
                }}>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>
                    Context Switches
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: "#8B5CF6" }}>
                    {Math.max(0, result.schedule.length - employees.length)}
                  </div>
                </div>
              </div>

              {/* Gantt */}
              <div style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 12, padding: "16px 12px", marginBottom: 24,
              }}>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 2 }}>
                  Gantt Chart
                </div>
                <GanttChart schedule={result.schedule} employees={employees}
                  makespan={result.makespan} taskColorMap={taskColorMap} />

                {/* Legend */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12, paddingTop: 12,
                  borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  {tasks.map((t) => (
                    <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 3, background: taskColorMap[t.id] }} />
                      <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>{t.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Task completion details */}
              <div style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 12, padding: "16px 16px", marginBottom: 24,
              }}>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", marginBottom: 12, textTransform: "uppercase", letterSpacing: 2 }}>
                 Completion Order
                </div>
                {Object.entries(result.taskCompletions)
                  .sort((a, b) => (a[1].completedAt || 999) - (b[1].completedAt || 999))
                  .map(([id, info]) => {
                    const task = tasks.find((t) => t.id === parseInt(id));
                    return (
                      <div key={id} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "8px 0",
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{
                            width: 8, height: 8, borderRadius: "50%",
                            background: taskColorMap[parseInt(id)],
                          }} />
                          <span style={{ fontSize: 16, color: "#E8E8E8" }}>{info.name}</span>
                          <span style={{
                            fontSize: 12, padding: "2px 8px", borderRadius: 4,
                            background: `${PRIORITY_COLORS[task?.priority || 2]}22`,
                            color: PRIORITY_COLORS[task?.priority || 2],
                          }}>
                            {PRIORITY_LABELS[task?.priority || 2]}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                          <span style={{ fontSize: 14, color: "rgba(255,255,255,0.4)" }}>
                            {task?.duration}h of work
                          </span>
                          <span style={{
                            fontSize: 16, fontWeight: 600,
                            color: info.completed ? "#19B37D" : "#E8453C",
                          }}>
                            {info.completed ? `✓ ${info.completedAt.toFixed(1)}ч` : "✗ не завершена"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* Per-employee summary */}
              <div style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 12, padding: "16px 16px",
              }}>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", marginBottom: 12, textTransform: "uppercase", letterSpacing: 2 }}>
                 Employee Workload
                </div>
                {employees.map((emp) => {
                  const empEntries = result.schedule.filter((s) => s.empId === emp.id);
                  const totalHours = empEntries.reduce((s, e) => s + (e.end - e.start), 0);
                  const utilization = result.makespan > 0 ? (totalHours / result.makespan) * 100 : 0;
                  const uniqueTasks = [...new Set(empEntries.map((e) => e.taskName))];
                  return (
                    <div key={emp.id} style={{
                      padding: "10px 0",
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontSize: 16, fontWeight: 600, color: "#E8E8E8" }}>{emp.name}</span>
                        <span style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>
                          {totalHours.toFixed(1)}h worked · {utilization.toFixed(0)}% utilization
                        </span>
                      </div>
                      <div style={{
                        height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3,
                        overflow: "hidden", marginBottom: 6,
                      }}>
                        <div style={{
                          height: "100%", width: `${Math.min(utilization, 100)}%`,
                          background: utilization > 80 ? "#19B37D" : utilization > 50 ? "#F5A623" : "#2D8CF0",
                          borderRadius: 3, transition: "width 0.5s",
                        }} />
                      </div>
                      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>
                        Tasks: {uniqueTasks.join(", ") || "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{
          marginTop: 40, paddingTop: 16,
          borderTop: "1px solid rgba(255,255,255,0.04)",
          fontSize: 12, color: "rgba(255,255,255,0.2)",
          textAlign: "center",
        }}>
           Preemptive Priority Scheduling · High-priority tasks preempt lower-priority ones
        </div>
      </div>
    </div>
  );
}
