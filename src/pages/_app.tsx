// src/pages/_app.tsx
import "@/styles/globals.css";
import "@meshsdk/react/styles.css";
import type { AppProps } from "next/app";
import { MeshProvider } from "@meshsdk/react";
import SimpleHeader from "@/components/SimpleHeader";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <MeshProvider>
      <SimpleHeader />
      <Component {...pageProps} />
    </MeshProvider>
  );
}
