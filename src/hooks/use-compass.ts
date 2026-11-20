import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import {
  compassApi,
  type CompassSnapshot,
  type GoalInput,
  type HabitInput,
  type HabitPatch,
  type RetroInput,
  type ReviewInput,
} from "@/lib/api/compass";
import type { IsoDay } from "@/lib/compass/dates";
import { buildModel, withLog } from "@/lib/compass/model";
import { errorMessage } from "@/lib/errors";
import { queryKeys } from "@/lib/query-client.ts";

const KEY = queryKeys.compass.all;

const browserZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

/** The snapshot plus everything derived from it. Saves the browser's timezone once if it changed. */
export function useCompass() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: KEY, queryFn: () => compassApi.get() });
  const synced = useRef(false);

  useEffect(() => {
    const snap = query.data;
    if (!snap || synced.current) return;
    synced.current = true;
    const zone = browserZone();
    if (snap.timezone !== zone) {
      void compassApi
        .settings({ timezone: zone })
        .then(() => client.invalidateQueries({ queryKey: KEY }))
        .catch(() => {});
    }
  }, [query.data, client]);

  const model = useMemo(() => (query.data ? buildModel(query.data) : null), [query.data]);
  return { ...query, model };
}

/** Tick, untick or set an amount. The screen updates at once; a failed save is undone with a toast. */
export function useLogHabit() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: { habitId: string; day: IsoDay; value: number }) => compassApi.log(v),
    onMutate: async (v) => {
      await client.cancelQueries({ queryKey: KEY });
      const prev = client.getQueryData<CompassSnapshot>(KEY);
      if (prev) client.setQueryData(KEY, withLog(prev, v.habitId, v.day, v.value));
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) client.setQueryData(KEY, ctx.prev);
      toast.error(errorMessage(err, "Couldn't save that check-in. It's been undone."));
    },
  });
}

export function useCompassActions() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: KEY });
  const fail = (fallback: string) => (err: unknown) => toast.error(errorMessage(err, fallback));

  return {
    createGoal: useMutation({
      mutationFn: (input: GoalInput) => compassApi.createGoal(input),
      onSuccess: refresh,
      onError: fail("Couldn't create that goal."),
    }),
    updateGoal: useMutation({
      mutationFn: ({ id, input }: { id: string; input: GoalInput }) =>
        compassApi.updateGoal(id, input),
      onSuccess: refresh,
      onError: fail("Couldn't save the goal."),
    }),
    dropGoal: useMutation({
      mutationFn: (id: string) => compassApi.dropGoal(id),
      onSuccess: refresh,
      onError: fail("Couldn't drop the goal."),
    }),
    setMilestone: useMutation({
      mutationFn: ({ id, done }: { id: string; done: boolean }) =>
        compassApi.setMilestone(id, done),
      onMutate: ({ id, done }) => {
        const prev = client.getQueryData<CompassSnapshot>(KEY);
        if (prev) {
          client.setQueryData<CompassSnapshot>(KEY, {
            ...prev,
            goals: prev.goals.map((g) => ({
              ...g,
              milestones: g.milestones.map((m) => (m.id === id ? { ...m, done } : m)),
            })),
          });
        }
        return { prev };
      },
      onError: (err, _v, ctx) => {
        if (ctx?.prev) client.setQueryData(KEY, ctx.prev);
        toast.error(errorMessage(err, "Couldn't update the milestone."));
      },
      onSettled: refresh,
    }),
    createHabit: useMutation({
      mutationFn: (input: HabitInput) => compassApi.createHabit(input),
      onSuccess: refresh,
      onError: fail("Couldn't add that habit."),
    }),
    updateHabit: useMutation({
      mutationFn: ({ id, patch }: { id: string; patch: HabitPatch }) =>
        compassApi.updateHabit(id, patch),
      onSuccess: refresh,
      onError: fail("Couldn't save the habit."),
    }),
    deleteHabit: useMutation({
      mutationFn: (id: string) => compassApi.deleteHabit(id),
      onSuccess: refresh,
      onError: fail("Couldn't delete the habit."),
    }),
  };
}

/** Switch weeks between Monday and Sunday starts. */
export function useSetWeekStart() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (weekStart: 0 | 1) => compassApi.settings({ weekStart }),
    onSuccess: () => client.invalidateQueries({ queryKey: KEY }),
    onError: (err) => toast.error(errorMessage(err, "Couldn't change the week start.")),
  });
}

/** A past quarter (read-only) or the next one while planning is open. */
export function useQuarter(id: string) {
  return useQuery({
    queryKey: [...KEY, "quarter", id],
    queryFn: () => compassApi.quarter(id),
    retry: false,
  });
}

export function useSaveReview() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ReviewInput) => compassApi.saveReview(input),
    onSuccess: (_r, input) =>
      client.setQueryData<CompassSnapshot>(KEY, (prev) =>
        prev
          ? {
              ...prev,
              rhythm: {
                ...prev.rhythm,
                review: { moved: "", blocked: "", change: "", ...input.answers },
              },
            }
          : prev,
      ),
    onError: (err) => toast.error(errorMessage(err, "Couldn't save the review.")),
  });
}

export function useCloseQuarter() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: RetroInput) => compassApi.closeQuarter(input),
    onSuccess: () => client.invalidateQueries({ queryKey: KEY }),
    onError: (err) => toast.error(errorMessage(err, "Couldn't close the quarter.")),
  });
}
