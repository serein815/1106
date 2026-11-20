import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { addDoc, collection, deleteDoc, doc, getFirestore, onSnapshot, query, serverTimestamp, updateDoc, where } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

const categoryNames = { work: '工作', life: '生活', focus: '專注' };
const now = new Date();
const localDate = date => {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 10);
};
const today = localDate(now);
let user = null;
let schedules = [];
let tasks = [];
let stopSchedules = null;
let stopTasks = null;
let statusTimer = null;

const selectedDate = document.getElementById('selected-date');
const scheduleModal = document.getElementById('schedule-modal');
const taskModal = document.getElementById('task-modal');
const scheduleForm = document.getElementById('schedule-form');
const taskForm = document.getElementById('task-form');
selectedDate.value = today;
scheduleForm.elements.date.value = today;
taskForm.elements.date.value = today;

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
  if (error?.code === 'permission-denied') return 'Firestore 權限尚未設定完成，請確認已發佈資料庫規則。';
  if (error?.code === 'auth/unauthorized-domain') return '目前網站網域尚未加入 Firebase Authentication 的授權網域。';
  if (error?.code === 'auth/popup-closed-by-user') return '登入視窗已關閉，尚未完成登入。';
  if (error?.code === 'auth/popup-blocked') return '瀏覽器封鎖了登入視窗，請允許彈出視窗後再試一次。';
  if (error?.code === 'auth/operation-not-allowed') return 'Firebase 尚未啟用 Google 登入服務。';
  return '操作沒有完成，請稍後再試一次。';
}

function updateProfile() {
  const signIn = document.getElementById('sign-in-button');
  const signOutButtons = [document.getElementById('sign-out-button'), document.getElementById('top-sign-out')];
  const avatar = document.getElementById('current-avatar');
  document.getElementById('current-name').textContent = user?.displayName || '尚未登入';
  document.getElementById('current-email').textContent = user?.email || '登入以同步行程';
  document.getElementById('sync-label').textContent = user ? '已連線同步' : '尚未登入';
  signIn.hidden = Boolean(user);
  signOutButtons.forEach(button => { button.hidden = !user; });
  if (user?.photoURL) {
    avatar.textContent = '';
    avatar.style.backgroundImage = `url("${user.photoURL.replace(/["\\]/g, '')}")`;
    avatar.classList.add('photo-avatar');
  } else {
    avatar.style.backgroundImage = '';
    avatar.classList.remove('photo-avatar');
    avatar.textContent = user?.displayName?.trim()?.[0] || '日';
  }
  const hour = new Date().getHours();
  const greeting = hour < 11 ? '早安' : hour < 18 ? '午安' : '晚安';
  document.getElementById('welcome-title').innerHTML = `${user ? `${greeting}，${escapeHtml(user.displayName?.split(/\s+/)[0] || '朋友')}` : '安排今天，從容開始'} <span class="wave">✳</span>`;
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
    form.elements.category.value = item?.category || 'work';
  } else {
    form.elements.priority.value = item?.priority || '一般';
  }
  document.getElementById(title).textContent = item ? (form === scheduleForm ? '編輯行程' : '編輯待辦') : (form === scheduleForm ? '安排一個新行程' : '新增待辦');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  form.elements.title.focus();
}

function closeModal(modal) {
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}

function renderSchedules() {
  const date = selectedDate.value || today;
  const items = schedules.filter(item => item.date === date).sort((a, b) => a.time.localeCompare(b.time));
  document.getElementById('schedule-date-label').textContent = date === today ? '今日行程' : `${date.slice(5).replace('-', ' / ')} 行程`;
  const list = document.getElementById('schedule-list');
  list.innerHTML = items.length ? items.map(item => `<article class="schedule-item"><div class="schedule-time">${escapeHtml(item.time)}<small>至 ${escapeHtml(item.endTime)}</small></div><i class="timeline-node"></i><div class="event-card"><div class="event-title"><span>${escapeHtml(item.title)}</span><span class="event-category ${escapeHtml(item.category)}">${categoryNames[item.category] || '工作'}</span></div><div class="event-meta"><span>${escapeHtml(item.location || '尚未新增備註')}</span><span>${escapeHtml(item.time)} — ${escapeHtml(item.endTime)}</span></div><div class="item-actions"><button type="button" data-action="edit-schedule" data-id="${escapeHtml(item.id)}">編輯</button><button type="button" class="danger-action" data-action="delete-schedule" data-id="${escapeHtml(item.id)}">刪除</button></div></div></article>`).join('') : `<p class="empty-state">${user ? '這天還沒有行程，新增一個開始安排吧。' : '登入後即可建立並同步你的行程。'}</p>`;
  document.getElementById('schedule-total').textContent = items.length;
  document.getElementById('schedule-count').textContent = String(items.length).padStart(2, '0');
  document.getElementById('focus-total').textContent = items.filter(item => item.category === 'focus').length;
}

function renderTasks() {
  const date = selectedDate.value || today;
  const items = tasks.filter(task => task.date === date).sort((a, b) => Number(a.completed) - Number(b.completed) || Number(b.priority === '高優先') - Number(a.priority === '高優先'));
  const list = document.getElementById('task-list');
  document.querySelector('#tasks h2').firstChild.textContent = date === today ? '今日待辦 ' : `${date.slice(5).replace('-', ' / ')} 待辦 `;
  list.innerHTML = items.length ? items.map(task => `<article class="task-item ${task.completed ? 'done' : ''}"><input class="task-check" type="checkbox" aria-label="完成${escapeHtml(task.title)}" data-action="toggle-task" data-id="${escapeHtml(task.id)}" ${task.completed ? 'checked' : ''}><div class="task-copy"><div class="task-title"><span>${escapeHtml(task.title)}</span><span class="task-time">${task.date === today ? '今天' : escapeHtml(task.date)}</span></div><div class="task-meta"><span class="task-status ${task.completed ? 'done-status' : 'in-progress'}">${task.completed ? '已完成' : '待完成'}</span><span class="task-priority ${task.priority === '高優先' ? 'high' : ''}">⚑ ${escapeHtml(task.priority)}</span><span class="task-inline-actions"><button type="button" data-action="edit-task" data-id="${escapeHtml(task.id)}">編輯</button><button type="button" class="danger-action" data-action="delete-task" data-id="${escapeHtml(task.id)}">刪除</button></span></div></div></article>`).join('') : `<p class="empty-state">${user ? '目前沒有待辦事項，享受空檔吧！' : '登入後即可建立自己的待辦清單。'}</p>`;
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
  renderSchedules();
  renderTasks();
}

function subscribeToUserData(currentUser) {
  stopSchedules?.();
  stopTasks?.();
  schedules = [];
  tasks = [];
  const scheduleRef = collection(db, 'users', currentUser.uid, 'schedules');
  const taskRef = collection(db, 'users', currentUser.uid, 'tasks');
  stopSchedules = onSnapshot(query(scheduleRef, where('uid', '==', currentUser.uid)), snapshot => {
    schedules = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    renderSchedules();
  }, error => showStatus(getErrorMessage(error), 'error'));
  stopTasks = onSnapshot(query(taskRef, where('uid', '==', currentUser.uid)), snapshot => {
    tasks = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    renderTasks();
  }, error => showStatus(getErrorMessage(error), 'error'));
}

document.getElementById('sign-in-button').addEventListener('click', async () => {
  try { await signInWithPopup(auth, provider); }
  catch (error) { showStatus(getErrorMessage(error), 'error'); }
});
async function handleSignOut() {
  try { await signOut(auth); showStatus('已安全登出。'); }
  catch (error) { showStatus(getErrorMessage(error), 'error'); }
}
document.getElementById('sign-out-button').addEventListener('click', handleSignOut);
document.getElementById('top-sign-out').addEventListener('click', handleSignOut);
onAuthStateChanged(auth, currentUser => {
  user = currentUser;
  updateProfile();
  if (user) subscribeToUserData(user);
  else {
    stopSchedules?.(); stopTasks?.();
    schedules = []; tasks = [];
  }
  render();
});

document.getElementById('open-schedule').addEventListener('click', () => openModal(scheduleModal, scheduleForm, 'schedule-modal-title'));
document.getElementById('add-task').addEventListener('click', () => openModal(taskModal, taskForm, 'task-modal-title'));
document.getElementById('add-task-row').addEventListener('click', () => openModal(taskModal, taskForm, 'task-modal-title'));
document.getElementById('close-schedule-modal').addEventListener('click', () => closeModal(scheduleModal));
document.getElementById('close-task-modal').addEventListener('click', () => closeModal(taskModal));
for (const modal of [scheduleModal, taskModal]) {
  modal.addEventListener('click', event => { if (event.target === modal) closeModal(modal); });
}
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { closeModal(scheduleModal); closeModal(taskModal); }
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
  try {
    const id = String(data.get('id') || '');
    if (id) await updateDoc(doc(db, 'users', user.uid, 'schedules', id), payload);
    else await addDoc(collection(db, 'users', user.uid, 'schedules'), { ...payload, createdAt: serverTimestamp() });
    closeModal(scheduleModal);
    showStatus(id ? '行程已更新。' : '行程已新增。');
  } catch (error) { showStatus(getErrorMessage(error), 'error'); }
});

taskForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!user) { showStatus('請先使用 Google 登入，才能儲存待辦。', 'error'); return; }
  const data = new FormData(taskForm);
  const payload = {
    uid: user.uid,
    title: String(data.get('title')).trim(),
    date: String(data.get('date')),
    priority: String(data.get('priority')),
    completed: false,
    updatedAt: serverTimestamp()
  };
  try {
    const id = String(data.get('id') || '');
    if (id) {
      const existing = tasks.find(task => task.id === id);
      await updateDoc(doc(db, 'users', user.uid, 'tasks', id), { ...payload, completed: Boolean(existing?.completed) });
    } else await addDoc(collection(db, 'users', user.uid, 'tasks'), { ...payload, createdAt: serverTimestamp() });
    closeModal(taskModal);
    showStatus(String(data.get('id')) ? '待辦已更新。' : '待辦已新增。');
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
  if (button.dataset.action === 'edit-task') openModal(taskModal, taskForm, 'task-modal-title', task);
  if (button.dataset.action === 'delete-task' && confirm(`要刪除「${task.title}」這件待辦嗎？`)) {
    try { await deleteDoc(doc(db, 'users', user.uid, 'tasks', task.id)); showStatus('待辦已刪除。'); }
    catch (error) { showStatus(getErrorMessage(error), 'error'); }
  }
});

selectedDate.addEventListener('change', render);
document.querySelectorAll('.nav-item[data-section]').forEach(link => link.addEventListener('click', () => {
  document.querySelectorAll('.nav-item[data-section]').forEach(item => item.classList.toggle('active', item === link));
}));
render();
