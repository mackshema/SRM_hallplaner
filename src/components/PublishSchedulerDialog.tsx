/**
 * PublishSchedulerDialog.tsx
 * Shared publish dialog for Internal (ExamSession) and Anna University plans.
 *
 *  - "Publish now" or "Schedule" (a future Publish On date & time, IST)
 *  - Exam timing: exam date + session (from the plan), start and end time (IST)
 *  - Absentee upload window (minutes after exam start; blank = Settings default)
 *
 * Validation: publish time not in the past, end after start, and publishing
 * happens before the exam starts. The server enforces the same rules.
 */

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Calendar, Clock, Zap, Timer } from "lucide-react";

export interface PublishDialogResult {
  publishNow: boolean;
  /** null when publishing now */
  publishAt: Date | null;
  /** "HH:MM" IST */
  startTime: string;
  endTime: string;
  /** null = use the Settings default */
  absentee_window_minutes: number | null;
}

interface PublishSchedulerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (result: PublishDialogResult) => void;
  currentPublishAt?: string | null;
  planLabel?: string;
  isLoading?: boolean;
  /** Plan's exam date (YYYY-MM-DD) and session - shown, not editable here */
  examDate?: string;
  session?: "FN" | "AN" | string;
  currentStartAt?: string | null;
  currentEndAt?: string | null;
  currentWindowMinutes?: number | null;
  defaultWindowMinutes?: number;
}

const IST = "Asia/Kolkata";

/** Date -> "YYYY-MM-DDTHH:MM" as wall-clock time in IST (for datetime-local inputs). */
const toISTInput = (date: Date): string => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(date).map((p) => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}`;
};

/** "YYYY-MM-DDTHH:MM" (IST wall clock) -> Date. IST has no DST, so +05:30 is exact. */
const fromISTInput = (value: string): Date => new Date(`${value}:00+05:30`);

const toISTTime = (iso?: string | null) => (iso ? toISTInput(new Date(iso)).slice(11) : "");

export const formatDisplayIST = (isoOrDate: string | Date | null): string => {
  if (!isoOrDate) return "";
  return new Date(isoOrDate).toLocaleString("en-IN", {
    timeZone: IST, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true,
  });
};

const DEFAULT_TIMES: Record<string, [string, string]> = { FN: ["09:30", "12:30"], AN: ["13:30", "16:30"] };

export const PublishSchedulerDialog: React.FC<PublishSchedulerDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  currentPublishAt,
  planLabel,
  isLoading = false,
  examDate,
  session,
  currentStartAt,
  currentEndAt,
  currentWindowMinutes,
  defaultWindowMinutes = 120,
}) => {
  const [mode, setMode] = useState<"now" | "schedule">("now");
  const [dateTimeValue, setDateTimeValue] = useState<string>("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [windowMinutes, setWindowMinutes] = useState<string>("");
  const [error, setError] = useState<string>("");

  // Pre-fill from the plan each time the dialog opens
  useEffect(() => {
    if (!isOpen) return;
    setError("");
    if (currentPublishAt) {
      setMode("schedule");
      setDateTimeValue(toISTInput(new Date(currentPublishAt)));
    } else {
      setMode("now");
      setDateTimeValue(toISTInput(new Date(Date.now() + 60 * 60 * 1000)));
    }
    const [defStart, defEnd] = DEFAULT_TIMES[session || "FN"] || DEFAULT_TIMES.FN;
    setStartTime(toISTTime(currentStartAt) || defStart);
    setEndTime(toISTTime(currentEndAt) || defEnd);
    setWindowMinutes(currentWindowMinutes ? String(currentWindowMinutes) : "");
  }, [isOpen, currentPublishAt, currentStartAt, currentEndAt, currentWindowMinutes, session]);

  const examStart = examDate && startTime ? fromISTInput(`${examDate}T${startTime}`) : null;

  const handleConfirm = () => {
    setError("");

    if (!startTime || !endTime) return setError("Exam start and end time are required.");
    if (endTime <= startTime) return setError("Exam end time must be after the start time.");

    let publishAt: Date | null = null;
    if (mode === "schedule") {
      if (!dateTimeValue) return setError("Please select a date and time.");
      publishAt = fromISTInput(dateTimeValue);
      if (isNaN(publishAt.getTime())) return setError("Invalid date/time.");
      if (publishAt <= new Date()) return setError("Publish time must be in the future.");
    }
    const publishMoment = publishAt || new Date();
    if (examStart && publishMoment >= examStart) {
      return setError(`The plan must be published before the exam starts (${formatDisplayIST(examStart)}).`);
    }

    let minutes: number | null = null;
    if (windowMinutes.trim()) {
      minutes = Number(windowMinutes);
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
        return setError("Absentee upload window must be a whole number of minutes (1-1440).");
      }
    }

    onConfirm({ publishNow: mode === "now", publishAt, startTime, endTime, absentee_window_minutes: minutes });
  };

  const minDatetime = toISTInput(new Date(Date.now() + 60_000));

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Clock className="h-5 w-5 text-blue-600" />
            Publish Plan
          </DialogTitle>
          {planLabel && (
            <DialogDescription className="text-sm text-slate-500">
              Plan: <span className="font-semibold text-slate-700">{planLabel}</span>
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="py-2 space-y-5">
          {/* ── When to publish ── */}
          <div className="grid grid-cols-2 gap-3">
            {([
              { key: "now", icon: Zap, title: "Publish Now", note: "Immediately visible" },
              { key: "schedule", icon: Calendar, title: "Schedule", note: "Set a future date & time" },
            ] as const).map(({ key, icon: Icon, title, note }) => (
              <button
                key={key}
                type="button"
                onClick={() => setMode(key)}
                className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 p-4 transition-all cursor-pointer
                  ${mode === key ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 hover:border-slate-300 text-slate-600"}`}
              >
                <Icon className={`h-5 w-5 ${mode === key ? "text-blue-600" : "text-slate-400"}`} />
                <span className="text-sm font-semibold">{title}</span>
                <span className="text-xs text-center opacity-75">{note}</span>
              </button>
            ))}
          </div>

          {mode === "schedule" && (
            <div className="space-y-1.5 rounded-lg border border-blue-100 bg-slate-50 p-4">
              <Label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                Publish On <span className="text-slate-400 font-normal">(IST)</span>
              </Label>
              <input
                type="datetime-local"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                value={dateTimeValue}
                min={minDatetime}
                onChange={(e) => { setDateTimeValue(e.target.value); setError(""); }}
              />
              {dateTimeValue && (
                <p className="text-xs text-slate-500">
                  Will go live on: <span className="font-medium text-slate-700">{formatDisplayIST(fromISTInput(dateTimeValue))}</span>
                </p>
              )}
            </div>
          )}

          {/* ── Exam timing ── */}
          <div className="space-y-3 rounded-lg border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" /> Exam Timing <span className="text-slate-400 font-normal">(IST)</span>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">Exam Date</Label>
                <Input value={examDate || ""} disabled className="h-9 bg-slate-50" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">Session</Label>
                <Input value={session === "AN" ? "AN (Afternoon)" : session === "FN" ? "FN (Forenoon)" : session || ""} disabled className="h-9 bg-slate-50" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="exam-start" className="text-xs text-slate-500">Start Time *</Label>
                <Input id="exam-start" type="time" value={startTime} onChange={(e) => { setStartTime(e.target.value); setError(""); }} className="h-9" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="exam-end" className="text-xs text-slate-500">End Time *</Label>
                <Input id="exam-end" type="time" value={endTime} onChange={(e) => { setEndTime(e.target.value); setError(""); }} className="h-9" />
              </div>
            </div>
            <p className="text-[11px] text-slate-400">Date and session come from the seating plan. The exam shows as Live to invigilators between start and end.</p>
          </div>

          {/* ── Absentee upload window ── */}
          <div className="space-y-1.5 rounded-lg border border-slate-200 p-4">
            <Label htmlFor="abs-window" className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
              <Timer className="h-3.5 w-3.5" /> Absentee Upload Window
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="abs-window"
                type="number"
                min={1}
                max={1440}
                placeholder={String(defaultWindowMinutes)}
                value={windowMinutes}
                onChange={(e) => { setWindowMinutes(e.target.value); setError(""); }}
                className="h-9 w-28"
              />
              <span className="text-sm text-slate-500">minutes after the exam starts</span>
            </div>
            <p className="text-[11px] text-slate-400">Leave blank to use the default from Settings ({defaultWindowMinutes} min).</p>
          </div>

          {error && (
            <p className="text-sm text-red-600 font-medium flex items-center gap-1.5">
              <span>⚠</span> {error}
            </p>
          )}

          <p className="text-xs text-slate-400 leading-relaxed">
            Students and faculty see their seat/duty details only once the plan is published and the scheduled time has passed.
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={isLoading} className="bg-blue-600 hover:bg-blue-700 text-white min-w-[120px]">
            {isLoading ? "Saving..." : mode === "now" ? "Publish Now" : "Schedule Publish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/** Request body for PUT /api/plans/:planType/:planId/publish */
export const publishRequestBody = (r: PublishDialogResult) => ({
  publish_at: r.publishNow ? null : r.publishAt?.toISOString(),
  startTime: r.startTime,
  endTime: r.endTime,
  absentee_window_minutes: r.absentee_window_minutes,
});

export default PublishSchedulerDialog;
