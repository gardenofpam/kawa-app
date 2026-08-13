function isNativeAndroid() {
  return window?.Capacitor?.isNativePlatform?.() === true && window?.Capacitor?.getPlatform?.() === "android";
}

function getNativeTimer() {
  return window?.Capacitor?.Plugins?.TimerPlugin;
}

function getLocalNotifications() {
  return window?.Capacitor?.Plugins?.LocalNotifications;
}

function hashId(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) || 1;
}

function getReminderId(kind, itemId, dateStr) {
  return hashId(`${kind}:${itemId}:${dateStr}`);
}

const WAKE_UP_REMINDER_ID = hashId("profile:wake-up");
const WAKE_UP_CHANNEL_ID = "kawa_wake_up_alarm_v2";
const WAKE_UP_SCHEDULE_DAYS = 32;

function buildDateTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const date = new Date(`${dateStr}T${timeStr}:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseTimeParts(timeStr) {
  if (!timeStr || typeof timeStr !== "string") return null;
  const [hourStr, minuteStr] = timeStr.split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function getTodayDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getTaskReminder(task, dateStr) {
  if (!task?.id || !task?.text || !task?.scheduledTime || task.done) return null;
  const at = buildDateTime(dateStr, task.scheduledTime);
  if (!at || at.getTime() <= Date.now()) return null;
  return {
    id: getReminderId("task", task.id, dateStr),
    title: "Task Reminder",
    body: task.text,
    schedule: { at },
    extra: { type: "task", itemId: task.id, date: dateStr },
  };
}

function getJoyReminder(session) {
  if (!session?.id || !session?.text || !session?.scheduledDay || !session?.scheduledTime || session.done) return null;
  const at = buildDateTime(session.scheduledDay, session.scheduledTime);
  if (!at || at.getTime() <= Date.now()) return null;
  return {
    id: getReminderId("joy", session.id, session.scheduledDay),
    title: "Joy Session",
    body: session.text,
    schedule: { at },
    extra: { type: "joy", itemId: session.id, date: session.scheduledDay },
  };
}

function getRecurringTaskReminder(task) {
  if (!task?.id || !task?.text || !task?.scheduledTime || task.repeat !== 'daily') return null;
  const parts = parseTimeParts(task.scheduledTime);
  if (!parts) return null;
  return {
    id: getReminderId("task", task.id, 'daily'),
    title: "Task Reminder",
    body: task.text,
    schedule: { on: { hour: parts.hour, minute: parts.minute }, repeats: true },
    extra: { type: "task", itemId: task.id, recurring: true },
  };
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toLocalDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getWakeUpReminder(profile, date) {
  const time = parseTimeParts(profile?.wakeUpTime);
  if (!time) return null;
  const dateStr = toLocalDateStr(date);
  const at = buildDateTime(dateStr, profile.wakeUpTime);
  if (!at || at.getTime() <= Date.now()) return null;
  return {
    id: getReminderId("wake-up", "profile", dateStr),
    title: "Wake Up",
    body: "Time to start your day.",
    channelId: WAKE_UP_CHANNEL_ID,
    smallIcon: "ic_stat_kawa",
    ongoing: true,
    autoCancel: true,
    schedule: {
      at,
      allowWhileIdle: true,
    },
    extra: { type: "wake-up", date: dateStr },
  };
}

function getWakeUpReminders(profile) {
  if (!parseTimeParts(profile?.wakeUpTime)) return [];
  const today = new Date();
  const reminders = [];
  for (let dayOffset = 0; dayOffset < WAKE_UP_SCHEDULE_DAYS; dayOffset += 1) {
    const reminder = getWakeUpReminder(profile, addDays(today, dayOffset));
    if (reminder) reminders.push(reminder);
  }
  return reminders;
}

function getWakeUpReminderIds() {
  const today = new Date();
  const ids = [WAKE_UP_REMINDER_ID];
  for (let dayOffset = -1; dayOffset <= WAKE_UP_SCHEDULE_DAYS; dayOffset += 1) {
    const dateStr = toLocalDateStr(addDays(today, dayOffset));
    ids.push(getReminderId("wake-up", "profile", dateStr));
  }
  return ids;
}

function collectReminderIds(state) {
  const ids = [...getWakeUpReminderIds()];
  Object.entries(state?.tasks || {}).forEach(([dateStr, tasks]) => {
    (tasks || []).forEach((task) => {
      if (task?.id) ids.push(getReminderId("task", task.id, dateStr));
    });
  });
  const todayStr = getTodayDateStr();
  (state?.recurringTasks || []).forEach((task) => {
    if (task?.id && task.repeat === 'daily') {
      // only include recurring reminders that start on or before today
      if (!task.startDate || task.startDate <= todayStr) ids.push(getReminderId("task", task.id, 'daily'));
    }
  });
  Object.values(state?.joySession?.history || {}).forEach((sessions) => {
    (sessions || []).forEach((session) => {
      if (session?.id && session?.scheduledDay) {
        ids.push(getReminderId("joy", session.id, session.scheduledDay));
      }
    });
  });
  return [...new Set(ids)];
}

function collectScheduledReminders(state) {
  const reminders = [];
  reminders.push(...getWakeUpReminders(state?.profile));
  Object.entries(state?.tasks || {}).forEach(([dateStr, tasks]) => {
    (tasks || []).forEach((task) => {
      const reminder = getTaskReminder(task, dateStr);
      if (reminder) reminders.push(reminder);
    });
  });
  const today = getTodayDateStr();
  (state?.recurringTasks || []).forEach((task) => {
    if (task?.repeat === 'daily' && task.startDate && task.startDate > today) return;
    const reminder = getRecurringTaskReminder(task);
    if (reminder) reminders.push(reminder);
  });
  Object.values(state?.joySession?.history || {}).forEach((sessions) => {
    (sessions || []).forEach((session) => {
      const reminder = getJoyReminder(session);
      if (reminder) reminders.push(reminder);
    });
  });
  return reminders;
}

async function ensureDisplayPermission(promptIfNeeded = false) {
  const notifications = getLocalNotifications();
  if (!isNativeAndroid() || !notifications) return false;

  try {
    const status = await notifications.checkPermissions();
    if (status.display === "granted") return true;
    if (!promptIfNeeded) return false;
    const requested = await notifications.requestPermissions();
    return requested.display === "granted";
  } catch (error) {
    console.log("notification permission error:", error);
    return false;
  }
}

async function ensureWakeUpAlarmChannel() {
  const notifications = getLocalNotifications();
  if (!isNativeAndroid() || !notifications) return;

  try {
    const native = getNativeTimer();
    if (native?.ensureWakeUpAlarmChannel) {
      await native.ensureWakeUpAlarmChannel();
      return;
    }
    await notifications.createChannel({ id: WAKE_UP_CHANNEL_ID, name: "Kawa Wake-Up Alarm", description: "Daily wake-up alarm", importance: 5, visibility: 1, vibration: true });
  } catch (error) {
    console.log("ensureWakeUpAlarmChannel error:", error);
  }
}

async function checkExactAlarmPermission() {
  const notifications = getLocalNotifications();
  if (!isNativeAndroid() || !notifications?.checkExactNotificationSetting) return true;
  try {
    const status = await notifications.checkExactNotificationSetting();
    return status.exact_alarm === "granted";
  } catch (error) {
    console.log("exact alarm permission check error:", error);
    return false;
  }
}

export async function getWakeUpAlarmStatus() {
  if (!isNativeAndroid() || !getLocalNotifications()) {
    return { supported: false, display: false, exact: false, ready: false };
  }
  await ensureWakeUpAlarmChannel();
  const display = await ensureDisplayPermission(false);
  const exact = await checkExactAlarmPermission();
  return { supported: true, display, exact, ready: display && exact };
}

export async function enableWakeUpAlarm() {
  const notifications = getLocalNotifications();
  if (!isNativeAndroid() || !notifications) {
    return { supported: false, display: false, exact: false, ready: false };
  }

  const display = await ensureDisplayPermission(true);
  await ensureWakeUpAlarmChannel();
  let exact = await checkExactAlarmPermission();

  if (display && !exact && notifications.changeExactNotificationSetting) {
    try {
      await notifications.changeExactNotificationSetting();
      exact = await checkExactAlarmPermission();
    } catch (error) {
      console.log("exact alarm permission request error:", error);
    }
  }

  return { supported: true, display, exact, ready: display && exact };
}

export async function requestPermission() {
  await ensureDisplayPermission(true);
}

export async function startTimerNotification(label, secs) {
  try {
    const native = getNativeTimer();
    if (isNativeAndroid() && native && secs > 0) {
      await native.startTimer({ label, secs });
    }
  } catch (error) {
    console.log("startTimerNotification error:", error);
  }
}

export async function pauseTimerNotification() {
  try {
    const native = getNativeTimer();
    if (isNativeAndroid() && native) {
      await native.pauseTimer();
    }
  } catch (error) {
    console.log("pauseTimerNotification error:", error);
  }
}

export async function clearTimerNotification() {
  try {
    const native = getNativeTimer();
    if (isNativeAndroid() && native) {
      await native.stopTimer();
    }
  } catch (error) {
    console.log("clearTimerNotification error:", error);
  }
}

export async function cancelScheduledReminders(ids) {
  const notifications = getLocalNotifications();
  if (!isNativeAndroid() || !notifications || !ids?.length) return;

  try {
    await notifications.cancel({ notifications: ids.map((id) => ({ id })) });
  } catch (error) {
    console.log("cancelScheduledReminders error:", error);
  }
}

export async function scheduleScheduledReminders(reminders) {
  const notifications = getLocalNotifications();
  if (!isNativeAndroid() || !notifications || !reminders?.length) return;

  const allowed = await ensureDisplayPermission(false);
  if (!allowed) return;

  try {
    if (reminders.some((reminder) => reminder?.extra?.type === "wake-up")) {
      await ensureWakeUpAlarmChannel();
    }
    await notifications.schedule({ notifications: reminders });
  } catch (error) {
    console.log("scheduleScheduledReminders error:", error);
  }
}

export async function reconcileScheduledReminders(state) {
  const notifications = getLocalNotifications();
  if (!isNativeAndroid() || !notifications) return;

  const allowed = await ensureDisplayPermission(false);
  if (!allowed) return;

  const ids = collectReminderIds(state);
  const reminders = collectScheduledReminders(state);

  try {
    if (reminders.some((reminder) => reminder?.extra?.type === "wake-up")) {
      await ensureWakeUpAlarmChannel();
    }
    if (ids.length) {
      await notifications.cancel({ notifications: ids.map((id) => ({ id })) });
    }
    if (reminders.length) {
      await notifications.schedule({ notifications: reminders });
    }
  } catch (error) {
    console.log("reconcileScheduledReminders error:", error);
  }
}
