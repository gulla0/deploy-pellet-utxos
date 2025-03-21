// src/pages/_app.tsx
import "@/styles/globals.css";
import "@meshsdk/react/styles.css";
import type { AppProps } from "next/app";
import { MeshProvider } from "@meshsdk/react";
import Navigation from "@/components/Navigation";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <MeshProvider>
      <Navigation />
      <Component {...pageProps} />
    </MeshProvider>
  );
}
