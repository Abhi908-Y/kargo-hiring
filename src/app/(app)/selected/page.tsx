import { ColumnPage } from "@/components/ColumnPage";

export const metadata = { title: "Auto-selected · Kargo Hiring" };
export const maxDuration = 300;

export default function SelectedPage() {
  return <ColumnPage column="auto_selected" />;
}
