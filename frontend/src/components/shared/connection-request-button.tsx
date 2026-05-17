"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { mindmatchApi } from "@/lib/api/mindmatch";
import type { UserConnection } from "@/lib/api/types";

type ConnectionRequestButtonProps = {
  targetProfileId?: string | null;
  initialConnection?: UserConnection | null;
  idleLabel?: string;
  className?: string;
  variant?: "default" | "secondary" | "ghost" | "outline" | "destructive";
  disabled?: boolean;
  onSuccess?: (connection: UserConnection) => void;
};

export function ConnectionRequestButton({
  targetProfileId,
  initialConnection = null,
  idleLabel = "Request connection",
  className,
  variant = "outline",
  disabled = false,
  onSuccess,
}: ConnectionRequestButtonProps) {
  const queryClient = useQueryClient();
  const [connection, setConnection] = React.useState<UserConnection | null>(initialConnection);

  React.useEffect(() => {
    setConnection(initialConnection);
  }, [initialConnection]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!targetProfileId) {
        throw new Error("This user is missing a profile id.");
      }
      return mindmatchApi.requestConnection({ target_profile_id: targetProfileId });
    },
    onSuccess: (result) => {
      setConnection(result);
      queryClient.invalidateQueries({ queryKey: ["connections"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      onSuccess?.(result);
    },
  });

  const isAccepted = connection?.status === "accepted";
  const isPending = connection?.status === "pending";

  return (
    <Button
      type="button"
      variant={isAccepted ? "secondary" : variant}
      className={className}
      disabled={disabled || !targetProfileId || isAccepted || mutation.isPending}
      onClick={() => mutation.mutate()}
    >
      {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <MessageCircle className="size-4" />}
      {isAccepted ? "Connected" : isPending ? "Request sent" : idleLabel}
    </Button>
  );
}
