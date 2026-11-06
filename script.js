const initialSchedules = [
  { time: '09:30', endTime: '10:30', title: '每週產品設計會議', location: '線上會議・同步本週設計進度', category: 'work' },
  { time: '12:00', endTime: '13:00', title: '午餐與放鬆時間', location: '巷口日式食堂・好好吃頓飯', category: 'life' },
  { time: '14:30', endTime: '15:30', title: '專注時段：提案簡報', location: '關閉通知，留給自己一小時', category: 'focus' }
];
const initialTasks = [
  { title: '完成品牌提案初稿', time: '今天 17:00 前', status: '進行中', priority: '高優先', done: false },
  { title: '回覆客戶的設計回饋', time: '今天', status: '待開始', priority: '一般', done: false },
  { title: '整理下週的靈感素材', time: '今天', status: '待開始', priority: '一般', done: false }
];
const categoryNames = { work: '工作', life: '生活', focus: '專注' };
let schedules = load('daybook-schedules', initialSchedules);
let tasks = load('daybook-tasks', initialTasks);
function load(key, fallback) { try { const saved = localStorage.getItem(key); return saved ? JSON.parse(saved) : fallback.map(item => ({ ...item })); } catch { return fallback.map(item => ({ ...item })); } }
function persist() { localStorage.setItem('daybook-schedules', JSON.stringify(schedules)); localStorage.setItem('daybook-tasks', JSON.stringify(tasks)); }
const dateElement = document.getElementById('today-date');
const dateNow = new Date();
const weekday = new Intl.DateTimeFormat('zh-TW', { weekday: 'long' }).format(dateNow);
dateElement.textContent = `${weekday}，${dateNow.getFullYear()} 年 ${dateNow.getMonth() + 1} 月 ${dateNow.getDate()} 日`;
function renderSchedules() {
  schedules.sort((a, b) => a.time.localeCompare(b.time));
  document.getElementById('schedule-list').innerHTML = schedules.length ? schedules.map(item => `<article class="schedule-item"><div class="schedule-time">${escapeHtml(item.time)}<small>至 ${escapeHtml(item.endTime)}</small></div><i class="timeline-node"></i><div class="event-card"><div class="event-title">${escapeHtml(item.title)}<span class="event-category ${item.category}">${categoryNames[item.category] || '工作'}</span></div><div class="event-meta"><span>${escapeHtml(item.location || '尚未新增備註')}</span><span>${escapeHtml(item.time)} — ${escapeHtml(item.endTime)}</span></div></div></article>`).join('') : '<p class="empty-state">今天還沒有行程，新增一個開始安排吧。</p>';
  document.getElementById('schedule-total').textContent = schedules.length;
  document.getElementById('schedule-count').textContent = String(schedules.length).padStart(2, '0');
}
function renderTasks() {
  document.getElementById('task-list').innerHTML = tasks.length ? tasks.map((task, index) => `<article class="task-item ${task.done ? 'done' : ''}"><input class="task-check" type="checkbox" aria-label="完成${escapeHtml(task.title)}" data-task="${index}" ${task.done ? 'checked' : ''}><div class="task-copy"><div class="task-title"><span>${escapeHtml(task.title)}</span><span class="task-time">${escapeHtml(task.time)}</span></div><div class="task-meta"><span class="task-status ${task.done ? 'done-status' : task.status === '進行中' ? 'in-progress' : ''}">${task.done ? '已完成' : escapeHtml(task.status)}</span><span class="task-priority ${task.priority === '高優先' ? 'high' : ''}">⚑ ${escapeHtml(task.priority)}</span></div></div></article>`).join('') : '<p class="empty-state">目前沒有待辦事項，享受空檔吧！</p>';
  const completed = tasks.filter(task => task.done).length;
  const remaining = tasks.length - completed;
  const percent = tasks.length ? Math.round(completed / tasks.length * 100) : 100;
  document.getElementById('task-total').textContent = remaining;
  document.getElementById('task-heading-count').textContent = String(tasks.length).padStart(2, '0');
  document.getElementById('sidebar-task-count').textContent = String(remaining).padStart(2, '0');
  document.getElementById('task-progress').style.width = `${percent}%`;
  document.getElementById('task-progress-label').textContent = `今日完成度 ${percent}%`;
  document.querySelectorAll('.task-check').forEach(box => box.addEventListener('change', event => { tasks[Number(event.target.dataset.task)].done = event.target.checked; persist(); renderTasks(); }));
}
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
renderSchedules(); renderTasks();
const modal = document.getElementById('schedule-modal');
function closeModal() { modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); }
document.getElementById('open-schedule').addEventListener('click', () => { modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false'); modal.querySelector('input[name="title"]').focus(); });
document.getElementById('close-modal').addEventListener('click', closeModal);
modal.addEventListener('click', event => { if (event.target === modal) closeModal(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeModal(); });
document.getElementById('schedule-form').addEventListener('submit', event => {
  event.preventDefault(); const data = new FormData(event.currentTarget); const time = data.get('time'); const endTime = data.get('endTime');
  if (endTime <= time) { alert('結束時間需要晚於開始時間喔！'); return; }
  schedules.push({ title: data.get('title').trim(), time, endTime, location: data.get('location').trim(), category: data.get('category') }); persist(); renderSchedules(); event.currentTarget.reset(); closeModal();
});
function addTask() { const title = prompt('想新增什麼待辦事項？'); if (!title || !title.trim()) return; tasks.push({ title: title.trim(), time: '今天', status: '待開始', priority: '一般', done: false }); persist(); renderTasks(); }
document.getElementById('add-task').addEventListener('click', addTask);
document.getElementById('add-task-row').addEventListener('click', addTask);
document.getElementById('view-schedule').addEventListener('click', () => document.getElementById('schedule-list').scrollIntoView({ behavior: 'smooth', block: 'center' }));

