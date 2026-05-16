"use client";

import * as React from "react";

export function useStreamingText(text: string | null, speed = 18) {
  const [streamedText, setStreamedText] = React.useState("");

  React.useEffect(() => {
    if (!text) {
      setStreamedText("");
      return;
    }

    setStreamedText("");
    let index = 0;

    const interval = window.setInterval(() => {
      index += 1;
      setStreamedText(text.slice(0, index));

      if (index >= text.length) {
        window.clearInterval(interval);
      }
    }, speed);

    return () => window.clearInterval(interval);
  }, [text, speed]);

  return streamedText;
}
