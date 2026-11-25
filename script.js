import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { addDoc, collection, deleteDoc, doc, getFirestore, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';
import { getTaiwanCalendarEvents, holidayCalendarSources } from './calendar-data.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

const DEFAULT_CATEGORIES = [
  { id: 'default', name: '未分類', color: '#0B4D3B', isBuiltIn: true, type: 'schedule' },
  { id: 'life', name: '生活', color: '#81D8D0', isBuiltIn: true, type: 'schedule' },
  { id: 'work', name: '工作', color: '#F6BD60', isBuiltIn: true, type: 'schedule' },
  { id: 'task', name: '待辦事項', color: '#9B7BEA', isBuiltIn: true, type: 'task' },
  { id: 'reminder', name: '提醒事項', color: '#8A8F98', isBuiltIn: true, type: 'reminder' }
];
const DEFAULT_CATEGORY = DEFAULT_CATEGORIES[0];
const now = new Date();
const formatDate = date => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};
const today = formatDate(now);
let user = null;
let userProfile = null;
let schedules = [];
let tasks = [];
let categories = DEFAULT_CATEGORIES.map(category => ({ ...category }));
let stopSchedules = null;
let stopTasks = null;
let stopCategories = null;
let stopProfile = null;
const categorySeedsInFlight = new Set();
let statusTimer = null;
let viewMonth = new Date(now.getFullYear(), now.getMonth(), 1, 12);

const selectedDate = document.getElementById('selected-date');
const scheduleModal = document.getElementById('schedule-modal');
const taskModal = document.getElementById('task-modal');
const scheduleForm = document.getElementById('schedule-form');
const taskForm = document.getElementById('task-form');
const categoriesModal = document.getElementById('categories-modal');
const categoryAddForm = document.getElementById('category-add-form');
const usernameModal = document.getElementById('username-modal');
const usernameForm = document.getElementById('username-form');
selectedDate.value = today;
scheduleForm.elements.date.value = today;
taskForm.elements.date.value = today;
renderCategoryOptions();

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function showStatus(message, kind = 'info') {
  const box = document.getElementById('app-status');
  box.textContent = message;
  box.dataset.kind = kind;
  box.hidden = false;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { box.hidden = true; }, 6500);
}

function getErrorMessage(error) {
  console.error(error);
  if (error?.code === 'permission-denied') return 'Firestore 權限未允許這筆資料，請確認已更新資料庫規則。';
  if (error?.code === 'auth/unauthorized-domain') return '目前網站網域尚未加入 Firebase Authentication 的授權網域。';
  if (error?.code === 'auth/popup-closed-by-user') return '登入視窗已關閉，尚未完成登入。';
  if (error?.code === 'auth/popup-blocked') return '瀏覽器封鎖了登入視窗，請允許彈出視窗後再試一次。';
  if (error?.code === 'auth/operation-not-allowed') return 'Firebase 尚未啟用 Google 登入服務。';
  return '操作沒有完成，請稍後再試一次。';
}

function categoryForId(id) {
  return categories.find(category => category.id === id) || (id === 'focus'
    ? { id: 'focus', name: '專注', color: DEFAULT_CATEGORY.color, type: 'schedule' }
    : DEFAULT_CATEGORY);
}

function safeCategoryColor(category) {
  return /^#[0-9a-f]{6}$/i.test(category?.color || '') ? category.color : DEFAULT_CATEGORY.color;
}

function renderCategoryOptions(selectedId = scheduleForm.elements.category.value || 'default') {
  const select = document.getElementById('schedule-category');
  const scheduleCategories = categories.filter(category => category.type === 'schedule');
  const options = scheduleCategories.map(category => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`);
  if (selectedId && !scheduleCategories.some(category => category.id === selectedId)) {
    options.push(`<option value="${escapeHtml(selectedId)}">${selectedId === 'focus' ? '專注（舊分類）' : '其他分類（墨綠）'}</option>`);
  }
  select.innerHTML = options.join('');
  select.value = selectedId && options.length ? selectedId : 'default';
  if (!select.value) select.value = 'default';
}

function renderCategoryTags() {
  const list = document.getElementById('tag-list');
  list.innerHTML = categories.filter(category => category.type === 'schedule').map(category => `<span><i class="tag-dot" style="--tag-color:${safeCategoryColor(category)}"></i>${escapeHtml(category.name)}</span>`).join('');
  document.getElementById('legend-schedule-marker').style.setProperty('--marker-color', safeCategoryColor(categoryForId('default')));
  document.getElementById('legend-task-marker').style.setProperty('--marker-color', safeCategoryColor(categoryForId('task')));
  document.getElementById('legend-reminder-marker').style.setProperty('--marker-color', safeCategoryColor(categoryForId('reminder')));
}

function renderCategoryManager() {
  const list = document.getElementById('category-list');
  if (!list) return;
  list.innerHTML = categories.map(category => `<article class="category-row" data-id="${escapeHtml(category.id)}"><div class="category-row-heading"><span class="category-swatch" style="--category-color:${safeCategoryColor(category)}"></span><span>${category.type === 'task' ? '待辦' : category.type === 'reminder' ? '提醒' : '行程'}</span>${category.isBuiltIn ? '<small>預設</small>' : '<small>自訂</small>'}</div><label>分類名稱<input name="name" value="${escapeHtml(category.name)}" maxlength="32" required></label><label class="category-color-label">顏色<input name="color" type="color" value="${safeCategoryColor(category)}" aria-label="${escapeHtml(category.name)}顏色"></label><div class="category-row-actions"><button type="button" data-action="save-category">儲存</button>${category.isBuiltIn ? '' : '<button type="button" class="danger-action" data-action="delete-category">刪除</button>'}</div></article>`).join('');
}

async function seedDefaultCategories(currentUser, missingCategories) {
  const batch = writeBatch(db);
  for (const category of missingCategories) {
    const reference = doc(db, 'users', currentUser.uid, 'categories', category.id);
    batch.set(reference, {
      uid: currentUser.uid,
      name: category.name,
      color: category.color,
      isBuiltIn: category.isBuiltIn,
      type: category.type,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }
  await batch.commit();
}

function updateProfile() {
  const signIn = document.getElementById('sign-in-button');
  const signOutButtons = [document.getElementById('sign-out-button'), document.getElementById('top-sign-out')];
  const avatar = document.getElementById('current-avatar');
  const displayName = userProfile?.name || user?.displayName || '尚未登入';
  document.getElementById('current-name').textContent = displayName;
  document.getElementById('current-email').textContent = user?.email || '登入以同步行程';
  document.getElementById('sync-label').textContent = user ? '已連線同步' : '尚未登入';
  document.getElementById('edit-username').hidden = !user;
  signIn.hidden = Boolean(user);
  signOutButtons.forEach(button => { button.hidden = !user; });
  if (user?.photoURL) {
    avatar.textContent = '';
    avatar.style.backgroundImage = `url("${user.photoURL.replace(/["\\]/g, '')}")`;
    avatar.classList.add('photo-avatar');
  } else {
    avatar.style.backgroundImage = '';
    avatar.classList.remove('photo-avatar');
    avatar.textContent = displayName.trim()?.[0] || '日';
  }
  const hour = new Date().getHours();
  const greeting = hour < 11 ? '早安' : hour < 18 ? '午安' : '晚安';
  const greetingName = userProfile?.name || user?.displayName?.split(/\s+/)[0] || '朋友';
  document.getElementById('welcome-title').innerHTML = `${user ? `${greeting}，${escapeHtml(greetingName)}` : '安排今天，從容開始'} <span class="wave">✳</span>`;
}

function openModal(modal, form, title, item = null) {
  form.reset();
  form.elements.id.value = item?.id || '';
  form.elements.title.value = item?.title || '';
  form.elements.date.value = item?.date || selectedDate.value || today;
  if (form === scheduleForm) {
    form.elements.time.value = item?.time || '15:00';
    form.elements.endTime.value = item?.endTime || '16:00';
    form.elements.location.value = item?.location || '';
    renderCategoryOptions(item?.category || 'default');
    form.elements.category.value = item?.category || 'default';
  } else {
    form.elements.kind.value = item?.kind || 'task';
    form.elements.time.value = item?.time || '15:00';
    form.elements.priority.value = item?.priority || '一般';
    form.elements.reminderEnabled.checked = item ? Boolean(item.reminderEnabled) : true;
  }
  document.getElementById(title).textContent = item ? (form === scheduleForm ? '編輯行程' : '編輯事項') : (form === scheduleForm ? '安排一個新行程' : '新增待辦／提醒');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  form.elements.title.focus();
}

function closeModal(modal) {
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}

function eventsForDate(date) {
  const civic = getTaiwanCalendarEvents(date);
  const personal = [
    ...schedules.filter(item => item.date === date).map(item => ({ name: item.title, kind: 'schedule', time: item.time, category: item.category })),
    ...tasks.filter(item => item.date === date).map(item => ({ name: item.title, kind: item.kind === 'reminder' ? 'reminder' : 'task', time: item.time, completed: item.completed }))
  ];
  return [...civic, ...personal];
}

function eventColor(event) {
  return safeCategoryColor(categoryForId(event.kind === 'schedule' ? event.category : event.kind));
}

function renderCalendar() {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  document.getElementById('calendar-month-title').textContent = `${year} 年 ${month + 1} 月`;
  const firstDay = new Date(year, month, 1, 12);
  const offset = firstDay.getDay();
  const grid = document.getElementById('calendar-grid');
  grid.innerHTML = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(year, month, index - offset + 1, 12);
    const dateKey = formatDate(date);
    const events = eventsForDate(dateKey);
    const isOtherMonth = date.getMonth() !== month;
    const holiday = events.find(event => event.kind === 'holiday');
    const markers = [
      events.some(event => event.kind === 'holiday') ? '<i class="calendar-marker holiday-dot"></i>' : '',
      events.some(event => event.kind === 'festival') ? '<i class="calendar-marker festival-dot"></i>' : '',
      [...new Set(events.filter(event => ['schedule', 'task', 'reminder'].includes(event.kind)).map(eventColor))].slice(0, 5).map(color => `<i class="calendar-marker personal-dot" style="--marker-color:${color}"></i>`).join('')
    ].join('');
    const classes = ['calendar-day', isOtherMonth ? 'other-month' : '', dateKey === selectedDate.value ? 'selected' : '', dateKey === today ? 'is-today' : '', holiday ? 'has-holiday' : ''].filter(Boolean).join(' ');
    const aria = `${dateKey}${events.length ? `：${events.map(event => event.name).join('、')}` : ''}`;
    return `<button type="button" class="${classes}" data-calendar-date="${dateKey}" role="gridcell" aria-label="${escapeHtml(aria)}" aria-pressed="${dateKey === selectedDate.value}"><span class="calendar-day-number">${date.getDate()}</span>${holiday ? `<span class="calendar-day-label">${escapeHtml(holiday.name)}</span>` : '<span class="calendar-day-label"></span>'}<span class="calendar-markers">${markers}</span></button>`;
  }).join('');
  renderCalendarDayPanel();
}

function renderCalendarDayPanel() {
  const date = selectedDate.value || today;
  const parsed = new Date(`${date}T12:00:00`);
  const dayText = new Intl.DateTimeFormat('zh-TW', { month: 'long', day: 'numeric', weekday: 'long' }).format(parsed);
  document.getElementById('calendar-selected-date').textContent = dayText;
  const events = eventsForDate(date);
  const civic = events.filter(event => event.kind === 'holiday' || event.kind === 'festival');
  const personal = events.filter(event => ['schedule', 'task', 'reminder'].includes(event.kind));
  document.getElementById('calendar-holidays').innerHTML = civic.length ? civic.map(event => `<div class="calendar-special ${event.kind}"><span>${event.kind === 'holiday' ? '放假' : '節日'}</span>${escapeHtml(event.name)}</div>`).join('') : '<p class="calendar-empty-note">今天沒有國定假日或節日</p>';
  document.getElementById('calendar-day-events').innerHTML = personal.length ? personal.sort((a, b) => String(a.time || '').localeCompare(String(b.time || ''))).map(event => `<div class="calendar-event-row ${event.completed ? 'completed' : ''}" style="--event-color:${eventColor(event)}"><span class="calendar-event-time">${escapeHtml(event.time || '全天')}</span><span class="calendar-event-name">${event.kind === 'reminder' ? '提醒' : event.kind === 'task' ? '待辦' : escapeHtml(categoryForId(event.category).name)}・${escapeHtml(event.name)}</span></div>`).join('') : '<p class="calendar-empty-note">尚無個人安排</p>';
}

function renderSchedules() {
  const date = selectedDate.value || today;
  const items = schedules.filter(item => item.date === date).sort((a, b) => a.time.localeCompare(b.time));
  document.getElementById('schedule-date-label').textContent = date === today ? '今日行程' : `${date.slice(5).replace('-', ' / ')} 行程`;
  const list = document.getElementById('schedule-list');
  list.innerHTML = items.length ? items.map(item => {
    const category = categoryForId(item.category);
    const color = safeCategoryColor(category);
    return `<article class="schedule-item"><div class="schedule-time">${escapeHtml(item.time)}<small>至 ${escapeHtml(item.endTime)}</small></div><i class="timeline-node" style="--category-color:${color}"></i><div class="event-card"><div class="event-title"><span>${escapeHtml(item.title)}</span><span class="event-category" style="--category-color:${color}">${escapeHtml(category.name)}</span></div><div class="event-meta"><span>${escapeHtml(item.location || '尚未新增備註')}</span><span>${escapeHtml(item.time)} — ${escapeHtml(item.endTime)}</span></div><div class="item-actions"><button type="button" data-action="edit-schedule" data-id="${escapeHtml(item.id)}">編輯</button><button type="button" class="danger-action" data-action="delete-schedule" data-id="${escapeHtml(item.id)}">刪除</button></div></div></article>`;
  }).join('') : `<p class="empty-state">${user ? '這天還沒有行程，新增一個開始安排吧。' : '登入後即可建立並同步你的行程。'}</p>`;
  document.getElementById('schedule-total').textContent = items.length;
  document.getElementById('schedule-count').textContent = String(items.length).padStart(2, '0');
  document.getElementById('focus-total').textContent = items.filter(item => !['default', 'life', 'work'].includes(item.category)).length;
}

function renderTasks() {
  const date = selectedDate.value || today;
  const items = tasks.filter(task => task.date === date).sort((a, b) => Number(a.completed) - Number(b.completed) || String(a.time || '').localeCompare(String(b.time || '')) || Number(b.priority === '高優先') - Number(a.priority === '高優先'));
  const list = document.getElementById('task-list');
  document.querySelector('#tasks h2').firstChild.textContent = date === today ? '今日待辦與提醒 ' : `${date.slice(5).replace('-', ' / ')} 待辦與提醒 `;
  list.innerHTML = items.length ? items.map(task => `<article class="task-item ${task.completed ? 'done' : ''}"><input class="task-check" type="checkbox" aria-label="完成${escapeHtml(task.title)}" data-action="toggle-task" data-id="${escapeHtml(task.id)}" ${task.completed ? 'checked' : ''}><div class="task-copy"><div class="task-title"><span>${escapeHtml(task.title)}</span><span class="task-time">${escapeHtml(task.time || '未設定時間')}</span></div><div class="task-meta"><span class="task-status ${task.completed ? 'done-status' : task.kind === 'reminder' ? 'reminder-status' : 'in-progress'}">${task.completed ? '已完成' : task.kind === 'reminder' ? '提醒' : '待辦'}</span><span class="task-priority ${task.priority === '高優先' ? 'high' : ''}">⚑ ${escapeHtml(task.priority || '一般')}</span>${task.reminderEnabled && !task.completed ? '<span class="reminder-badge">🔔 已設提醒</span>' : ''}<span class="task-inline-actions"><button type="button" data-action="edit-task" data-id="${escapeHtml(task.id)}">編輯</button><button type="button" class="danger-action" data-action="delete-task" data-id="${escapeHtml(task.id)}">刪除</button></span></div></div></article>`).join('') : `<p class="empty-state">${user ? '目前沒有待辦或提醒，享受空檔吧！' : '登入後即可建立自己的待辦清單。'}</p>`;
  const completed = items.filter(task => task.completed).length;
  const remaining = items.length - completed;
  const percent = items.length ? Math.round(completed / items.length * 100) : 0;
  document.getElementById('task-total').textContent = remaining;
  document.getElementById('task-heading-count').textContent = String(items.length).padStart(2, '0');
  document.getElementById('sidebar-task-count').textContent = String(remaining).padStart(2, '0');
  document.getElementById('task-progress').style.width = `${percent}%`;
  document.getElementById('task-progress-label').textContent = `${date === today ? '今日' : '所選日期'}完成度 ${percent}%`;
}

function render() {
  const weekday = new Intl.DateTimeFormat('zh-TW', { weekday: 'long' }).format(now);
  document.getElementById('today-date').textContent = `${weekday}，${now.getFullYear()} 年 ${now.getMonth() + 1} 月 ${now.getDate()} 日`;
  renderCalendar();
  renderSchedules();
  renderTasks();
}

function subscribeToUserData(currentUser) {
  stopSchedules?.();
  stopTasks?.();
  stopCategories?.();
  schedules = [];
  tasks = [];
  categories = DEFAULT_CATEGORIES.map(category => ({ ...category }));
  const scheduleRef = collection(db, 'users', currentUser.uid, 'schedules');
  const taskRef = collection(db, 'users', currentUser.uid, 'tasks');
  const categoryRef = collection(db, 'users', currentUser.uid, 'categories');
  stopSchedules = onSnapshot(query(scheduleRef, where('uid', '==', currentUser.uid)), snapshot => {
    schedules = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    render();
  }, error => showStatus(getErrorMessage(error), 'error'));
  stopTasks = onSnapshot(query(taskRef, where('uid', '==', currentUser.uid)), snapshot => {
    tasks = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    render();
  }, error => showStatus(getErrorMessage(error), 'error'));
  stopCategories = onSnapshot(query(categoryRef, where('uid', '==', currentUser.uid)), snapshot => {
    const savedCategories = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    const savedById = new Map(savedCategories.map(category => [category.id, category]));
    categories = [
      ...DEFAULT_CATEGORIES.map(category => ({ ...category, ...(savedById.get(category.id) || {}), id: category.id, isBuiltIn: true, type: category.type })),
      ...savedCategories.filter(category => !DEFAULT_CATEGORIES.some(defaultCategory => defaultCategory.id === category.id))
    ];
    renderCategoryOptions(scheduleForm.elements.category.value || 'default');
    renderCategoryTags();
    renderCategoryManager();
    render();
    const missingCategories = DEFAULT_CATEGORIES.filter(category => !savedById.has(category.id));
    if (missingCategories.length && !categorySeedsInFlight.has(currentUser.uid)) {
      categorySeedsInFlight.add(currentUser.uid);
      seedDefaultCategories(currentUser, missingCategories)
        .catch(error => showStatus(getErrorMessage(error), 'error'))
        .finally(() => categorySeedsInFlight.delete(currentUser.uid));
    }
  }, error => showStatus(getErrorMessage(error), 'error'));
}

function subscribeToUserProfile(currentUser) {
  stopProfile?.();
  userProfile = null;
  updateProfile();
  const profileRef = collection(db, 'users', currentUser.uid, 'profiles');
  stopProfile = onSnapshot(query(profileRef, where('uid', '==', currentUser.uid)), snapshot => {
    const profile = snapshot.docs[0]?.data() || null;
    userProfile = profile;
    updateProfile();
    if (!profile?.name && !sessionStorage.getItem(`username-prompt:${currentUser.uid}`)) {
      sessionStorage.setItem(`username-prompt:${currentUser.uid}`, 'shown');
      usernameForm.elements.name.value = currentUser.displayName?.trim().slice(0, 24) || '';
      usernameModal.classList.add('open');
      usernameModal.setAttribute('aria-hidden', 'false');
      usernameForm.elements.name.focus();
    }
  }, error => showStatus(getErrorMessage(error), 'error'));
}

async function saveUsername(name) {
  const normalizedName = String(name || '').trim();
  if (!user || !normalizedName || normalizedName.length > 24) return;
  try {
    await setDoc(doc(db, 'users', user.uid, 'profiles', 'main'), {
      uid: user.uid,
      name: normalizedName,
      createdAt: userProfile?.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    userProfile = { ...(userProfile || {}), name: normalizedName };
    updateProfile();
    closeModal(usernameModal);
    showStatus(`用戶名已設定為「${normalizedName}」。`);
  } catch (error) { showStatus(getErrorMessage(error), 'error'); }
}

function notificationKey(task) {
  return `daybook-reminder:${user?.uid}:${task.id}:${task.date}:${task.time}`;
}

function checkDueReminders() {
  if (!user || !('Notification' in window) || Notification.permission !== 'granted') return;
  const nowMs = Date.now();
  for (const task of tasks) {
    if (!task.reminderEnabled || task.completed || !task.date || !task.time) continue;
    const dueAt = new Date(`${task.date}T${task.time}:00`).getTime();
    const key = notificationKey(task);
    if (nowMs >= dueAt && nowMs - dueAt < 24 * 60 * 60_000 && !localStorage.getItem(key)) {
      try {
        const notification = new Notification(task.kind === 'reminder' ? '提醒事項' : '待辦事項', {
          body: `${task.time}・${task.title}`,
          tag: key
        });
        notification.onclick = () => { window.focus(); notification.close(); };
        localStorage.setItem(key, 'sent');
      } catch (error) {
        console.warn('無法顯示桌面通知。', error);
      }
    }
  }
}

document.getElementById('sign-in-button').addEventListener('click', async () => {
  try { await signInWithPopup(auth, provider); }
  catch (error) { showStatus(getErrorMessage(error), 'error'); }
});
async function handleSignOut() {
  if (!confirm('確定要登出行程管理系統嗎？未儲存的內容不會保留。')) return;
  try { await signOut(auth); showStatus('已安全登出。'); }
  catch (error) { showStatus(getErrorMessage(error), 'error'); }
}
document.getElementById('sign-out-button').addEventListener('click', handleSignOut);
document.getElementById('top-sign-out').addEventListener('click', handleSignOut);
document.getElementById('edit-username').addEventListener('click', () => {
  if (!user) return;
  usernameForm.elements.name.value = userProfile?.name || user.displayName || '';
  usernameModal.classList.add('open');
  usernameModal.setAttribute('aria-hidden', 'false');
  usernameForm.elements.name.focus();
});
document.getElementById('close-username-modal').addEventListener('click', () => closeModal(usernameModal));
document.getElementById('skip-username').addEventListener('click', () => closeModal(usernameModal));
usernameModal.addEventListener('click', event => { if (event.target === usernameModal) closeModal(usernameModal); });
usernameForm.addEventListener('submit', async event => {
  event.preventDefault();
  await saveUsername(new FormData(usernameForm).get('name'));
});
onAuthStateChanged(auth, currentUser => {
  user = currentUser;
  if (currentUser) subscribeToUserProfile(currentUser);
  else { stopProfile?.(); stopProfile = null; userProfile = null; }
  updateProfile();
  if (user) subscribeToUserData(user);
  else {
    stopSchedules?.(); stopTasks?.(); stopCategories?.();
    schedules = []; tasks = [];
    categories = DEFAULT_CATEGORIES.map(category => ({ ...category }));
    renderCategoryOptions(); renderCategoryTags(); renderCategoryManager();
  }
  render();
});

document.getElementById('open-schedule').addEventListener('click', () => openModal(scheduleModal, scheduleForm, 'schedule-modal-title'));
const openTask = item => openModal(taskModal, taskForm, 'task-modal-title', item);
document.getElementById('add-task').addEventListener('click', () => openTask());
document.getElementById('add-task-row').addEventListener('click', () => openTask());
document.getElementById('calendar-add-task').addEventListener('click', () => openTask());
document.getElementById('calendar-add-schedule').addEventListener('click', () => openModal(scheduleModal, scheduleForm, 'schedule-modal-title'));
document.getElementById('close-schedule-modal').addEventListener('click', () => closeModal(scheduleModal));
document.getElementById('close-task-modal').addEventListener('click', () => closeModal(taskModal));
document.getElementById('manage-categories').addEventListener('click', () => {
  if (!user) { showStatus('請先使用 Google 登入，才能管理自己的分類。', 'error'); return; }
  renderCategoryManager();
  categoriesModal.classList.add('open');
  categoriesModal.setAttribute('aria-hidden', 'false');
});
document.getElementById('close-categories-modal').addEventListener('click', () => closeModal(categoriesModal));
for (const modal of [scheduleModal, taskModal, categoriesModal]) {
  modal.addEventListener('click', event => { if (event.target === modal) closeModal(modal); });
}
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { closeModal(scheduleModal); closeModal(taskModal); closeModal(categoriesModal); }
});

categoryAddForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!user) return;
  const formData = new FormData(categoryAddForm);
  const name = String(formData.get('name') || '').trim();
  const color = String(formData.get('color') || '');
  if (!name) return;
  if (categories.some(category => category.type === 'schedule' && category.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    showStatus('已有相同名稱的行程分類。', 'error'); return;
  }
  try {
    await addDoc(collection(db, 'users', user.uid, 'categories'), {
      uid: user.uid, name, color, type: 'schedule', isBuiltIn: false,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
    categoryAddForm.reset();
    showStatus(`已新增「${name}」分類。`);
  } catch (error) { showStatus(getErrorMessage(error), 'error'); }
});

document.getElementById('category-list').addEventListener('click', async event => {
  const button = event.target.closest('button[data-action]');
  if (!button || !user) return;
  const row = button.closest('.category-row');
  const category = categories.find(item => item.id === row?.dataset.id);
  if (!row || !category) return;
  if (button.dataset.action === 'save-category') {
    const name = String(row.querySelector('input[name="name"]').value || '').trim();
    const color = String(row.querySelector('input[name="color"]').value || '');
    if (!name) { showStatus('分類名稱不能空白。', 'error'); return; }
    if (categories.some(item => item.id !== category.id && item.type === category.type && item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      showStatus('已有相同名稱的分類。', 'error'); return;
    }
    try {
      await updateDoc(doc(db, 'users', user.uid, 'categories', category.id), { name, color, updatedAt: serverTimestamp() });
      showStatus(`「${name}」分類已更新。`);
    } catch (error) { showStatus(getErrorMessage(error), 'error'); }
  }
  if (button.dataset.action === 'delete-category' && !category.isBuiltIn && confirm(`刪除「${category.name}」分類？既有行程會改以墨綠色未分類顯示。`)) {
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'categories', category.id));
      showStatus(`「${category.name}」分類已刪除。`);
    } catch (error) { showStatus(getErrorMessage(error), 'error'); }
  }
});

scheduleForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!user) { showStatus('請先使用 Google 登入，才能儲存行程。', 'error'); return; }
  const data = new FormData(scheduleForm);
  const time = String(data.get('time'));
  const endTime = String(data.get('endTime'));
  if (endTime <= time) { showStatus('結束時間需要晚於開始時間。', 'error'); return; }
  const payload = {
    uid: user.uid,
    title: String(data.get('title')).trim(),
    date: String(data.get('date')),
    time,
    endTime,
    location: String(data.get('location') || '').trim(),
    category: String(data.get('category')),
    updatedAt: serverTimestamp()
  };
  const submitButton = scheduleForm.querySelector('[type="submit"]');
  const originalSubmitLabel = submitButton.innerHTML;
  submitButton.disabled = true;
  submitButton.textContent = '儲存中…';
  try {
    const id = String(data.get('id') || '');
    if (id) await updateDoc(doc(db, 'users', user.uid, 'schedules', id), payload);
    else await addDoc(collection(db, 'users', user.uid, 'schedules'), { ...payload, createdAt: serverTimestamp() });
    closeModal(scheduleModal);
    showStatus(id ? '行程已更新。' : '行程已新增，已加入月曆。');
  } catch (error) { showStatus(getErrorMessage(error), 'error'); }
  finally {
    submitButton.disabled = false;
    submitButton.innerHTML = originalSubmitLabel;
  }
});

taskForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!user) { showStatus('請先使用 Google 登入，才能儲存事項。', 'error'); return; }
  const data = new FormData(taskForm);
  const reminderEnabled = data.get('reminderEnabled') === 'yes';
  if (reminderEnabled && 'Notification' in window && Notification.permission === 'default') {
    try { await Notification.requestPermission(); } catch { /* The item is still saved if notifications are unavailable. */ }
  }
  const payload = {
    uid: user.uid,
    title: String(data.get('title')).trim(),
    date: String(data.get('date')),
    time: String(data.get('time')),
    kind: String(data.get('kind')),
    priority: String(data.get('priority')),
    reminderEnabled,
    completed: false,
    updatedAt: serverTimestamp()
  };
  try {
    const id = String(data.get('id') || '');
    if (id) {
      const existing = tasks.find(task => task.id === id);
      await updateDoc(doc(db, 'users', user.uid, 'tasks', id), { ...payload, completed: Boolean(existing?.completed) });
      localStorage.removeItem(notificationKey({ ...payload, id }));
    } else await addDoc(collection(db, 'users', user.uid, 'tasks'), { ...payload, createdAt: serverTimestamp() });
    closeModal(taskModal);
    if (reminderEnabled && (!('Notification' in window) || Notification.permission !== 'granted')) {
      showStatus('事項已儲存；請允許瀏覽器與 Windows 桌面通知，時間到才會在右下角提醒。');
    } else showStatus(id ? '事項已更新。' : '事項已新增。');
  } catch (error) { showStatus(getErrorMessage(error), 'error'); }
});

document.getElementById('schedule-list').addEventListener('click', async event => {
  const button = event.target.closest('button[data-action]');
  if (!button || !user) return;
  const item = schedules.find(entry => entry.id === button.dataset.id);
  if (!item) return;
  if (button.dataset.action === 'edit-schedule') openModal(scheduleModal, scheduleForm, 'schedule-modal-title', item);
  if (button.dataset.action === 'delete-schedule' && confirm(`要刪除「${item.title}」這個行程嗎？`)) {
    try { await deleteDoc(doc(db, 'users', user.uid, 'schedules', item.id)); showStatus('行程已刪除。'); }
    catch (error) { showStatus(getErrorMessage(error), 'error'); }
  }
});

document.getElementById('task-list').addEventListener('change', async event => {
  const input = event.target.closest('input[data-action="toggle-task"]');
  if (!input || !user) return;
  try { await updateDoc(doc(db, 'users', user.uid, 'tasks', input.dataset.id), { completed: input.checked, updatedAt: serverTimestamp() }); }
  catch (error) { showStatus(getErrorMessage(error), 'error'); }
});
document.getElementById('task-list').addEventListener('click', async event => {
  const button = event.target.closest('button[data-action]');
  if (!button || !user) return;
  const task = tasks.find(entry => entry.id === button.dataset.id);
  if (!task) return;
  if (button.dataset.action === 'edit-task') openTask(task);
  if (button.dataset.action === 'delete-task' && confirm(`要刪除「${task.title}」這件事項嗎？`)) {
    try { await deleteDoc(doc(db, 'users', user.uid, 'tasks', task.id)); showStatus('事項已刪除。'); }
    catch (error) { showStatus(getErrorMessage(error), 'error'); }
  }
});

document.getElementById('calendar-grid').addEventListener('click', event => {
  const button = event.target.closest('button[data-calendar-date]');
  if (!button) return;
  selectedDate.value = button.dataset.calendarDate;
  viewMonth = new Date(`${selectedDate.value}T12:00:00`);
  render();
});
document.getElementById('calendar-prev').addEventListener('click', () => { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1, 12); renderCalendar(); });
document.getElementById('calendar-next').addEventListener('click', () => { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1, 12); renderCalendar(); });
document.getElementById('calendar-today').addEventListener('click', () => { selectedDate.value = today; viewMonth = new Date(now.getFullYear(), now.getMonth(), 1, 12); render(); });
selectedDate.addEventListener('change', () => {
  if (!selectedDate.value) return;
  viewMonth = new Date(`${selectedDate.value}T12:00:00`);
  render();
});
document.querySelectorAll('.nav-item[data-section]').forEach(link => link.addEventListener('click', () => {
  document.querySelectorAll('.nav-item[data-section]').forEach(item => item.classList.toggle('active', item === link));
}));

document.getElementById('calendar-source-2026').href = holidayCalendarSources[2026];
document.getElementById('calendar-source-2027').href = holidayCalendarSources[2027];
setInterval(checkDueReminders, 30_000);
render();
