const BASE = '/api';

export const api = {
    get: (path) => fetch(`${BASE}${path}`).then(r => r.json()),
    post: (path, body) => fetch(`${BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').content },
        body: JSON.stringify(body),
    }).then(r => r.json()),
    patch: (path, body) => fetch(`${BASE}${path}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').content },
        body: JSON.stringify(body),
    }).then(r => r.json()),
    delete: (path) => fetch(`${BASE}${path}`, { method: 'DELETE' }).then(r => r.json()),
};