import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// In development, the React app runs on :5173 and forwards API and socket traffic to the server on :5000.
// `vite --mode phone` serves it over https with a self-signed certificate, because phones only allow
// location on https pages. Plain `vite` stays http.
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'phone' ? [basicSsl()] : [])],
  server: {
    host: true, // lets phones on the same Wi-Fi open the app for testing
    proxy: {
      '/api': 'http://localhost:5000',
      '/socket.io': { target: 'http://localhost:5000', ws: true },
    },
  },
}));
