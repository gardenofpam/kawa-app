import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    publicDir: false,
    build: {
        outDir: 'www',
        emptyOutDir: false,
        rollupOptions: {
            input: {
                app: 'resources/js/main.jsx',
            },
            output: {
                entryFileNames: 'js/app.js',
                chunkFileNames: 'js/[name].js',
                assetFileNames: 'css/[name][extname]',
            },
        },
    },
});