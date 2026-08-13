import React from 'react';
import { createRoot } from 'react-dom/client';
import KawaApp from './KawaApp';

const root = createRoot(document.getElementById('kawa-root'));
root.render(<KawaApp />);