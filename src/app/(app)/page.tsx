import { Card } from "@/components/ui";

export default function TodayPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">Today</h1>
      <Card>
        <p className="text-ink-muted">Nothing printing yet. Start print arrives in milestone M4.</p>
      </Card>
    </div>
  );
}
