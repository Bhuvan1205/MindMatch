"use client";

import { Mic } from "lucide-react";
import { motion } from "framer-motion";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const waveformBars = [18, 30, 22, 38, 26, 34, 20];

export function VoicePanel({
  isRecording,
  onRecordingChange,
  transcriptPreview,
}: {
  isRecording: boolean;
  onRecordingChange: (isRecording: boolean) => void;
  transcriptPreview: string;
}) {
  return (
    <div className="rounded-lg border bg-card/66 p-4 shadow-sm backdrop-blur-xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button
            type="button"
            size="icon"
            variant={isRecording ? "default" : "secondary"}
            aria-pressed={isRecording}
            aria-label="Push to talk"
            className={cn("relative size-12 rounded-full", isRecording && "shadow-soft")}
            onMouseDown={() => onRecordingChange(true)}
            onMouseUp={() => onRecordingChange(false)}
            onMouseLeave={() => onRecordingChange(false)}
            onTouchStart={() => onRecordingChange(true)}
            onTouchEnd={() => onRecordingChange(false)}
          >
            {isRecording ? (
              <span className="absolute inset-0 animate-ping rounded-full bg-primary/30" />
            ) : null}
            <Mic className="relative size-5" />
          </Button>

          <div>
            <p className="text-sm font-medium">{isRecording ? "Listening..." : "Push to talk"}</p>
            <p className="text-xs text-muted-foreground">Submit with typed text</p>
          </div>
        </div>

        <Waveform isActive={isRecording} />
      </div>

      <div className="mt-4 rounded-md border bg-background/62 px-3 py-2 text-sm text-muted-foreground">
        {transcriptPreview.trim() ? transcriptPreview : "Live transcription preview appears here."}
      </div>
    </div>
  );
}

function Waveform({ isActive }: { isActive: boolean }) {
  return (
    <div className="flex h-10 items-center justify-center gap-1.5 rounded-full bg-secondary/70 px-4">
      {waveformBars.map((height, index) => (
        <motion.span
          key={`${height}-${index}`}
          className="w-1 rounded-full bg-primary/70"
          animate={{
            height: isActive ? [10, height, 12] : 10,
            opacity: isActive ? [0.45, 1, 0.55] : 0.35,
          }}
          transition={{
            duration: 0.8,
            repeat: isActive ? Infinity : 0,
            delay: index * 0.05,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}
