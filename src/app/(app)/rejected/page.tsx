import { ColumnPage } from "@/components/ColumnPage";

export const metadata = { title: "Auto-rejected · Kargo Hiring" };
export const maxDuration = 300;

export default function RejectedPage() {
  return <ColumnPage column="auto_rejected" />;
}
