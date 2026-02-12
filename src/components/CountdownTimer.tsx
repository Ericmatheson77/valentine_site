import { useState, useEffect } from "react";
import { Heart } from "lucide-react";

interface CountdownTimerProps {
  targetDate: string; // e.g. "2026-05-29"
  label?: string;
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function calculateTimeLeft(target: Date): TimeLeft {
  const now = new Date();
  const diff = target.getTime() - now.getTime();

  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  }

  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

export default function CountdownTimer({
  targetDate,
  label = "Forever",
}: CountdownTimerProps) {
  // May 29th 11:00 AM MDT = 17:00 UTC (MDT is UTC-6)
  const target = new Date(`${targetDate}T17:00:00Z`);
  const [timeLeft, setTimeLeft] = useState<TimeLeft>(calculateTimeLeft(target));

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft(target));
    }, 1000);

    return () => clearInterval(timer);
  }, [targetDate]);

  const isComplete =
    timeLeft.days === 0 &&
    timeLeft.hours === 0 &&
    timeLeft.minutes === 0 &&
    timeLeft.seconds === 0;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-white/70 border-b border-rose-100 shadow-sm">
      <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-center gap-2">
        <Heart className="w-4 h-4 text-rose-400 fill-rose-400 shrink-0" />

        {isComplete ? (
          <span className="text-rose-500 font-display text-sm font-semibold tracking-wide">
            Today is the day!
          </span>
        ) : (
          <div className="flex items-center gap-1 text-sm tracking-wide">
            <CountdownSegment value={timeLeft.days} unit="Days" />
            <Separator />
            <CountdownSegment value={timeLeft.hours} unit="Hrs" />
            <Separator />
            <CountdownSegment value={timeLeft.minutes} unit="Min" />
            <Separator />
            <CountdownSegment value={timeLeft.seconds} unit="Sec" />
            <span className="ml-1.5 text-rose-400 font-medium text-xs">
              until {label}
            </span>
          </div>
        )}

        <Heart className="w-4 h-4 text-rose-400 fill-rose-400 shrink-0" />
      </div>
    </header>
  );
}

function CountdownSegment({
  value,
  unit,
}: {
  value: number;
  unit: string;
}) {
  return (
    <span className="flex items-baseline gap-0.5">
      <span className="font-display font-bold text-rose-600 tabular-nums">
        {pad(value)}
      </span>
      <span className="text-rose-400/80 text-[10px] font-medium uppercase">
        {unit}
      </span>
    </span>
  );
}

function Separator() {
  return <span className="text-rose-300 mx-0.5">:</span>;
}
