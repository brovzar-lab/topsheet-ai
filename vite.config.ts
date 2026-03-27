/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'));

export default defineConfig({
    plugins: [react(), tailwindcss()],
    define: {
        __APP_VERSION__: JSON.stringify(pkg.version),
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, './src'),
        },
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router')) {
                        return 'vendor-react';
                    }
                    if (id.includes('node_modules/firebase')) {
                        return 'vendor-firebase';
                    }
                    if (id.includes('node_modules/@google/generative-ai')) {
                        return 'vendor-ai';
                    }
                    if (id.includes('node_modules/@react-pdf') || id.includes('node_modules/pdfjs-dist')) {
                        return 'vendor-pdf';
                    }
                    if (id.includes('node_modules/exceljs')) {
                        return 'vendor-excel';
                    }
                    if (
                        id.includes('node_modules/@dnd-kit') ||
                        id.includes('node_modules/recharts') ||
                        id.includes('node_modules/lucide-react') ||
                        id.includes('node_modules/@tanstack') ||
                        id.includes('node_modules/zustand')
                    ) {
                        return 'vendor-ui';
                    }
                },
            },
        },
    },
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./src/test/setup.ts'],
        exclude: ['**/node_modules/**', '**/e2e/**'],
    },
});
