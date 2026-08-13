let interval = null;
let endTime = null;
let label = '';

self.onmessage = function(e) {
  const { type, secs, timerLabel } = e.data;

  if (type === 'start') {
    label = timerLabel;
    endTime = Date.now() + (secs * 1000);
    if (interval) clearInterval(interval);
    interval = setInterval(() => {
      const remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));
      self.postMessage({ type: 'tick', remaining, label });
      if (remaining <= 0) {
        clearInterval(interval);
        self.postMessage({ type: 'done', label });
      }
    }, 1000);
  }

  if (type === 'pause') {
    if (interval) clearInterval(interval);
    self.postMessage({ type: 'paused' });
  }

  if (type === 'stop') {
    if (interval) clearInterval(interval);
    endTime = null;
  }
};